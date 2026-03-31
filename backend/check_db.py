# 检查数据库有没有东西 (升级版雷达)
import sqlite3
import os


def check_database():
    # 1. 确认数据库名字（根据你 database.py 里的实际情况修改）
    db_path = os.path.abspath("a25_data.db")

    print("=" * 50)
    print(f"🔍 [雷达扫描] 正在检查数据库文件绝对路径:\n👉 {db_path}")
    print("=" * 50)

    # 2. 检查文件物理上存不存在
    if not os.path.exists(db_path):
        print("❌ 致命错误：找不到数据库文件！如果你是用 Docker 跑的，数据可能在容器里的 /app 目录下。")
        return

    # 3. 暴力撬开数据库读取
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # ==========================================
        # 🌟 升级点 1：明确指定列名，避免索引错乱！带上我们刚加的身份钢印
        # ==========================================
        cursor.execute(
            "SELECT id, user_id, course_id, question, user_choice, correct_answer, is_correct FROM quiz_records")
        records = cursor.fetchall()

        if not records:
            print("⚠️ [结果] quiz_records 表里是空的！快去网页上点一下出题并提交！")
        else:
            print(f"🎉 [大获全胜] 成功在数据库中搜查到 {len(records)} 条做题记录：\n")
            for row in records:
                print(f"🆔 记录 ID: {row[0]}")
                # 👇 这里就是见证奇迹的时刻，看能不能打出 student_888
                print(f"🎓 学生ID: {row[1]} | 📚 课程: {row[2]}")
                print(f"📝 题目: {str(row[3])[:20]}...")
                print(f"👤 选择: {row[4]} | 🎯 答案: {row[5]} | ✅ 答对: {bool(row[6])}")
                print("-" * 30)

        # ==========================================
        # 🌟 升级点 2：查聊天记录时，也顺便把 user_id 查出来，双重验证！
        # ==========================================
        cursor.execute("SELECT count(*) FROM chat_histories")
        chat_count = cursor.fetchone()[0]
        print(f"\n💬 顺便提一句，聊天记录表里现在有 {chat_count} 条数据。")

        if chat_count > 0:
            print("📖 [翻开日记本] 为您展示最近的 6 条聊天记录：")
            # 倒序取最新的6条，并明确取出 user_id 和 course_id
            cursor.execute("SELECT role, content, user_id, course_id FROM chat_histories ORDER BY id DESC LIMIT 6")
            recent_chats = cursor.fetchall()
            recent_chats.reverse()

            for chat in recent_chats:
                role_db, content_db, user_id, course_id = chat

                role_icon = "👤 你" if role_db == "user" else "🤖 助教"
                display_content = content_db.replace('\n', ' ')
                display_content = display_content[:60] + "..." if len(display_content) > 60 else display_content

                # 👇 在日记本里也展示用户的身份印记
                print(f"{role_icon} [属于:{user_id}]: {display_content}")

            print("-" * 30)

        conn.close()

    except sqlite3.OperationalError as e:
        print(f"❌ 数据库读取报错: {e}\n(可能是表名不对，或者是最新加的字段还没同步建表)")


if __name__ == "__main__":
    check_database()