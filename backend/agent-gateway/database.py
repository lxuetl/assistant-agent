from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import sessionmaker, declarative_base
import datetime

# ==========================================
# 1. 配置 SQLite 数据库连接
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./a25_data.db"

# SQLite 配置
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
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    course_id = Column(String, index=True)
    platform = Column(String, default="web")
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=True)
    user_choice = Column(String(10), nullable=False)
    correct_answer = Column(String(10), nullable=False)
    is_correct = Column(Boolean, default=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now)

class ChatHistory(Base):
    """历史聊天记录表"""
    __tablename__ = "chat_histories"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    course_id = Column(String, index=True)
    platform = Column(String, default="web")
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now)

class StudentScore(Base):
    """学生成绩表（存储解析后的 Excel 个体数据）"""
    __tablename__ = "student_scores"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    student_name = Column(String)
    course_id = Column(String, default="default_course")
    score_data = Column(JSON)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="student")
    name = Column(String)

# ==========================================
# 3. 自动建表与依赖注入
# ==========================================

def init_db():
    """初始化数据库：如果表不存在则创建"""
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ SQLite 数据库初始化完成！A25 数据表已就绪。")
    except Exception as e:
        print(f"❌ 数据库初始化失败，错误信息: {e}")

def get_db():
    """FastAPI 依赖注入：获取数据库 Session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

if __name__ == "__main__":
    init_db()