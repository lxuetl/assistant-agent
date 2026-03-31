#这是后端数据库
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker
import datetime

# 1. 配置 SQLite 数据库连接（会在当前目录自动生成一个 a25_data.db 文件）
SQLALCHEMY_DATABASE_URL = "sqlite:///./a25_data.db"

# connect_args={"check_same_thread": False} 是 SQLite 在 FastAPI 中使用的必备设置
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==========================================
# 2. 定义数据库表结构 (Models)
# ==========================================

class QuizRecord(Base):
    """错题本/做题记录表"""
    __tablename__ = "quiz_records"
    user_id = Column(String, index=True)
    course_id = Column(String, index=True)
    platform = Column(String, default="web")
    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text, nullable=False)           # 题干
    user_choice = Column(String(10), nullable=False)  # 用户选了什么 (A/B/C/D)
    correct_answer = Column(String(10), nullable=False)# 正确答案是什么
    is_correct = Column(Boolean, default=False)       # 是否做对了
    explanation = Column(Text, nullable=True)         # 解析
    created_at = Column(DateTime, default=datetime.datetime.utcnow) # 做题时间

class ChatHistory(Base):
    """历史聊天记录表"""
    __tablename__ = "chat_histories"
    user_id = Column(String, index=True)
    course_id = Column(String, index=True)
    platform = Column(String, default="web")
    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(50), nullable=False)         # 角色: user 或 ai
    content = Column(Text, nullable=False)            # 聊天内容
    created_at = Column(DateTime, default=datetime.datetime.utcnow) # 聊天时间

# ==========================================
# 3. 自动建表引擎
# ==========================================
def init_db():
    # 只要运行这句话，SQLAlchemy 就会检查表存不存在，不存在就自动创建
    Base.metadata.create_all(bind=engine)
    print("✅ 数据库初始化完成！表结构已就绪。")

# 依赖注入：供 FastAPI 路由获取数据库 Session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 如果直接运行这个文件，就执行建表
if __name__ == "__main__":
    init_db()