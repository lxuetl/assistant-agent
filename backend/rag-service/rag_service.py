#检索chroma_db中的内容并根据它来回答

import os
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

DASHSCOPE_BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY") or os.getenv("OPENAI_API_KEY")

# 配置翻译官
embeddings = OpenAIEmbeddings(
    base_url=DASHSCOPE_BASE_URL,
    model="text-embedding-v3",
    check_embedding_ctx_length=False,
    api_key=DASHSCOPE_API_KEY,
)

# 这里直接指向本地的 chroma_db 文件夹
vectorstore = Chroma(persist_directory="./chroma_db", embedding_function=embeddings)
# 设置检索器：每次提问，去硬盘里找最相关的 2段话
retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

llm = ChatOpenAI(
    base_url=DASHSCOPE_BASE_URL,
    model="qwen3.5-flash",
    api_key=DASHSCOPE_API_KEY,
)

#制定结构化的 Prompt 提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", """你是一个专业的跨课程智能助教。请你严格根据下面的【参考资料】来回答学生的问题。
如果资料里没有提到，你就直接回答“抱歉，参考资料中未找到相关内容”，绝对不要自己凭空捏造！【参考资料】：{context}"""),
    ("human", "{question}")
])

# 辅助函数：把搜到的资料拼成字符串
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


# 封装成接口，供 main.py 随时调用！
def ask_knowledge_base(question: str) -> str:
    """
    接收用户问题，利用 RAG 架构查询本地数据库并返回 AI 答案。
    """
    #组装chain
    chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
    )
    # 触发执行链
    return chain.invoke(question)
if __name__ == "__main__":
    # 根据 test.pdf 里的内容进行提问测试
    test_question = "LangChain agents 构建在什么之上，提供什么功能？"

    print(f"学生提问：{test_question}")
    print(" AI 正在翻阅本地资料库并思考...\n")

    response = ask_knowledge_base(test_question)
    print(f"AI助教回答：\n{response}")