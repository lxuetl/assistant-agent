from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc  # 用于倒序查询数据库历史记录
from typing import Optional, List  # 🌟 新增 List 用于接收数组
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
# 🌟 新增引入了 engine 和 Base 用于自动建表
from database import get_db, QuizRecord, ChatHistory, StudentScore, SessionLocal, engine, Base

# 1. 初始化应用和 Agent
app = FastAPI(title="A25 Agent API")

# 👇 🌟 核心便捷补丁：每次启动时自动检查并创建缺失的表，再也不用手动跑 database.py 了！
Base.metadata.create_all(bind=engine)

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


# ==========================================
# 🌟 数据模型区
# ==========================================

# 🌟 修改点 1：定义聊天消息结构，以适配前端 React 的消息数组
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    user_id: str = "student_001"  # 给出默认值，防止前端没传报错
    course_id: str = "default_course"
    platform: str = "web"
    messages: List[ChatMessage]   # 🌟 核心修改：接收前端传来的对话数组
    page_context: Optional[dict] = None

class QuizRecordCreate(BaseModel):
    user_id: str
    course_id: str
    question: str
    options: str
    user_choice: str
    correct_answer: str
    is_correct: bool
    explanation: str = ""

class HomeworkRequest(BaseModel):
    user_id: str
    course_id: str
    question_text: str
    content_type: str
    content: str

# 🌟 新增：接收要导出为 Word 的内容
class ExportDocRequest(BaseModel):
    content: str
# ==========================================
# 🌟 API 路由区
# ==========================================

# 4. 路由：核心流式接口 (终极修复：解决 AI 失忆 + 彻底解决死锁)
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages cannot be empty")

    # 🌟 提取最后一条用户消息
    current_message = request.messages[-1].content
    print(f"📥 [收到请求] 用户: {request.user_id}, 消息: {current_message}")

    # 🌟 核心修复逻辑：提取前端传过来的“实时上下文”
    # 这样 AI 就能看到它刚刚在前端发出的那条“主动问候”了！
    # 我们取 request.messages 中除了最后一条以外的所有内容作为当前会话记忆
    live_context = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages[:-1]
    ]

    # 1. 尝试从数据库补充更久远的记忆 (瞬间开闭，防止锁死)
    db_read = SessionLocal()
    history_context = []
    try:
        recent_history = db_read.query(ChatHistory) \
            .filter(ChatHistory.user_id == request.user_id) \
            .order_by(desc(ChatHistory.id)) \
            .limit(5).all() # 数据库里拿 5 条就够了，补充背景
        recent_history.reverse()
        history_context = [{"role": h.role, "content": h.content} for h in recent_history]
    finally:
        db_read.close()

    # 🌟 终极合并：数据库历史 + 前端实时消息
    # 这样 AI 的大脑里就有：[很久以前的事] + [刚刚主动说的那句话] + [用户现在的回复]
    full_memory = history_context + live_context

    async def stream_and_save():
        full_ai_response = ""
        # 2. 流式对话
        async for chunk in agent.execute_stream(
                user_input=current_message,
                page_context=request.page_context,
                chat_history=full_memory,  # 🌟 传入完整的合成记忆
                user_id=request.user_id,
                course_id=request.course_id
        ):
            full_ai_response += chunk
            yield chunk

        # 3. 结束后极速存入数据库
        db_write = SessionLocal()
        try:
            # 存入用户这一句
            db_write.add(ChatHistory(user_id=request.user_id, role="user", content=current_message))
            # 存入 AI 这一句 (如果是前端生成的，以后也会被存下来)
            db_write.add(ChatHistory(user_id=request.user_id, role="ai", content=full_ai_response))
            db_write.commit()
            print(f"✅ 💾 [数据库] 聊天记忆已存入。")
        except Exception as e:
            db_write.rollback()
            print(f"❌ [数据库] 保存失败: {e}")
        finally:
            db_write.close()

    return StreamingResponse(stream_and_save(), media_type="text/event-stream")

@app.post("/api/quiz")
async def generate_quiz_endpoint(request: Request):
    data = await request.json()
    page_context = data.get("page_context")
    quiz_result = await agent.generate_quiz(page_context)

    if "error" in quiz_result:
        return JSONResponse(status_code=400, content=quiz_result)
    return quiz_result


