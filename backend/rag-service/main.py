from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import os


try:
    from rag_service import ask_knowledge_base
except ImportError as e:
    print(f"⚠️ 警告: 无法导入 rag_service，请检查文件是否齐全。错误: {e}")


    # 临时兜底函数，防止你还没搞定依赖时起不来服务
    def ask_knowledge_base(query):
        return f"系统提示：RAG 服务占位符。收到查询词：{query}"

app = FastAPI(title="A25 RAG Knowledge Service (知识库微服务)")


# 定义网关传过来的数据格式
class QueryRequest(BaseModel):
    query: str
    course_id: str = "general"


@app.get("/")
async def root():
    return {"message": "RAG Service is running! 向量检索节点已就绪。"}


@app.post("/retrieve")
async def retrieve_knowledge(request: QueryRequest):
    """
    提供给内网 Agent 网关调用的专属接口
    """
    print(f"📚 [RAG 服务] 收到网关发来的检索请求: {request.query} (课程: {request.course_id})")
    try:
        # 调用你原有的核心检索算法去 ChromaDB 里查数据
        result = ask_knowledge_base(request.query)

        print(f"✅ [RAG 服务] 检索完成，返回 {len(str(result))} 字符的上下文资料。")
        # 把查到的结果打包成 JSON 返回给网关
        return {"data": result}

    except Exception as e:
        print(f"❌ [RAG 服务] 检索过程发生严重错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


from fastapi import UploadFile, File
import aiofiles
import os
# 确保你的 rag-service 文件夹里有 vector_store.py
from vector_store import build_vector_store


@app.post("/api/upload")
async def receive_knowledge_file(file: UploadFile = File(...)):
    """接收网关发来的PDF并进行向量入库"""
    print(f"📥 [RAG 服务] 接收到入库文件: {file.filename}")
    try:
        os.makedirs("./docs", exist_ok=True)
        file_path = f"docs/{file.filename}"
        async with aiofiles.open(file_path, 'wb') as out_file:
            await out_file.write(await file.read())

        print(f"⚙️ [RAG 服务] 正在执行向量化 (这可能需要几秒钟)...")
        build_vector_store(file_path)
        print(f"✅ [RAG 服务] 知识库入库成功！")
        return {"status": "success", "message": "知识库入库成功！"}
    except Exception as e:
        print(f"❌ [RAG 服务] 入库失败: {e}")
        return {"status": "error", "message": str(e)}
# 为了方便你在本地单独测试这个微服务，加上启动入口
if __name__ == "__main__":
    # 微服务标准配置：固定在 8001 端口，不和网关(8000)抢占资源
    uvicorn.run(app, host="0.0.0.0", port=8001)