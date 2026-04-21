import os
import fitz  # PyMuPDF
import base64
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv

load_dotenv()

DASHSCOPE_BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY") or os.getenv("OPENAI_API_KEY")

# 配置阿里云的“文本向量化”模型
embeddings = OpenAIEmbeddings(
    base_url=DASHSCOPE_BASE_URL,
    model="text-embedding-v3",
    check_embedding_ctx_length=False,
    chunk_size=10,  # 🌟 双保险：强制告诉底层库，每次最多只发 10 条
    api_key=DASHSCOPE_API_KEY,
)

# 定义本地数据库的存放文件夹
CHROMA_DB_DIR = "chroma_db"


def build_vector_store(pdf_path: str):
    print(f"📚 正在加载 PDF 文件: {pdf_path} ...")

    extracted_text = ""
    try:
        # 1. 尝试用 PyMuPDF 极速读取文字图层
        pdf_document = fitz.open(f"./{pdf_path}")
        for page_num in range(len(pdf_document)):
            page = pdf_document.load_page(page_num)
            extracted_text += page.get_text() + "\n"

        # 2. 🌟 核心防爆盾：如果字数少于50，判定为纯图片/扫描件！
        if len(extracted_text.strip()) < 50:
            print("🚨 检测到纯图片/扫描版 PDF！启动 Qwen-VL 视觉大模型 OCR 引擎...")
            extracted_text = ""

            # 初始化视觉大模型
            vision_llm = ChatOpenAI(
                base_url=DASHSCOPE_BASE_URL,
                model="qwen-vl-max",
                temperature=0,
                api_key=DASHSCOPE_API_KEY,
            )

            # 逐页转成高清图片让大模型“看”
            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img_data = pix.tobytes("jpeg")
                base64_img = base64.b64encode(img_data).decode('utf-8')

                try:
                    msg = HumanMessage(content=[
                        {"type": "text", "text": "提取文字内容，保持原有的段落排版。"},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                    ])
                    resp = vision_llm.invoke([msg])
                    extracted_text += resp.content + "\n\n"
                    print(f"👁️ 第 {page_num + 1}/{len(pdf_document)} 页视觉 OCR 识别完成！")
                except Exception as e:
                    print(f"⚠️ 第 {page_num + 1} 页 OCR 失败: {e}")

        pdf_document.close()

        # 拦截器：防空气
        if not extracted_text.strip():
            raise ValueError("❌ 未能提取到任何有效文字！此文档可能是纯图片或扫描件，当前 RAG 引擎无法解析空气。")

        print(f"📄 成功提取文本，共 {len(extracted_text)} 个字符。")

        # 3. 将提取出来的纯文本包装成 LangChain 认识的 Document 对象
        docs = [Document(page_content=extracted_text, metadata={"source": pdf_path})]

        # 4. 把长文本切成小块
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50
        )
        split_docs = text_splitter.split_documents(docs)
        print(f"🔪 文件已被切割成 {len(split_docs)} 个文本块。")

        print(f"⏳ 触发阿里云防限流机制，正在分批向量化入库 (每批10个)...")

        # 5. 先连接（或创建）本地 Chroma 数据库对象
        vectorstore = Chroma(
            persist_directory=CHROMA_DB_DIR,
            embedding_function=embeddings
        )

        # 🌟 完美继承你原本的手动分批入库逻辑
        batch_size = 10
        for i in range(0, len(split_docs), batch_size):
            batch = split_docs[i: i + batch_size]
            vectorstore.add_documents(batch)
            print(f"  -> 进度: 已成功入库 {min(i + batch_size, len(split_docs))} / {len(split_docs)} 块...")

        print(f"🎉 搞定！向量数据库已生成并永久保存在 {CHROMA_DB_DIR} 文件夹中。")
        return vectorstore

    except Exception as e:
        print(f"❌ 入库发生异常: {e}")
        raise e


if __name__ == "__main__":
    pass