from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent_service import A25Agent

# 1. 初始化应用和 Agent
app = FastAPI(title="A25 Agent API")
agent = A25Agent()

# 2. 配置跨域 (React 默认 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)