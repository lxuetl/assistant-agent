import os
import math
import asyncio # 异步编程核心库
from typing import AsyncGenerator, List, Dict, Any
from langchain_openai import ChatOpenAI # LangChain 封装的 OpenAI 兼容模型类
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage
import json
import re
from ocr_service import extract_text_from_images


# 模型工厂
class ModelFactory:
    @staticmethod
    def create_chat_model():
        return ChatOpenAI(
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            model="qwen3.5-35b-a3b", # 换了个多模态模型
            temperature=0, # 温度=0，回答更精准、无随机性
            streaming=True,  # 开启流式输出
            verbose=False # 关闭详细日志
        )

# 工具箱
class AgentTools:
    @staticmethod
    def course_knowledge_search(query: str):
        from rag_service import ask_knowledge_base # 这里结合了rag_service文件，调用知识库
        return ask_knowledge_base(query)

    @staticmethod
    def expert_calculator(expression: str): # 安全执行数学表达式计算
        try:
            return str(eval(expression, {"__builtins__": None}, {"math": math}))
        except Exception as e:
            return f"计算错误: {str(e)}"


# 核心 Agent 类 (支持中间件和流式)
class A25Agent:
    def __init__(self):
        self.llm = ModelFactory.create_chat_model() # 创建大模型实例
        self.tools_map = {
            "course_knowledge_search": AgentTools.course_knowledge_search,
            "expert_calculator": AgentTools.expert_calculator
        }
        # 定义工具描述
        self.tools_desc = [
            {
                "type": "function",
                "function": {
                    "name": "course_knowledge_search",
                    "description": "查询历史课件、PDF资料时调用。注意：如果要读取当前屏幕、当前网页内容，请【绝对不要】调用此工具，直接看上下文即可！",
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
        # 给大模型绑定工具能力
        self.llm_with_tools = self.llm.bind_tools(self.tools_desc)

    # --- 模拟中间件 Hooks ---
    async def _before_call_hook(self, messages):
        print(f"[思考中] 当前上下文消息数: {len(messages)}")

    async def _after_tool_hook(self, tool_name, result):
        print(f" [工具反馈] {tool_name} 执行结果: {str(result)[:50]}...")

    async def execute_stream(self, user_input: str, page_context: dict = None) -> AsyncGenerator[str, None]:
        # 1. 准备系统设定文字
        sys_prompt = "你是一个专业的 A25 教学助教。请灵活使用工具。如果收到图片，请仔细观察图片内容来回答。\n"
        sys_prompt += "【最高指令】：如果用户让你看屏幕、读取界面，请直接从下方的【网页实时抓取数据】中提取，千万不要调用搜索工具！\n"
        if page_context:
            sys_prompt += f"\n--- 网页实时抓取数据 ---\n【标题】: {page_context.get('title', '未知')}\n"
            if page_context.get('content'):
                sys_prompt += f"【文字内容】:\n{page_context.get('content')}\n"
            sys_prompt += f"------------------------\n\n"

        # 🌟 2. 偷梁换柱：把系统提示词和用户输入合并成一段文字！
        combined_text = sys_prompt + "【用户问题】: " + user_input

        # 3. 组装多模态消息列表
        user_content_list = [{"type": "text", "text": combined_text}]

        # 如果有图片，把图片追加进去
        if page_context and page_context.get('images'):
            for img_url in page_context['images'][:3]:
                user_content_list.append({
                    "type": "image_url",
                    "image_url": {"url": img_url}
                })

        # 🚨 4. 关键修复：抛弃 SystemMessage，只传一个包含所有内容的 HumanMessage！
        messages = [
            HumanMessage(content=user_content_list)
        ]

        for _ in range(5):
            final_chunk = None

            async for chunk in self.llm_with_tools.astream(messages):
                if final_chunk is None:
                    final_chunk = chunk
                else:
                    final_chunk += chunk

                if chunk.content:
                    yield chunk.content

            messages.append(final_chunk)

            if not final_chunk.tool_calls:
                break

            for tool_call in final_chunk.tool_calls:
                t_name = tool_call["name"]
                t_args = tool_call["args"]

                yield f"\n> [系统状态] 正在调用 {t_name}...\n"

                func = self.tools_map.get(t_name)
                if func:
                    result = func(**t_args)
                else:
                    result = "错误：未知工具"

                await self._after_tool_hook(t_name, result)
                messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # 👇 这里的缩进已经全部修好了！
    async def generate_quiz(self, page_context: dict) -> dict:
        image_urls = page_context.get('images', [])

        if not image_urls:
            return {"error": "前端未传回任何课件图片，无法出题！"}

        print(f"👁️ [出题引擎] 接收到 {len(image_urls)} 张课件截图，正在启动 OCR 动态提取...")

        # 1. 调用咱们的 OCR 兵工厂，把图片变成纯文字（最多读前2张，保证速度）
        extracted_text = extract_text_from_images(image_urls, max_images=2)

        if not extracted_text.strip():
            return {"error": "OCR 提取失败或图片上没有文字，无法出题。"}

        print(f"📄 [出题引擎] 成功提取到 {len(extracted_text)} 字的真实课件内容，准备交由大模型出题！")

        # 2. 强迫大模型输出 JSON 的提示词
        sys_prompt = """你是一个严谨的大学助教。请严格根据用户提供的【从课件上提取的真实文字】，生成1道高质量的单选题。
你必须严格按照以下 JSON 格式输出，不要包含任何额外的 Markdown 标记、解释或废话：
{
    "question": "题目内容...",
    "options": [
        {"key": "A", "value": "选项A的内容"},
        {"key": "B", "value": "选项B的内容"},
        {"key": "C", "value": "选项C的内容"},
        {"key": "D", "value": "选项D的内容"}
    ],
    "answer": "A",
    "explanation": "详细的答案解析..."
}"""

        # 🌟 3. 把 OCR 提取出的“真材实料”喂给纯文本大模型！
        user_content = f"请严格根据以下我刚从屏幕课件上提取的真实文字出题，必须确保题目和答案在这段文字中能找到依据：\n{extracted_text}"

        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=user_content)
        ]

        try:
            # 依然使用你原来那极其便宜的 qwen3.5-35b-a3b 纯文本模型
            response = await self.llm.ainvoke(messages)
            raw_text = response.content

            # 清洗 JSON
            cleaned_text = re.sub(r'```json\s*', '', raw_text)
            cleaned_text = re.sub(r'```\s*', '', cleaned_text).strip()

            quiz_data = json.loads(cleaned_text)
            print("🎉 [出题引擎] 基于 OCR 的严谨出题圆满完成！")
            return quiz_data

        except json.JSONDecodeError as e:
            print(f"❌ JSON 解析失败: {e}\n原始返回: {raw_text}")
            return {"error": "AI 生成的题目格式有误，请重试。"}
        except Exception as e:
            print(f"❌ 出题发生异常: {e}")
            return {"error": str(e)}

# --- 4. 测试启动 ---
if __name__ == "__main__":
    agent = A25Agent()
    async def run_test():
        async for text in agent.execute_stream("计算 1024 的平方根，并结合课件说说什么是 RAG。"):
            print(text, end="", flush=True)
    asyncio.run(run_test())