"""这个是用于pdf读取的代码
  test.pdf是测试pdf，这个代码它目前读取纯文本的pdf可以，其他有些问题，后续考虑下怎么改
"""
import os
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

# 配置阿里云的“文本向量化”模型
embeddings = OpenAIEmbeddings(
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    model="text-embedding-v3" , # 阿里云的向量模型名称
    check_embedding_ctx_length=False
)

# 定义本地数据库的存放文件夹
CHROMA_DB_DIR = "./chroma_db"


def build_vector_store(pdf_path: str):
    print(f" 正在加载 PDF 文件: {pdf_path} ...")
    # 3. 加载 PDF
    loader = PyMuPDFLoader(
        file_path=f"./{pdf_path}"
    )
    docs = loader.load()
    print(f" 成功加载，共 {len(docs)} 页。")

    # 把长文本切成小块 (chunk_size=500字一块，chunk_overlap=50字防断句)
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )
    split_docs = text_splitter.split_documents(docs)
    print(f"文件已被切割成 {len(split_docs)} 个文本块。")

    print("正在将文本块转换为向量并存入 Chroma 数据库 (这可能需要十几秒)...")
    #  存入 Chroma 本地数据库
    vectorstore = Chroma.from_documents(
        documents=split_docs,
        embedding=embeddings,
        persist_directory=CHROMA_DB_DIR
    )
    print(f" 搞定！向量数据库已生成并保存在 {CHROMA_DB_DIR} 文件夹中。")

    return vectorstore

if __name__ == "__main__":
    build_vector_store("test.pdf")