import os
import math
import asyncio
from typing import AsyncGenerator, List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage


# --- 1. 模型工厂 (解耦创建逻辑)
class ModelFactory:
    @staticmethod
    def create_chat_model():
        return ChatOpenAI(
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            model="qwen3.5-flash",
            temperature=0,
            streaming=True,  # 开启流式输出
            verbose=False
        )
#  工具箱 (业务逻辑层)
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


# 核心 Agent 类 (支持中间件和流式)
class A25Agent:
    def __init__(self):
        self.llm = ModelFactory.create_chat_model()
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
                    "description": "查询课件、PDF资料时调用。",
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

    # --- 模拟中间件 Hooks ---
    async def _before_call_hook(self, messages):
        print(f"[思考中] 当前上下文消息数: {len(messages)}")

    async def _after_tool_hook(self, tool_name, result):
        print(f" [工具反馈] {tool_name} 执行结果: {str(result)[:50]}...")

    async def execute_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        messages = [
            SystemMessage(content="你是一个专业的 A25 教学助教。请灵活使用工具回答。"),
            HumanMessage(content=user_input)
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