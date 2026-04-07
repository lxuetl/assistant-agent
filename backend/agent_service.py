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

    async def execute_stream(
                self,
                user_input: str,
                page_context: dict = None,
                chat_history: list = None,
                user_id: str = "guest",
                course_id: str = "general"
    ) -> AsyncGenerator[str, None]:

            # 1. 记忆降维打击：把历史对话转成纯文本剧本
            history_text = ""
            if chat_history:
                for msg in chat_history:
                    role_name = "👤 用户" if msg["role"] == "user" else "🤖 助教"
                    clean_content = msg["content"].replace("> [系统状态] 正在调用 expert_calculator...\n", "")
                    clean_content = clean_content.replace("> [系统状态] 正在调用 course_knowledge_search...\n", "")
                    history_text += f"{role_name}：{clean_content}\n"

            # 🌟 2. 构造带强制记忆及【任务执行标记】的系统人设
            sys_prompt = (
                f"你是 A25 智能教学助教。当前正在辅导的用户ID为【{user_id}】，课程ID为【{course_id}】。\n"
                "如果收到图片，请仔细观察图片内容来回答。\n"
                "【🔴 核心强制指令（优先级最高）】：\n"
                "1. 下方的『近期聊天记录』就是你唯一的记忆来源，请直接从记录中提取答案。\n"
                "2. 严禁回答“我没有权限”等话术，记录已公开提供，请直接复述名字和数据。\n\n"
                "【🛠️ Agent 任务执行指令】：\n"
                "如果你正在为教师生成【补救教案】或【针对性测验/题目】，你必须采用以下格式：\n"
                "在正文开始前加上魔法标记 `<<<PLAN_START>>>`，在正文结束后加上 `<<<PLAN_END>>>`。\n"
                "这两个标记中间的内容请使用标准的 Markdown 语法进行精美排版（包含标题、列表、加粗等）。\n\n"
                "👇👇👇 近期聊天记录（你的短期记忆） 👇👇👇\n"
                f"{history_text if history_text else '（暂无记忆）'}\n"
            )

            # 拦截调试
            print("\n" + "=" * 50)
            print("🧠 [拦截！Agent 剧本注入成功] 🧠")
            print(f"当前用户身份：{user_id}")
            print("=" * 50 + "\n")

            messages = [SystemMessage(content=sys_prompt)]

            # 3. 附件处理
            if page_context:
                ref_prompt = (
                    "\n[当前用户的网页背景资料]\n"
                    f"标题: {page_context.get('title')}\n"
                    f"内容: {page_context.get('content')}\n"
                )
                messages.append(SystemMessage(content=ref_prompt))

            # 4. 构造用户消息
            user_content_list = [{"type": "text", "text": user_input}]
            if page_context and page_context.get('images'):
                for img_url in page_context['images'][:3]:
                    user_content_list.append({"type": "image_url", "image_url": {"url": img_url}})

            messages.append(HumanMessage(content=user_content_list))

            # 5. 调用模型与工具循环
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

        sys_prompt = """你是一个专业的大学助教。请根据提供的课件内容，生成1道高质量单选题。
        【最高格式指令】：
        1. 必须且只能输出一个合法的 JSON 对象。
        2. JSON 的键名（Key）必须用标准英文双引号 `"` 包裹。
        3. ⚠️ 值（Value）内部绝对严禁出现双引号，请统统替换为单引号。"""

        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=f"课件文字如下：\n{extracted_text}")
        ]

        max_retries = 3
        last_error = ""

        for attempt in range(max_retries):
            try:
                response = await self.llm.ainvoke(messages)
                raw_text = response.content
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if not match: continue

                json_str = match.group(0)
                json_str = re.sub(r'[\r\n\t]+', ' ', json_str).strip()
                json_str = re.sub(r',\s*([\]}])', r'\1', json_str).strip()

                quiz_data = json.loads(json_str)
                return quiz_data
            except Exception as e:
                last_error = str(e)
                continue

        return {"error": "AI生成的题目格式有误", "last_error": last_error}

    async def grade_homework(self, question_text: str, content_type: str, content: str, course_id: str) -> str:
        print(f"📝 [作业批改引擎] 启动！当前课程：{course_id}", flush=True)

        sys_prompt = f"""你现在是《{course_id}》课程的资深教授。请对学生提交的作业进行【精细化批改】。
        【原题要求】：{question_text}
        【格式指令】：必须输出合法的 JSON，包含 overall_score, summary, annotations 字段。"""

        messages = [SystemMessage(content=sys_prompt)]

        if content_type == "image":
            image_url = content if content.startswith("data:image") else f"data:image/jpeg;base64,{content}"
            messages.append(HumanMessage(content=[
                {"type": "text", "text": "这是我的作业截图，请批改。"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]))
        else:
            messages.append(HumanMessage(content=f"这是我的作业文本：\n{content}"))

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = await self.llm.ainvoke(messages)
                raw_text = response.content
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if not match: continue
                json_str = match.group(0)
                json_str = re.sub(r'[\r\n\t]+', ' ', json_str).strip()
                json.loads(json_str)
                return json_str
            except:
                continue

        return json.dumps({"overall_score": 0, "summary": "批改失败", "annotations": []})

if __name__ == "__main__":
    pass