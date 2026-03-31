from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc  # 用于倒序查询数据库历史记录
from typing import Optional

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
    user_id: str  #  新增：谁做的题
    course_id: str  # 新增：哪门课的题
    question: str
    options: str#前端把选项
    user_choice: str
    correct_answer: str
    is_correct: bool
    explanation: str = ""


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


# 优雅的启动入口
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=["*.db", "*.db-journal"])