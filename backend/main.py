from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc  # 用于倒序查询数据库历史记录
from typing import Optional
from fastapi import UploadFile, File
import docx
import fitz
import io
import pandas as pd

# 🌟 针对 PDF 扫描件 OCR 兜底新增的导入
import base64
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

from agent_service import A25Agent
from database import get_db, QuizRecord, ChatHistory

# 1. 初始化应用和 Agent
app = FastAPI(title="A25 Agent API")

# 2. 配置跨域 (合并了你之前的两次跨域配置，保留最宽松的设置以防被拦截)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有域名跨域
    allow_credentials=True,
    allow_methods=["*"],  # 允许 OPTIONS, POST, GET 等所有方法
    allow_headers=["*"],  # 允许所有请求头
)

agent = A25Agent()
print("🚀 我是后端，我活得好好的！")


# 3. 数据模型
class ChatRequest(BaseModel):
    user_id: str  # 🌟 核心新增：无论是钉钉还是插件，必须传用户ID
    course_id: str  # 🌟 核心新增：当前在学哪门课（比如 "CS101" 或 "通用答疑"）
    platform: str = "web"  # 🌟 核心新增：数据来源（"chaoxing", "dingtalk", "web"）
    message: str
    page_context: Optional[dict] = None


# ✅ 唯一保留的完整做题记录模型
class QuizRecordCreate(BaseModel):
    user_id: str  # 新增：谁做的题
    course_id: str  # 新增：哪门课的题
    question: str
    options: str  # 前端把选项
    user_choice: str
    correct_answer: str
    is_correct: bool
    explanation: str = ""


# 1. 定义作业批改的接收模型
class HomeworkRequest(BaseModel):
    user_id: str
    course_id: str
    question_text: str  # 🌟 学生输入的“原题内容”
    content_type: str  # "image" (图片) 或 "text" (代码文件)
    content: str  # 图片的 Base64 编码，或者纯文本代码


# 4. 路由：核心流式接口
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    print(f"📥 [收到请求] 用户: {request.user_id}, 来源: {request.platform}, 消息: {request.message}")

    # 🌟 核心修改 1：查询历史记录时，只查当前 user_id 的日记本！
    recent_history = db.query(ChatHistory) \
        .filter(ChatHistory.user_id == request.user_id) \
        .order_by(desc(ChatHistory.id)) \
        .limit(10).all()
    recent_history.reverse()

    history_context = [{"role": h.role, "content": h.content} for h in recent_history]

    async def stream_and_save():
        full_ai_response = ""

        # 🌟 核心修改 2：把 user_id 和 course_id 传给 Agent，让大模型知道对面是谁
        async for chunk in agent.execute_stream(
                user_input=request.message,
                page_context=request.page_context,
                chat_history=history_context,
                user_id=request.user_id,  # 👈 传给大脑，用于提取该学生的画像
                course_id=request.course_id  # 👈 传给大脑，用于定位知识图谱
        ):
            full_ai_response += chunk
            yield chunk

        # 🌟 核心修改 3：保存聊天记录时，打上用户和课程的钢印
        try:
            user_record = ChatHistory(
                user_id=request.user_id,
                course_id=request.course_id,
                platform=request.platform,
                role="user",
                content=request.message
            )
            ai_record = ChatHistory(
                user_id=request.user_id,
                course_id=request.course_id,
                platform=request.platform,
                role="ai",
                content=full_ai_response
            )
            db.add_all([user_record, ai_record])
            db.commit()
            print(f"💾 [数据库] 用户 {request.user_id} 的聊天记忆已更新！")
        except Exception as e:
            db.rollback()
            print(f"❌ [数据库] 聊天记忆保存失败: {e}")

    return StreamingResponse(
        stream_and_save(),
        media_type="text/event-stream"
    )


@app.post("/api/quiz")
async def generate_quiz_endpoint(request: Request):
    data = await request.json()
    page_context = data.get("page_context")

    # 呼叫刚才写好的出题大脑
    quiz_result = await agent.generate_quiz(page_context)

    if "error" in quiz_result:
        return JSONResponse(status_code=400, content=quiz_result)

    return quiz_result