@app.post("/api/save_quiz_record")
async def save_quiz_record(record: QuizRecordCreate, db: Session = Depends(get_db)):
    try:
        print(f"📥 [存题请求] 正在为用户 {record.user_id} 写入做题记录...")
        new_record = QuizRecord(
            user_id=record.user_id,
            course_id=record.course_id,
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
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/grade_homework")
async def grade_homework_endpoint(request: HomeworkRequest):
    print(f"📝 [作业批改] 收到作业，类型: {request.content_type}")
    actual_content = request.content
    doc_obj = None

    if request.content_type == "docx":
        base64_data = request.content.split(",")[-1] if "," in request.content else request.content
        file_bytes = base64.b64decode(base64_data)
        doc_obj = docx.Document(io.BytesIO(file_bytes))
        actual_content = "\n".join([para.text for para in doc_obj.paragraphs])
        print("📄 成功从上传的 Word 中解剖出纯文本。")

    result_str = await agent.grade_homework(
        question_text=request.question_text,
        content_type=request.content_type,
        content=actual_content,
        course_id=request.course_id
    )

    annotated_file_b64 = None

    if request.content_type == "docx" and doc_obj:
        try:
            grading_data = json.loads(result_str)
            def clean_str(s):
                return re.sub(r'\W+', '', s)

            for ann in grading_data.get("annotations", []):
                target_text = ann.get("quoted_text", "")
                if not target_text: continue

                clean_target = clean_str(target_text)
                found_paragraph = None

                for paragraph in doc_obj.paragraphs:
                    if not paragraph.text.strip() or not paragraph.runs:
                        continue
                    clean_para = clean_str(paragraph.text)
                    if clean_target and (clean_target in clean_para or clean_para in clean_target):
                        found_paragraph = paragraph
                        break

                comment_text = f"【{ann['error_type']}】\n{ann['explanation']}\n💡建议：{ann['suggestion']}"

                if found_paragraph:
                    doc_obj.add_comment(found_paragraph.runs, text=comment_text, author="A25教授", initials="AI")
                else:
                    for p in doc_obj.paragraphs:
                        if p.text.strip() and p.runs:
                            doc_obj.add_comment(p.runs, text=f"【原位置：{ann['location']}】\n" + comment_text,
                                                author="A25教授", initials="AI")
                            break

            output_stream = io.BytesIO()
            doc_obj.save(output_stream)
            annotated_file_b64 = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + base64.b64encode(
                output_stream.getvalue()).decode("utf-8")
            print("🎉 成功将 AI 批注写入原生 Word 文档！")
        except Exception as e:
            print(f"⚠️ 写入 Word 批注失败: {e}")

    return {
        "status": "success",
        "grading_result": result_str,
        "annotated_file": annotated_file_b64
    }

@app.post("/api/parse_question_file")
async def parse_question_file(file: UploadFile = File(...)):
    print(f"📄 [文档解析] 收到题目文件: {file.filename}")
    try:
        content = await file.read()
        extracted_text = ""

        if file.filename.lower().endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            extracted_text = "\n".join([para.text for para in doc.paragraphs])

        elif file.filename.lower().endswith(".pdf"):
            pdf_document = fitz.open(stream=content, filetype="pdf")
            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                extracted_text += page.get_text() + "\n"

            if len(extracted_text.strip()) < 20:
                print("🚨 检测到纯图片/扫描版 PDF！启动视觉大模型 (Qwen-VL) 进行 OCR 强行识别...")
                extracted_text = ""
                vision_llm = ChatOpenAI(
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    model="qwen-vl-max",
                    temperature=0
                )

                for page_num in range(len(pdf_document)):
                    page = pdf_document.load_page(page_num)
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_data = pix.tobytes("jpeg")
                    base64_img = base64.b64encode(img_data).decode('utf-8')

                    try:
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
# 🌟 结构化成绩单数据分析接口 (新增入库功能)
# ==========================================
@app.post("/api/analyze_scores")
async def analyze_scores_endpoint(file: UploadFile = File(...), db: Session = Depends(get_db)):
    print(f"📊 [数据分析] 收到成绩单文件: {file.filename}")
    try:
        content = await file.read()

        if file.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.BytesIO(content), encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding='gbk')
        elif file.filename.lower().endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            return JSONResponse(status_code=400, content={"error": "请上传 CSV 或 Excel 格式的成绩单"})

        # 清洗数据
        df.dropna(axis=1, how='all', inplace=True)
        df = df.fillna(0)

        # 🌟 核心硬核架构：遍历每一行，将学生明细持久化写入 SQLite！
        if "学号" in df.columns:
            records = df.to_dict(orient="records")
            for row in records:
                # 提取学号和姓名，转成字符串防止报错
                uid = str(row.get("学号", "")).strip()
                if not uid or uid == "0.0" or uid == "0": continue

                s_name = str(row.get("姓名", "未知"))

                # 剔除干扰字段，只保留真正的科目分数存进 JSON
                blacklist = ["学号", "姓名", "序号", "id", "总分", "平均", "排名", "优等生"]
                s_data = {k: float(v) for k, v in row.items() if
                          k.strip() not in blacklist and isinstance(v, (int, float))}

                # 写入或更新数据库
                existing = db.query(StudentScore).filter(StudentScore.user_id == uid).first()
                if existing:
                    existing.score_data = s_data
                    existing.student_name = s_name
                else:
                    new_score = StudentScore(user_id=uid, student_name=s_name, score_data=s_data)
                    db.add(new_score)
            db.commit()
            print("💾 [数据库] 全班个体成绩明细已成功落盘！")

        # 计算全班大盘数据（代码保持不变）
        numeric_cols = df.select_dtypes(include=['number', 'float', 'int']).columns.tolist()
        blacklist = ["学号", "序号", "id", "总分", "平均", "排名", "优等生"]
        knowledge_points = [col for col in numeric_cols if col.strip() not in blacklist]

        radar_data = []
        for kp in knowledge_points:
            avg_score = round(df[kp].mean(), 1)
            radar_data.append({"subject": kp, "A": avg_score, "fullMark": 100})

        weakest_subject = min(radar_data, key=lambda x: x["A"])["subject"] if radar_data else "未知"

        bar_data = []
        if weakest_subject in df.columns:
            scores = df[weakest_subject]
            bar_data = [
                {"name": "0-20分", "人数": int(((scores >= 0) & (scores < 20)).sum())},
                {"name": "20-40分", "人数": int(((scores >= 20) & (scores < 40)).sum())},
                {"name": "40-60分", "人数": int(((scores >= 40) & (scores < 60)).sum())},
                {"name": "60-80分", "人数": int(((scores >= 60) & (scores < 80)).sum())},
                {"name": "80-100分", "人数": int((scores >= 80).sum())},
            ]

        return {
            "status": "success",
            "radar_data": radar_data,
            "bar_data": bar_data,
            "weakest_subject": weakest_subject,
            "total_students": len(df)
        }

    except Exception as e:
        db.rollback()
        print(f"❌ [数据分析失败]: {e}")
        return JSONResponse(status_code=500, content={"error": f"数据分析失败: {str(e)}"})


