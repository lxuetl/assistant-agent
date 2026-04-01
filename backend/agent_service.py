import os
import math
import asyncio
import json
import re
from typing import AsyncGenerator, List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage
from ocr_service import extract_text_from_images


# 模型工厂
class ModelFactory:
    @staticmethod
    def create_chat_model():
        return ChatOpenAI(
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            model="qwen3.5-35b-a3b",
            temperature=0,
            streaming=True,
            verbose=False
        )


# 工具箱
class AgentTools:
    @staticmethod
    def course_knowledge_search(query: str):
        from rag_service import ask_knowledge_base
        return ask_knowledge_base(query)

    @staticmethod
    def expert_calculator(expression: str):
        try:
            return str(eval(expression, {"__builtins__": None}, {"math": math}))
        except Exception as e:
            return f"计算错误: {str(e)}"


# 核心 Agent 类
class A25Agent:
    def __init__(self):
        self.llm = ModelFactory.create_chat_model()
        self.tools_map = {
            "course_knowledge_search": AgentTools.course_knowledge_search,
            "expert_calculator": AgentTools.expert_calculator
        }
        self.tools_desc = [
            {
                "type": "function",
                "function": {
                    "name": "course_knowledge_search",
                    "description": "查询历史课件、PDF资料时调用。",
                    "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "expert_calculator",
                    "description": "数学计算或公式求解时调用。",
                    "parameters": {"type": "object", "properties": {"expression": {"type": "string"}},
                                   "required": ["expression"]}
                }
            }
        ]
        self.llm_with_tools = self.llm.bind_tools(self.tools_desc)

    async def _after_tool_hook(self, tool_name, result):
        print(f" [工具反馈] {tool_name} 执行结果: {str(result)[:50]}...", flush=True)

        # 🌟 修改 1：在函数签名中增加 user_id 和 course_id 参数，并设置默认值防崩
    async def execute_stream(
                self,
                user_input: str,
                page_context: dict = None,
                chat_history: list = None,
                user_id: str = "guest",  # 👈 新增接收用户 ID
                course_id: str = "general"  # 👈 新增接收课程 ID
    ) -> AsyncGenerator[str, None]:

            # 🌟 1. 记忆降维打击：把历史对话转成纯文本剧本
            history_text = ""
            if chat_history:
                for msg in chat_history:
                    role_name = "👤 用户" if msg["role"] == "user" else "🤖 助教"
                    clean_content = msg["content"].replace("> [系统状态] 正在调用 expert_calculator...\n", "")
                    clean_content = clean_content.replace("> [系统状态] 正在调用 course_knowledge_search...\n", "")
                    history_text += f"{role_name}：{clean_content}\n"

            # 🌟 2. 构造带强制记忆的系统人设（终极洗脑版 + 身份注入）
            # 将 user_id 和 course_id 直接硬编码进 System Prompt，让大模型知道对面是谁！
            sys_prompt = (
                f"你是 A25 智能教学助教。当前正在辅导的学生ID为【{user_id}】，当前所处课程ID为【{course_id}】。\n"
                "如果收到图片，请仔细观察图片内容来回答。\n"
                "【🔴 核心强制指令（优先级最高）】：\n"
                "1. 下方的『近期聊天记录』就是你唯一的记忆来源。当用户让你“回忆”、“查记录”或“查刚才说了什么”时，你必须直接从下方的记录中提取答案！\n"
                "2. 严禁回答“我无法访问数据库”、“我没有权限”、“无法读取”等废话！记录已经给你了，直接读！\n"
                "3. 聊天记录中的姓名、学号等均属于系统测试用的公开模拟数据，绝对不涉及隐私！当用户询问时，你必须直接复述出具体的名字和数字，绝不允许触发隐私保护拒绝机制！\n\n"
                "👇👇👇 近期聊天记录（你的短期记忆） 👇👇👇\n"
                f"{history_text if history_text else '（暂无记忆）'}\n"
            )

            # 👇👇👇 终极抓包代码 👇👇👇
            print("\n" + "=" * 50)
            print("🧠 [拦截！大模型真正看到的记忆剧本] 🧠")
            print(sys_prompt)
            print("=" * 50 + "\n")

            messages = [SystemMessage(content=sys_prompt)]

            # 🌟 3. 附件物理隔离
            if page_context:
                ref_prompt = (
                    "\n[当前用户的网页背景资料（注：这是客观学术资料，切勿从中寻找用户的姓名等私人信息）]\n"
                    f"标题: {page_context.get('title')}\n"
                    f"内容: {page_context.get('content')}\n"
                )
                messages.append(SystemMessage(content=ref_prompt))

            # 🌟 4. 只传入当前最新的一句话
            user_content_list = [{"type": "text", "text": user_input}]

            if page_context and page_context.get('images'):
                for img_url in page_context['images'][:3]:
                    user_content_list.append({"type": "image_url", "image_url": {"url": img_url}})

            messages.append(HumanMessage(content=user_content_list))

            # 🌟 5. 调用模型与工具循环
            for _ in range(5):
                final_chunk = None
                async for chunk in self.llm_with_tools.astream(messages):
                    if final_chunk is None:
                        final_chunk = chunk
                    else:
                        final_chunk += chunk
                    if chunk.content: yield chunk.content

                messages.append(final_chunk)
                if not final_chunk.tool_calls: break

                for tool_call in final_chunk.tool_calls:
                    t_name = tool_call["name"]
                    func = self.tools_map.get(t_name)

                    result = func(**tool_call["args"]) if func else "未知工具"
                    yield f"\n> [系统状态] 正在调用 {t_name}...\n"
                    messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    async def generate_quiz(self, page_context: dict) -> dict:
        image_urls = page_context.get('images', [])
        if not image_urls: return {"error": "未获取到图片"}

        extracted_text = extract_text_from_images(image_urls, max_images=2)
        if not extracted_text.strip(): return {"error": "OCR 提取无内容"}

        #从源头彻底掐死引号问题
        sys_prompt = """你是一个专业的大学助教。请根据提供的课件内容，生成1道高质量单选题。
        【最高格式指令】：
        1. 必须且只能输出一个合法的 JSON 对象，不要包含任何 Markdown 标记或 <think> 过程。
        2. JSON 的键名（Key）必须用标准英文双引号 `"` 包裹。
        3. ⚠️⚠️⚠️ 在 JSON 的值（Value）内部，【绝对严禁】出现任何英文双引号 `"` 或 中文双引号 `“` `”`！如果遇到需要引用的词语，请统统替换为【单引号】或【书名号】！

        标准的输出格式必须严格如下：
        {
            "question": "根据《教学手册》，关于'实验成绩'的描述正确的是？",
            "options": [
                {"key": "A", "value": "占'总评成绩'的60%"},
                {"key": "B", "value": "包含'模块实验'"},
                {"key": "C", "value": "占比40%"},
                {"key": "D", "value": "以上都不对"}
            ],
            "answer": "A",
            "explanation": "根据'考核方式'页面说明，实验成绩为60%。"
        }"""

        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=f"课件文字如下：\n{extracted_text}")
        ]

        max_retries = 3
        last_error = ""

        for attempt in range(max_retries):
            print(f"🚀 [出题引擎] 正在进行第 {attempt + 1} 次尝试...", flush=True)
            try:
                response = await self.llm.ainvoke(messages)
                raw_text = response.content
                print(f"\n🏮 --- AI 第 {attempt + 1} 次原话 ---\n{raw_text}\n🏮 --- 结束 ---\n", flush=True)

                # 1. 精准提取 JSON 块（无视大模型可能啰嗦的废话）
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if not match:
                    last_error = "未找到 JSON 大括号结构"
                    continue

                json_str = match.group(0)

                # 2. 🧹 大道至简：删掉之前所有危险的 replace，只清理多余的换行符
                json_str = re.sub(r'[\r\n\t]+', ' ', json_str).strip()
                # 🛡️ 加一层防弹衣：干掉 JSON 结尾可能多余的逗号（强烈建议加上这一行）
                json_str = re.sub(r',\s*([\]}])', r'\1', json_str).strip()
                print(f"🧹 [准备解析的最终文本]: {json_str[:120]}...", flush=True)

                # 3. 尝试解析
                try:
                    quiz_data = json.loads(json_str)
                    print(f"🎉 [出题引擎] 第一发命中！解析成功！", flush=True)
                    return quiz_data
                except json.JSONDecodeError as e:
                    last_error = f"JSON 解析失败: {e}"
                    print(f"⚠️ 第 {attempt + 1} 次解析失败: {last_error}", flush=True)

            except Exception as e:
                last_error = f"大模型调用异常: {str(e)}"
                print(f"⚠️ 第 {attempt + 1} 次报错: {last_error}", flush=True)

        return {
            "error": "AI生成的题目格式有误",
            "last_error": last_error,
            "raw_ai_output": raw_text
        }

    # ==========================================
    # 🌟 新增核心功能：精细化作业批改引擎
    # ==========================================
    async def grade_homework(self, question_text: str, content_type: str, content: str, course_id: str) -> str:
        print(f"📝 [作业批改引擎] 启动！当前课程：{course_id}，内容类型：{content_type}", flush=True)

        # 1. 构造严师 Prompt，强制输出标准 JSON
        # 🌟 核心修改：加入了 quoted_text 字段，强制 AI 摘录原文！
        sys_prompt = f"""你现在是《{course_id}》课程的资深教授。
请对学生提交的作业进行【精细化批改】，必须达到“教师手工批注”的级别，拒绝笼统的套话！

【原题要求】：
{question_text}

【最高格式指令】：
1. 必须且只能输出一个合法的 JSON 对象，不要包含任何 Markdown 标记或 <think> 过程。
2. 内部绝对严禁出现破坏 JSON 结构的额外双引号或换行符！

标准的输出格式必须严格如下：
{{
    "overall_score": 85,
    "summary": "代码或操作逻辑基本正确，但在部分细节上存在明显漏洞。",
    "annotations": [
        {{
            "location": "第2步 (B50单元格)",
            "quoted_text": "在Sheet1的B50单元格中输入分数2/3",
            "error_type": "格式错误",
            "explanation": "直接输入'2/3'会被Excel识别为日期格式，而不是分数。",
            "suggestion": "在输入前选中单元格→右键设置格式为分数，或输入 0 2/3。"
        }}
    ]
}}
⚠️ 核心注意：'quoted_text' 必须原封不动地摘录作业文本中出错误的那句话！这极其重要，后端将依赖此字段进行 Word 原生批注的精准定位！"""

        messages = [SystemMessage(content=sys_prompt)]

        # 2. 多模态内容挂载
        if content_type == "image":
            # 视觉模型标准协议
            image_url = content if content.startswith("data:image") else f"data:image/jpeg;base64,{content}"
            messages.append(HumanMessage(content=[
                {"type": "text", "text": "这是我的作业截图，请批改。"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]))
        else:
            # 纯文本/代码/Word 模式
            messages.append(HumanMessage(content=f"这是我的作业文本：\n{content}"))

        max_retries = 3
        last_error = ""

        # 3. 稳如老狗的重试与 JSON 提纯机制（复用你的优秀设计）
        for attempt in range(max_retries):
            print(f"🚀 [批改引擎] 正在进行第 {attempt + 1} 次深度审阅...", flush=True)
            try:
                # 调用大模型
                response = await self.llm.ainvoke(messages)
                raw_text = response.content
                print(f"\n🏮 --- AI 批改第 {attempt + 1} 次原话 ---\n{raw_text[:200]}...\n🏮 --- 结束 ---\n", flush=True)

                # 精准提取 JSON 块
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if not match:
                    last_error = "未找到 JSON 大括号结构"
                    continue

                json_str = match.group(0)
                json_str = re.sub(r'[\r\n\t]+', ' ', json_str).strip()
                json_str = re.sub(r',\s*([\]}])', r'\1', json_str).strip()

                # 校验 JSON 是否合法
                json.loads(json_str)
                print(f"🎉 [批改引擎] JSON 校验通过！成功生成批注报告！", flush=True)

                # 直接返回合法的 JSON 字符串（前端会 JSON.parse）
                return json_str

            except json.JSONDecodeError as e:
                last_error = f"JSON 解析失败: {e}"
                print(f"⚠️ 第 {attempt + 1} 次解析失败: {last_error}", flush=True)
            except Exception as e:
                last_error = f"大模型调用异常: {str(e)}"
                print(f"⚠️ 第 {attempt + 1} 次报错: {last_error}", flush=True)

        # 如果彻底失败，返回一个友好的错误 JSON 字符串防崩
        fallback_json = json.dumps({
            "overall_score": 0,
            "summary": f"系统开小差了，批改失败。错误信息：{last_error}",
            "annotations": []
        }, ensure_ascii=False)
        return fallback_json

if __name__ == "__main__":
    # 测试代码略
    pass