# ==========================================
# 🌟 新增：保存做题记录的 API 接口（已修复模型冲突与报错机制）
# ==========================================
@app.post("/api/save_quiz_record")
async def save_quiz_record(record: QuizRecordCreate, db: Session = Depends(get_db)):
    try:
        print(f"📥 [存题请求] 正在为用户 {record.user_id} 写入做题记录...")

        new_record = QuizRecord(
            user_id=record.user_id,  # 🌟 新增写入
            course_id=record.course_id,  # 🌟 新增写入
            question=record.question,
            options=record.options,
            user_choice=record.user_choice,
            correct_answer=record.correct_answer,
            is_correct=record.is_correct,
            explanation=record.explanation
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)

        print(f"✅ 💾 [数据库] 成功收录用户 {record.user_id} 的做题记录 (ID: {new_record.id})")
        return {"status": "success", "id": new_record.id}

    except Exception as e:
        db.rollback()
        print(f"❌ 💾 [数据库] 做题记录保存失败: {str(e)}")
        # 🌟 核心修复：抛出真实的 HTTP 500 错误，让前端知道存库失败了
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


import base64
import json
import re


# 2. 新增作业批改接口
@app.post("/api/grade_homework")
async def grade_homework_endpoint(request: HomeworkRequest):
    print(f"📝 [作业批改] 收到作业，类型: {request.content_type}")

    actual_content = request.content
    doc_obj = None

    # 1. 如果传上来的是 Word，解码它并提取文字
    if request.content_type == "docx":
        # 剥离前端传来的 Base64 头
        base64_data = request.content.split(",")[-1] if "," in request.content else request.content
        file_bytes = base64.b64decode(base64_data)
        doc_obj = docx.Document(io.BytesIO(file_bytes))
        actual_content = "\n".join([para.text for para in doc_obj.paragraphs])
        print("📄 成功从上传的 Word 中解剖出纯文本。")

    # 2. 呼叫大模型进行批改
    result_str = await agent.grade_homework(
        question_text=request.question_text,
        content_type=request.content_type,
        content=actual_content,
        course_id=request.course_id
    )

    annotated_file_b64 = None

    # 3. 🌟 核心魔法：写入原生批注（带无敌兜底机制）
    if request.content_type == "docx" and doc_obj:
        try:
            grading_data = json.loads(result_str)

            # 🧹 暴力清洗函数：去掉所有的标点符号、空格、换行，只留纯文本进行比对
            def clean_str(s):
                return re.sub(r'\W+', '', s)

            for ann in grading_data.get("annotations", []):
                target_text = ann.get("quoted_text", "")
                if not target_text: continue

                clean_target = clean_str(target_text)
                found_paragraph = None

                # 🔍 地毯式模糊搜索
                for paragraph in doc_obj.paragraphs:
                    # 跳过空行和没有内容流的段落
                    if not paragraph.text.strip() or not paragraph.runs:
                        continue

                    clean_para = clean_str(paragraph.text)
                    # 只要模糊包含，就视为锁定目标！
                    if clean_target and (clean_target in clean_para or clean_para in clean_target):
                        found_paragraph = paragraph
                        break

                comment_text = f"【{ann['error_type']}】\n{ann['explanation']}\n💡建议：{ann['suggestion']}"

                # ✅ 如果找到了原文，精准挂批注！
                if found_paragraph:
                    # python-docx 1.2.0 原生方法
                    doc_obj.add_comment(found_paragraph.runs, text=comment_text, author="A25教授", initials="AI")
                else:
                    # 🛡️ 无敌兜底：没找到原文？直接强制挂在文档有字的第一段！
                    for p in doc_obj.paragraphs:
                        if p.text.strip() and p.runs:
                            doc_obj.add_comment(p.runs, text=f"【原位置：{ann['location']}】\n" + comment_text,
                                                author="A25教授", initials="AI")
                            break

            # 打包转成 Base64 发给前端
            output_stream = io.BytesIO()
            doc_obj.save(output_stream)
            annotated_file_b64 = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + base64.b64encode(
                output_stream.getvalue()).decode("utf-8")
            print("🎉 成功将 AI 批注写入原生 Word 文档！")
        except Exception as e:
            # 🚨 观察终端，如果这里打印没有 add_comment 属性，说明库没升级！
            print(f"⚠️ 写入 Word 批注失败: {e}")

    return {
        "status": "success",
        "grading_result": result_str,
        "annotated_file": annotated_file_b64
    }

