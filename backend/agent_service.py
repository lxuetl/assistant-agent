import os
import math
import asyncio
import json
import re
from typing import AsyncGenerator, List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage
from ocr_service import extract_text_from_images


# ==========================================
# 🌟 模型工厂
# ==========================================
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


# ==========================================
# 🌟 工具箱 (已增加智能兜底熔断机制)
# ==========================================
class AgentTools:
    @staticmethod
    def course_knowledge_search(query: str):
        from rag_service import ask_knowledge_base
        try:
            res = ask_knowledge_base(query)
            # 核心拦截机制：没搜到东西时，用人类语言强行警告大模型
            if not res or len(str(res).strip()) < 5 or "未找到" in str(res):
                return (f"系统严重警告：知识库中未找到与【{query}】相关的资料！"
                        "请【立即停止】继续调用检索工具，直接利用你内置的资深教育专家知识，为老师生成一份通用的方案！")
            return res
        except Exception as e:
            return f"检索系统异常: {str(e)}。请停止检索，直接用你的常识回答用户。"

    @staticmethod
    def expert_calculator(expression: str):
        try:
            return str(eval(expression, {"__builtins__": None}, {"math": math}))
        except Exception as e:
            return f"计算错误: {str(e)}"


# ==========================================
# 🌟 核心 Agent 类
# ==========================================
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

    # ------------------------------------------
    # 核心聊天引擎：带原生记忆同步与多智能体灵魂注入
    # ------------------------------------------
    async def execute_stream(
            self,
            user_input: str,
            page_context: dict = None,
            chat_history: list = None,
            user_id: str = "guest",
            course_id: str = "general",
            custom_system_prompt: str = None,
            kb_name: str = None
    ) -> AsyncGenerator[str, None]:

        # 1. 纯粹的系统人设 & 多智能体切换逻辑
        if custom_system_prompt:
            base_role = custom_system_prompt
            print(f"✨ [Agent 引擎] 已激活专属 AI 模式！(关联知识库: {kb_name})")
        else:
            base_role = f"你是 A25 智能教学助教。当前正在辅导的用户ID为【{user_id}】，课程ID为【{course_id}】。"
            print("🤖 [Agent 引擎] 使用默认 A25 系统大脑。")

        sys_prompt = (
            f"{base_role}\n"
            "如果收到图片，请仔细观察图片内容来回答。\n"
            "【🔴 核心强制指令（优先级最高）】：\n"
            "1. 当用户询问具体知识或要求生成专业教案时，你必须调用 `course_knowledge_search` 检索。\n"
            "   ⚠️ 警告：如果工具返回提示【未找到资料】，你【绝对不准】更换关键词重复检索！必须立刻放弃搜索，直接凭借你的通用知识回答！\n"
            "2. 严禁回答“我没有权限”等话术，记录已公开提供，请直接复述名字和数据。\n\n"
            "【🛠️ Agent 任务执行指令】：\n"
            "如果你正在为教师生成【补救教案】或【针对性测验/题目】，你必须采用以下格式：\n"
            "在正文开始前加上魔法标记 `<<<PLAN_START>>>`，在正文结束后加上 `<<<PLAN_END>>>`。\n"
            "这两个标记中间的内容请使用标准的 Markdown 语法进行精美排版。\n"
        )

        print("\n" + "=" * 50)
        print("🧠 [拦截！Agent 剧本与记忆同步开始] 🧠")
        print("=" * 50 + "\n")

        # 2. 组装标准对话流起点
        messages = [SystemMessage(content=sys_prompt)]

        # 3. 真正的记忆同步！(将字典历史转化为 LangChain 原生消息流)
        if chat_history:
            for msg in chat_history:
                clean_content = msg["content"].replace("> [系统状态] 正在调用 expert_calculator...\n", "")
                clean_content = clean_content.replace("> [系统状态] 正在调用 course_knowledge_search...\n", "")

                if msg["role"] == "user":
                    messages.append(HumanMessage(content=clean_content))
                else:
                    if clean_content.strip():
                        messages.append(AIMessage(content=clean_content))

        # 4. 附件处理
        if page_context:
            ref_prompt = (
                "\n[当前用户的网页背景资料]\n"
                f"标题: {page_context.get('title')}\n"
                f"内容: {page_context.get('content')}\n"
            )
            messages.append(SystemMessage(content=ref_prompt))

        # 5. 构造当前的最新提问
        user_content_list = [{"type": "text", "text": user_input}]
        if page_context and page_context.get('images'):
            for img_url in page_context['images'][:3]:
                user_content_list.append({"type": "image_url", "image_url": {"url": img_url}})

        messages.append(HumanMessage(content=user_content_list))

        # 6. 调用模型与工具循环 (最大尝试3次)
        for attempt in range(3):
            final_chunk = None
            async for chunk in self.llm_with_tools.astream(messages):
                if final_chunk is None:
                    final_chunk = chunk
                else:
                    final_chunk += chunk
                if chunk.content: yield chunk.content

            messages.append(final_chunk)

            # 如果大模型不再要求调用工具，直接退出循环
            if not final_chunk.tool_calls: break

            # 强制熔断兜底：最后一次尝试后强行停止搜索
            if attempt == 2:
                yield "\n> [系统状态] 知识库检索完毕，启动内置专家引擎生成中...\n"
                messages.append(ToolMessage(
                    content="系统警告：你已达到最大允许检索次数！请立刻停止任何检索行为，利用你现有的记忆和内置常识，直接生成输出给用户！",
                    tool_call_id=final_chunk.tool_calls[0]["id"]
                ))
                continue

            for tool_call in final_chunk.tool_calls:
                t_name = tool_call["name"]
                func = self.tools_map.get(t_name)

                result = func(**tool_call["args"]) if func else "未知工具"
                yield f"\n> [系统状态] 正在调用 {t_name}...\n"
                messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # ------------------------------------------
    # 辅助功能：自动生成测验 (OCR -> JSON)
    # ------------------------------------------
    async def generate_quiz(self, page_context: dict) -> dict:
        image_urls = page_context.get('images', [])
        if not image_urls: return {"error": "未获取到图片"}

        extracted_text = extract_text_from_images(image_urls, max_images=2)
        if not extracted_text.strip(): return {"error": "OCR 提取无内容"}

        sys_prompt = """你是一个专业的大学助教。请根据提供的课件内容，生成1道高质量单选题。
        【最高格式指令】：
        1. 必须且只能输出一个合法的 JSON 对象。
        2. JSON 的键名必须用标准英文双引号 `"` 包裹。
        3. 值内部严禁出现双引号，统统替换为单引号。"""

        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=f"课件文字如下：\n{extracted_text}")
        ]

        for attempt in range(3):
            try:
                response = await self.llm.ainvoke(messages)
                match = re.search(r'\{[\s\S]*\}', response.content)
                if not match: continue

                json_str = re.sub(r'[\r\n\t]+', ' ', match.group(0)).strip()
                json_str = re.sub(r',\s*([\]}])', r'\1', json_str).strip()
                return json.loads(json_str)
            except Exception:
                continue

        return {"error": "AI生成的题目格式有误", "last_error": "JSON解析失败"}

    # ------------------------------------------
    # 核心引擎：深度批改作业
    # ------------------------------------------
    async def grade_homework(self, question_text: str, content_type: str, content: str, course_id: str) -> str:
        print(f"\n{'=' * 50}\n🔍 [DEBUG 模式开启] 作业批改引擎启动！当前课程：{course_id}\n{'=' * 50}", flush=True)

        sys_prompt = f"""你现在是《{course_id}》课程的资深教授。请对学生提交的作业进行【精细化批改】。
【原题要求】：{question_text}
【最高格式指令】：
必须且只能输出合法的 JSON 对象，不含任何 Markdown 标记。格式如下：
{{
    "overall_score": 85,
    "summary": "大方向正确，细节有漏洞。",
    "annotations": [
        {{
            "location": "定位描述",
            "quoted_text": "必须原封不动摘录出错的原文字",
            "error_type": "逻辑错误",
            "explanation": "错误原因说明",
            "suggestion": "修改建议"
        }}
    ]
}}
⚠️ 约束：必须至少包含一条 annotations 数据！"""

        messages = [SystemMessage(content=sys_prompt)]

        if content_type == "image":
            image_url = content if content.startswith("data:image") else f"data:image/jpeg;base64,{content}"
            messages.append(HumanMessage(content=[
                {"type": "text", "text": "这是我的作业截图，请批改。"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]))
        else:
            messages.append(HumanMessage(content=f"这是我的作业文本：\n{content}"))

        last_error = ""
        for attempt in range(3):
            try:
                response = await self.llm.ainvoke(messages)
                match = re.search(r'\{[\s\S]*\}', response.content)
                if not match:
                    last_error = "未找到 JSON 大括号结构"
                    continue

                json_str = re.sub(r'[\r\n\t]+', ' ', match.group(0)).strip()
                json_str = re.sub(r',\s*([\]}])', r'\1', json_str).strip()

                # 校验能否正常 load
                json.loads(json_str)
                return json_str
            except Exception as e:
                last_error = str(e)
                continue

        return json.dumps({
            "overall_score": 0,
            "summary": f"系统开小差了，批改失败。错误信息：{last_error}",
            "annotations": []
        }, ensure_ascii=False)

    # ------------------------------------------
    # 🎯 新增引擎：靶向出题 (哪里跌倒就在哪里练)
    # ------------------------------------------
    async def generate_targeted_exercises(self, course_id: str, error_annotation: dict) -> str:
        print(f"\n🎯 [靶向出题引擎] 正在为薄弱点生成专属练习...")

        sys_prompt = f"""你是一位资深的大学教授。
        请根据学生在作业中犯的具体错误，生成 1 道极具针对性的单项选择题，帮助他巩固薄弱点。
        【最高格式指令】：
        1. 必须且只能输出一个合法的 JSON 对象。
        2. 绝对不要包含 Markdown 标记或任何其他废话。
        格式严格如下：
        {{
            "question": "题干内容...",
            "options": ["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"],
            "answer": "A",
            "analysis": "这道题为什么选A，以及如何避免之前犯的错误..."
        }}"""

        user_input = f"学生错误情况：{error_annotation.get('explanation', '')}。教授建议：{error_annotation.get('suggestion', '')}"

        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=user_input)
        ]

        try:
            response = await self.llm.ainvoke(messages)
            match = re.search(r'\{[\s\S]*\}', response.content)
            if match:
                json_str = re.sub(r'[\r\n\t]+', ' ', match.group(0)).strip()
                return json_str
            else:
                raise ValueError("未提取到 JSON")
        except Exception as e:
            print(f"❌ 出题失败: {e}")
            return json.dumps({
                "question": "（系统网络波动，触发备用题库）请问提取公因式的基本原则是什么？",
                "options": ["A. 提取各项的公有因式", "B. 随意提取", "C. 只提取数字", "D. 只提取字母"],
                "answer": "A",
                "analysis": "公因式就是各项都含有的公共因子。"
            }, ensure_ascii=False)


if __name__ == "__main__":
    pass