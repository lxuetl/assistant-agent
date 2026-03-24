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

    async def execute_stream(self, user_input: str, page_context: dict = None) -> AsyncGenerator[str, None]:
        sys_prompt = "你是一个专业的 A25 教学助教。如果收到图片，请仔细观察图片内容来回答。\n"
        if page_context:
            sys_prompt += f"\n--- 网页实时数据 ---\n【标题】: {page_context.get('title')}\n内容: {page_context.get('content')}\n"

        combined_text = sys_prompt + "\n【用户问题】: " + user_input
        user_content_list = [{"type": "text", "text": combined_text}]

        if page_context and page_context.get('images'):
            for img_url in page_context['images'][:3]:
                user_content_list.append({"type": "image_url", "image_url": {"url": img_url}})

        messages = [HumanMessage(content=user_content_list)]

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

        # 🌟 终极护城河提示词：从源头彻底掐死引号问题
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

if __name__ == "__main__":
    # 测试代码略
    pass