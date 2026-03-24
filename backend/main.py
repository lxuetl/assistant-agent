from fastapi import FastAPI, HTTPException,Depends,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent_service import A25Agent
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, QuizRecord,ChatHistory
from sqlalchemy import desc #用于倒序查询数据库历史记录的
from typing import Optional

# 1. 初始化应用和 Agent
app = FastAPI(title="A25 Agent API")
agent = A25Agent()
print("🚀 我是后端，我活得好好的！")
# 2. 配置跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有域名跨域（cpolar的域名变了也不怕）
    allow_credentials=True,
    allow_methods=["*"],  # 允许 OPTIONS, POST, GET 等所有方法
    allow_headers=["*"],  # 允许所有请求头
)


# 3. 数据模型
class ChatRequest(BaseModel):
    message: str
    page_context: Optional[dict] = None  # 👈 新增：专门用来装隐秘背景的口袋

# 4. 路由：核心流式接口
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    print(f" [收到请求]: {request.message}")

    #  1. 翻开日记本：从数据库捞出最近的 10 条对话记录（相当于 5 轮问答）
    # 使用 desc() 按时间倒序拿最新的，然后再 reverse() 正过来，保证时间线顺序是对的
    recent_history = db.query(ChatHistory).order_by(desc(ChatHistory.id)).limit(10).all()
    recent_history.reverse()

    # 格式化成简单的字典列表，方便传给 Agent
    history_context = [{"role": h.role, "content": h.content} for h in recent_history]

    async def stream_and_save():
        full_ai_response = ""

        #  2. 把翻出来的记忆 (history_context) 一并传给大脑
        async for chunk in agent.execute_stream(
                user_input=request.message,
                page_context=request.page_context,
                chat_history=history_context
        ):
            full_ai_response += chunk
            yield chunk

        # 3. 聊完天，继续把这次的新对话写进日记本
        try:
            user_record = ChatHistory(role="user", content=request.message)
            ai_record = ChatHistory(role="ai", content=full_ai_response)
            db.add_all([user_record, ai_record])
            db.commit()
            print("💾 [数据库] 聊天记忆已更新！")
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


class QuizRecordCreate(BaseModel):
    question: str
    user_choice: str
    correct_answer: str
    is_correct: bool
    explanation: str = ""


# ==========================================
# 🌟 新增：保存做题记录的 API 接口
# ==========================================
@app.post("/api/save_quiz_record")
async def save_quiz_record(record: QuizRecordCreate, db: Session = Depends(get_db)):
    """接收前端传来的做题结果，并存入 SQLite 数据库"""
    try:
        # 1. 把接收到的数据转换成数据库的一行记录
        new_record = QuizRecord(
            question=record.question,
            user_choice=record.user_choice,
            correct_answer=record.correct_answer,
            is_correct=record.is_correct,
            explanation=record.explanation
        )
        # 2. 塞进数据库并保存 (Commit)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)  # 获取生成的主键 ID

        print(f"💾 [数据库] 成功收录一条做题记录，ID: {new_record.id}，正确与否: {record.is_correct}")
        return {"status": "success", "message": "已成功收录至错题本！", "id": new_record.id}
    except Exception as e:
        db.rollback()  # 如果报错，撤销刚才的操作，保护数据库
        print(f" [数据库] 保存记录失败: {e}")
        return {"error": str(e)}
if __name__ == "__main__":
    if __name__ == "__main__":
        import uvicorn
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, reload_excludes=["*.db", "*.db-journal"])