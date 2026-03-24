#检查数据库有没有东西
import sqlite3
import os


def check_database():
    # 1. 锁定绝对路径（防止相对路径幽灵）
    db_path = os.path.abspath("a25_data.db")

    print("=" * 50)
    print(f"🔍 [雷达扫描] 正在检查数据库文件绝对路径:\n👉 {db_path}")
    print("=" * 50)

    # 2. 检查文件物理上存不存在
    if not os.path.exists(db_path):
        print("❌ 致命错误：在这个路径下根本找不到 a25_data.db 文件！")
        print("可能你的后端跑在别的目录了。")
        return

    # 3. 暴力撬开数据库读取
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 查做题记录表
        cursor.execute("SELECT * FROM quiz_records")
        records = cursor.fetchall()

        if not records:
            print("⚠️ [结果] 数据库文件存在，但 quiz_records 表里是空的！")
            print("难道真的见鬼了？事务被回滚了？")
        else:
            print(f"🎉 [大获全胜] 成功在数据库中搜查到 {len(records)} 条记录：\n")
            for row in records:
                # row 的索引对应你 database.py 里定义的字段顺序
                # id(0), question(1), user_choice(2), correct_answer(3), is_correct(4), explanation(5), created_at(6)
                print(f"🆔 记录 ID: {row[0]}")
                print(f"📝 题目: {row[1][:20]}...")  # 只打印前20个字
                print(f"👤 你的选择: {row[2]} | 🎯 正确答案: {row[3]}")
                print(f"✅ 是否答对: {bool(row[4])}")
                print("-" * 30)

        # 顺手查一下聊天记录表
        cursor.execute("SELECT count(*) FROM chat_histories")
        chat_count = cursor.fetchone()[0]
        print(f"💬 顺便提一句，聊天记录表里现在有 {chat_count} 条数据。")

        conn.close()

    except sqlite3.OperationalError as e:
        print(f"❌ 数据库读取报错 (是不是表还没建？): {e}")


if __name__ == "__main__":
    check_database()