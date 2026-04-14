from database import SessionLocal, engine, Base
from database import User  # 需要先添加 User 类

def init_users():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # 检查是否已有数据
    if db.query(User).count() == 0:
        users = [
            User(account_id="20041001", password="123456", role="student", name="李明"),
            User(account_id="20041002", password="123456", role="student", name="王芳"),
            User(account_id="T8001", password="123456", role="teacher", name="张教授"),
        ]
        for u in users:
            db.add(u)
        db.commit()
        print("✅ 测试用户已创建")
    
    db.close()

if __name__ == "__main__":
    init_users()