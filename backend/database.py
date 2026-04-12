from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import sessionmaker, declarative_base
import datetime

# ==========================================
# 1. 配置 MySQL 数据库连接
# ==========================================
# 🌟 注意：请确保你刚才安装时设置的密码是 123456
# 格式：mysql+pymysql://用户名:密码@服务器地址:端口/数据库名
# 我们这里先连向 mysql 这个自带库，或者你手动去 MySQL 建一个叫 a25_db 的库
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:123456@127.0.0.1:3306/a25_db?charset=utf8mb4"

# 🌟 MySQL 是服务端数据库，天生支持多线程，所以不再需要 check_same_thread
# 我们加入 pool_recycle 并在连接异常时自动重连，提高稳定性
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_recycle=3600,
    pool_pre_ping=True
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
    user_id = Column(String(50), index=True) # MySQL 索引建议指定长度
    course_id = Column(String(50), index=True)
    platform = Column(String(20), default="web")
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
    user_id = Column(String(50), index=True)
    course_id = Column(String(50), index=True)
    platform = Column(String(20), default="web")
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now)

class StudentScore(Base):
    """学生成绩表（存储解析后的 Excel 个体数据）"""
    __tablename__ = "student_scores"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), index=True)
    student_name = Column(String(50))
    course_id = Column(String(50), default="default_course")
    score_data = Column(JSON) # MySQL 5.7+ 原生支持 JSON 类型，非常适合存动态成绩

# ==========================================
# 3. 自动建表与依赖注入
# ==========================================

def init_db():
    """初始化数据库：如果表不存在则创建"""
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ MySQL 数据库初始化完成！A25 数据表已就绪。")
    except Exception as e:
        print(f"❌ 数据库初始化失败，请检查是否已创建 a25_db 数据库。错误信息: {e}")

def get_db():
    """FastAPI 依赖注入：获取数据库 Session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() # 🌟 这一步极其重要，确保连接及时归还给连接池，防止锁表

if __name__ == "__main__":
    init_db()