import os
import math
import asyncio# 异步编程核心库
from typing import AsyncGenerator, List, Dict, Any
from langchain_openai import ChatOpenAI# LangChain 封装的 OpenAI 兼容模型类
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage


# 模型工厂
class ModelFactory:
    @staticmethod
    def create_chat_model():
        return ChatOpenAI(
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            model="qwen3-vl-plus-2025-12-19",#换了个视觉模型
            temperature=0,# 温度=0，回答更精准、无随机性
            streaming=True,  # 开启流式输出
            verbose=False ## 关闭详细日志
        )
#  工具箱
class AgentTools:
    @staticmethod
    def course_knowledge_search(query: str):
        from rag_service import ask_knowledge_base#这里结合了rag_service文件，调用知识库
        return ask_knowledge_base(query)

    @staticmethod
    def expert_calculator(expression: str):#安全执行数学表达式计算
        try:
            return str(eval(expression, {"__builtins__": None}, {"math": math}))
        except Exception as e:
            return f"计算错误: {str(e)}"


# 核心 Agent 类 (支持中间件和流式)
class A25Agent:
    def __init__(self):
        self.llm = ModelFactory.create_chat_model()#创建大模型实例
        self.tools_map = {
            "course_knowledge_search": AgentTools.course_knowledge_search,
            "expert_calculator": AgentTools.expert_calculator
        }
        # 定义工具描述
        # self.tools_desc：按 LangChain 规范定义工具元信息（名称、描述、参数），大模型会根据这个描述判断 “什么时候该调用哪个工具”；
        self.tools_desc = [
            {
                "type": "function",
                "function": {
                    "name": "course_knowledge_search",
                    # 🌟 加上严厉的警告，防止它乱用工具
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
        #给大模型绑定工具能力，这是实现 “自动工具调用” 的关键 —— 大模型会分析用户问题，决定是否调用工具、调用哪个工具
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
            # 💡 关键：创建一个变量来累积完整的回复
            final_chunk = None

            async for chunk in self.llm_with_tools.astream(messages):
                # 将碎片缝合起来
                if final_chunk is None:
                    final_chunk = chunk
                else:
                    final_chunk += chunk

                # 实时推送文字内容给前端
                if chunk.content:
                    yield chunk.content

            # 将缝合后的完整 AIMessage 添加到历史记录
            messages.append(final_chunk)

            # 检查是否有完整的工具调用
            if not final_chunk.tool_calls:
                break

            # 此时 final_chunk.tool_calls 里的参数才是完整的
            for tool_call in final_chunk.tool_calls:
                t_name = tool_call["name"]
                t_args = tool_call["args"]

                # 给前端一个状态提示
                yield f"\n> [系统状态] 正在调用 {t_name}...\n"

                func = self.tools_map.get(t_name)
                # 容错处理：确保参数存在再调用
                if func:
                    # 这里的 **t_args 现在会有正确的 'query' 或 'expression' 了
                    result = func(**t_args)
                else:
                    result = "错误：未知工具"

                await self._after_tool_hook(t_name, result)
                messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

# --- 4. 测试启动 ---
if __name__ == "__main__":
    agent = A25Agent()
    async def run_test():
        async for text in agent.execute_stream("计算 1024 的平方根，并结合课件说说什么是 RAG。"):
            print(text, end="", flush=True)
    asyncio.run(run_test())