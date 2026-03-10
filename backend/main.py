import os
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

app = FastAPI()

# 解决跨域问题（极其重要！否则前端连不上后端）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 开发阶段允许所有来源访问
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 告诉后端，前端传过来的数据长什么样
class ChatRequest(BaseModel):
    message: str

# 配置大模型
client = OpenAI(
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

@app.post("/ask")
async def ask_ai(request: ChatRequest):
    try:
        # 调用大模型
        response = client.chat.completions.create(
            model="qwen-plus", # 替换为你使用的模型名字
            messages=[
                {"role": "system", "content": "你是一个有用的教学 AI 助手。"},
                {"role": "user", "content": request.message}
            ]
        )
        # 提取 AI 的回答
        ai_reply = response.choices[0].message.content
        return {"reply": ai_reply}
    except Exception as e:
        return {"reply": f"大模型连接失败报错: {str(e)}"}