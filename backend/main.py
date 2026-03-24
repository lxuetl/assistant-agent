from fastapi import FastAPI, HTTPException,Depends,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent_service import A25Agent
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, QuizRecord

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
async def chat_endpoint(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    print(f" [收到请求]: {request.message}")

    # 使用 StreamingResponse 保持长连接，一个字一个字地吐
    return StreamingResponse(
        agent.execute_stream(request.message),
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