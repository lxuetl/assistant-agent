import os
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

# 配置阿里云的“文本向量化”模型
embeddings = OpenAIEmbeddings(
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    model="text-embedding-v3", 
    check_embedding_ctx_length=False,
    chunk_size=10  # 🌟 双保险：强制告诉底层库，每次最多只发 10 条
)

# 定义本地数据库的存放文件夹
CHROMA_DB_DIR = "./chroma_db"

def build_vector_store(pdf_path: str):
    print(f"📚 正在加载 PDF 文件: {pdf_path} ...")
    # 1. 加载 PDF
    loader = PyMuPDFLoader(
        file_path=f"./{pdf_path}"
    )
    docs = loader.load()
    print(f"📄 成功加载，共 {len(docs)} 页。")

    # 2. 把长文本切成小块 
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )
    split_docs = text_splitter.split_documents(docs)
    print(f"🔪 文件已被切割成 {len(split_docs)} 个文本块。")

    # 拦截器：防空气
    if len(split_docs) == 0:
        raise ValueError("❌ 未能提取到任何有效文字！此文档可能是纯图片或扫描件，当前 RAG 引擎无法解析空气。")

    print(f"⏳ 触发阿里云防限流机制，正在分批向量化入库 (每批10个)，预计需要几十秒...")
    
    # 3. 先连接（或创建）本地 Chroma 数据库对象
    vectorstore = Chroma(
        persist_directory=CHROMA_DB_DIR, 
        embedding_function=embeddings
    )

    # 🌟 核心修复：手动分批（Batching），每次只喂 10 个，绝不噎着阿里云！
    batch_size = 10
    for i in range(0, len(split_docs), batch_size):
        batch = split_docs[i : i + batch_size]
        # 追加进数据库
        vectorstore.add_documents(batch)
        print(f"  -> 进度: 已成功入库 {min(i + batch_size, len(split_docs))} / {len(split_docs)} 块...")

    print(f"🎉 搞定！向量数据库已生成并永久保存在 {CHROMA_DB_DIR} 文件夹中。")
    return vectorstore

if __name__ == "__main__":
    pass