import os
from langchain_core.documents import Document
from langchain_chroma import Chroma
# 🌟 绝杀：直接从你现有的代码里复用阿里云大模型配置！
from vector_store import embeddings, CHROMA_DB_DIR

def seed_grading_rubric():
    print("🚀 [知识库预热] 正在连接本地 ChromaDB...")

    # 必须使用与 vector_store 完全一致的集合与嵌入模型
    vectorstore = Chroma(
        persist_directory=CHROMA_DB_DIR,
        embedding_function=embeddings
    )

    print("📥 正在向知识库注入《Excel操作》实验的专家批改细则...")

    # 包含最新、最变态的魔鬼级细则
    expert_rules = [
        "RANK函数规则：总分区域必须使用绝对引用（如 $D$2:$D$N），若学生写成了 D2:DN 等形式，必须立刻报错扣分。第三个参数“0”代表降序排名。",
        "逻辑函数AND规则：若学生使用如 =AND(B2>$G$1...) 的公式，必须检查其用来比较的平均分是否使用了绝对引用 $锁定。若未锁定，指出公式下拉错误。",
        "分数录入规则：如果学生在单元格直接输入 2/3，会被Excel默认为日期，必须指出应该先设置单元格格式为分数，或输入 0 2/3。",
        "高级筛选规则：多条件必须要求在表头一致的前提下，‘且’关系写在同一行。筛选结果保留在Sheet3原处，不能覆盖原数据。",
        "数组公式规则：计算总分/平均分若使用 =SUM(B2:C2) 等数组运算，必须强调旧版Excel需按 Ctrl+Shift+Enter。",
        "条件格式规则：公式必须对应实际的数据起始列。如 =A2>60 假设的是A列，若学生未说明这是假设，需提醒他检查实际列标。",
        "【实验硬件规范】：实验仪器部分只需填写关键参数，包括 CPU型号（如 Intel i7-13700H）和 内存容量（如 16GB DDR5）。禁止罗列不相关的外设。",

        "【函数名强制要求】：计算排名必须且只能使用 RANK.EQ 函数。若学生使用过时的 RANK 函数或其它函数，必须判定为不符合题目要求并扣分。",

        "【公式嵌套要求】：优等生的判定（AND函数）中，平均分的计算必须直接嵌套在公式内（例如使用 AVERAGE(B:B) ），严禁先在空白单元格计算再引用地址。若发现引用了类似 $G$1 这种辅助单元格，必须判定为逻辑架构不达标。",

        "【数组公式仪式感】：数组公式（计算总分/平均分）必须明确注明需按下 Ctrl+Shift+Enter 组合键。即便新版Excel支持直接Enter，但在本实验考核中，直接按Enter不予采分，必须在步骤中写明三键合击的操作。",
        "【录入规范】：单元格录入分数（如 2/3）必须提及先设置单元格格式，严禁直接输入导致变为日期格式。",
        "数据透视表规则：“优等生”字段必须同时拖到“行区域”和“值区域”，确保行标签和计数项对应。"
    ]

    # 封装成 LangChain 认识的文档格式
    docs = [Document(page_content=rule, metadata={"source": "expert_rules"}) for rule in expert_rules]
    ids = [f"excel_rule_{i+1}" for i in range(len(expert_rules))]

    print("⏳ 正在调用阿里云 text-embedding-v3 模型进行高精度向量化...")
    vectorstore.add_documents(documents=docs, ids=ids)

    print(f"✅ [预热完成] 成功写入 {len(expert_rules)} 条硬性批改规则至统一数据库！")

if __name__ == "__main__":
    seed_grading_rubric()