# ==========================================
# 🌟 新增：学生个人查分接口 (真正的无状态化)
# ==========================================
@app.get("/api/my_score")
async def get_my_score(account_id: str, db: Session = Depends(get_db)):
    print(f"🔍 [查分请求] 正在查询学号: {account_id}")
    student_record = db.query(StudentScore).filter(StudentScore.user_id == account_id).first()

    if not student_record or not student_record.score_data:
        return {"status": "not_found", "message": "尚未导入该生成绩"}

    # 将存好的 JSON 重构成前端需要的雷达图格式
    my_radar = []
    for subject, score in student_record.score_data.items():
        my_radar.append({"subject": subject, "A": score, "fullMark": 100})

    my_weakest = min(my_radar, key=lambda x: x["A"])["subject"] if my_radar else "暂无"

    return {
        "status": "success",
        "student_name": student_record.student_name,
        "radar_data": my_radar,
        "weakest_subject": my_weakest
    }


# ==========================================
# 🌟 新增：一键导出精排版 Word 文档接口
# ==========================================
@app.post("/api/export_doc")
async def export_doc_endpoint(request: ExportDocRequest):
    print("📄 [文档导出] 正在将 AI 教研成果渲染为 Word 文档...")
    try:
        # 创建一个新的 Word 文档对象
        doc = docx.Document()

        # 添加大标题
        doc.add_heading('A25 智能教研产出物', level=0)

        # 简单解析 Markdown 的基础语法进行 Word 排版
        for line in request.content.split('\n'):
            line = line.strip()
            if not line:
                continue

            if line.startswith('# '):
                doc.add_heading(line[2:], level=1)
            elif line.startswith('## '):
                doc.add_heading(line[3:], level=2)
            elif line.startswith('### '):
                doc.add_heading(line[4:], level=3)
            elif line.startswith('- ') or line.startswith('* '):
                doc.add_paragraph(line[2:], style='List Bullet')
            else:
                doc.add_paragraph(line)

        # 把生成的 Word 保存到内存中的二进制流
        output_stream = io.BytesIO()
        doc.save(output_stream)
        output_stream.seek(0)

        # 设置让浏览器触发下载的响应头
        headers = {
            'Content-Disposition': 'attachment; filename="A25_Smart_Plan.docx"'
        }

        # 返回文件流
        return StreamingResponse(
            output_stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers=headers
        )
    except Exception as e:
        print(f"❌ 导出文档失败: {e}")
        raise HTTPException(status_code=500, detail="生成文档失败")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=["*.db", "*.db-journal"])