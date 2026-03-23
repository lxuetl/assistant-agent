from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent_service import A25Agent
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


# 1. 初始化应用和 Agent
app = FastAPI(title="A25 Agent API")
agent = A25Agent()

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

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)