# 3. 🌟 终极文档解析接口 (带 OCR 兜底机制)
@app.post("/api/parse_question_file")
async def parse_question_file(file: UploadFile = File(...)):
    print(f"📄 [文档解析] 收到题目文件: {file.filename}")
    try:
        content = await file.read()
        extracted_text = ""

        # 解析 Word 文档 (保持不变)
        if file.filename.lower().endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            extracted_text = "\n".join([para.text for para in doc.paragraphs])

        # 解析 PDF 文档
        elif file.filename.lower().endswith(".pdf"):
            pdf_document = fitz.open(stream=content, filetype="pdf")

            # 第一波尝试：原生文本提取
            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                extracted_text += page.get_text() + "\n"

            # 🌟 核心绝杀：OCR 视觉兜底机制！如果字数极少，说明是扫描件图集！
            if len(extracted_text.strip()) < 20:
                print("🚨 检测到纯图片/扫描版 PDF！启动视觉大模型 (Qwen-VL) 进行 OCR 强行识别...")
                extracted_text = ""  # 清空刚才提取出的无用乱码

                # 初始化视觉大脑
                vision_llm = ChatOpenAI(
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    model="qwen-vl-max",  # 👈 阿里云专用的多模态视觉大模型
                    temperature=0
                )

                for page_num in range(len(pdf_document)):
                    page = pdf_document.load_page(page_num)
                    # 将 PDF 页渲染成高清图片 (2倍分辨率保证文字清晰)
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_data = pix.tobytes("jpeg")
                    base64_img = base64.b64encode(img_data).decode('utf-8')

                    try:
                        # 呼叫大模型“看图识字”
                        msg = HumanMessage(content=[
                            {"type": "text",
                             "text": "请提取这张作业/试卷图片中的所有文字内容。保持原有的段落排版，不要省略任何题目细节。"},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                        ])
                        resp = await vision_llm.ainvoke([msg])
                        extracted_text += resp.content + "\n\n"
                        print(f"✅ 第 {page_num + 1} 页 OCR 提取成功！")
                    except Exception as e:
                        print(f"❌ 第 {page_num + 1} 页视觉提取失败: {e}")

            pdf_document.close()

        else:
            return JSONResponse(status_code=400, content={"error": "目前仅支持 .docx 和 .pdf 格式的题目文件"})

        print(f"🕵️‍♂️ [验货] 最终提取到的总字符数: {len(extracted_text)}")

        return {"status": "success", "text": extracted_text.strip()}

    except Exception as e:
        print(f"❌ [文档解析失败]: {e}")
        return JSONResponse(status_code=500, content={"error": f"文件解析失败: {str(e)}"})


# ==========================================
# 🌟 新增：结构化成绩单数据分析接口 (动态学情引擎)
# ==========================================
@app.post("/api/analyze_scores")
async def analyze_scores_endpoint(file: UploadFile = File(...)):
    print(f"📊 [数据分析] 收到成绩单文件: {file.filename}")
    try:
        content = await file.read()

        # 兼容 CSV 和 Excel 格式
        if file.filename.lower().endswith(".csv"):
            # 解决 Windows 下可能出现的中文编码问题
            try:
                df = pd.read_csv(io.BytesIO(content), encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding='gbk')
        elif file.filename.lower().endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            return JSONResponse(status_code=400, content={"error": "请上传 CSV 或 Excel 格式的成绩单"})

        # 1. 动态提取科目均分（生成雷达图数据）
        # 根据你上传的 Sheet1.csv，提取核心科目
        subjects = ["语文", "数学", "英语"]
        radar_data = []
        for sub in subjects:
            if sub in df.columns:
                avg_score = round(df[sub].mean(), 1)
                radar_data.append({"subject": sub, "A": avg_score, "fullMark": 100})

        # 找出全班最薄弱的科目
        weakest_subject = min(radar_data, key=lambda x: x["A"])["subject"] if radar_data else "未知"

        # 2. 动态分析分数段分布（生成柱状图数据）
        # 完全匹配你 Sheet2.csv 要求的 20 分一档的区间要求
        bar_data = []
        if weakest_subject in df.columns:
            scores = df[weakest_subject].fillna(0)
            bar_data = [
                {"name": "0-20分", "人数": int(((scores >= 0) & (scores < 20)).sum())},
                {"name": "20-40分", "人数": int(((scores >= 20) & (scores < 40)).sum())},
                {"name": "40-60分", "人数": int(((scores >= 40) & (scores < 60)).sum())},
                {"name": "60-80分", "人数": int(((scores >= 60) & (scores < 80)).sum())},
                {"name": "80-100分", "人数": int((scores >= 80).sum())},
            ]

        print(f"✅ [数据分析] 解析完成！总人数: {len(df)}，最弱科目: {weakest_subject}")
        return {
            "status": "success",
            "radar_data": radar_data,
            "bar_data": bar_data,
            "weakest_subject": weakest_subject,
            "total_students": len(df)
        }

    except Exception as e:
        print(f"❌ [数据分析失败]: {e}")
        return JSONResponse(status_code=500, content={"error": f"数据分析失败: {str(e)}"})

# 优雅的启动入口
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=["*.db", "*.db-journal"])