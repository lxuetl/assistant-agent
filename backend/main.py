from fastapi import FastAPI, HTTPException,Depends,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent_service import A25Agent
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, QuizRecord,ChatHistory

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


# 4. 路由：核心流式接口
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):  # 👈 注入了数据库 db
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    print(f" [收到请求]: {request.message}")

    # 🌟 核心魔法：写一个拦截器生成器
    async def stream_and_save():
        full_ai_response = ""  # 准备一个空篮子，用来接 AI 吐出来的每一个字

        # 1. 把 agent 吐出来的字，一边传给前端，一边偷偷放进篮子里
        async for chunk in agent.execute_stream(request.message):
            full_ai_response += chunk  # 收集拼接
            yield chunk  # 实时发给前端，保证打字机效果不卡顿

        # 2. 当上面的 for 循环结束时，说明 AI 说完话了！此时开始存数据库
        try:
            # 记录用户的提问
            user_record = ChatHistory(role="user", content=request.message)
            # 记录 AI 的完整回答
            ai_record = ChatHistory(role="ai", content=full_ai_response)

            db.add_all([user_record, ai_record])
            db.commit()
            print("💾 [数据库] 聊天记忆已成功刻入脑海！")
        except Exception as e:
            db.rollback()
            print(f"❌ [数据库] 聊天记忆保存失败: {e}")

    # 依然返回流式响应，但这次用的是咱们加了料的 stream_and_save()
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
        print(f"❌ [数据库] 保存记录失败: {e}")
        return {"error": str(e)}
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)