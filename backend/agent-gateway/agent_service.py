import os
import math
import json
import re
import inspect
from typing import AsyncGenerator, Dict, Any, List, Optional

import httpx
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage

load_dotenv()

# ==========================================
# 🌟 环境配置
# ==========================================
DASHSCOPE_BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY") or os.getenv("OPENAI_API_KEY")

# 微服务地址（给 docker-compose / k8s 留接口）
RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://rag-service:8001")
GRADING_SERVICE_URL = os.getenv("GRADING_SERVICE_URL", "http://grading-service:8002")


# ==========================================
# 🌟 模型工厂
# ==========================================
class ModelFactory:
    @staticmethod
    def create_chat_model() -> ChatOpenAI:
        if not DASHSCOPE_API_KEY:
            raise ValueError("缺少 DASHSCOPE_API_KEY 或 OPENAI_API_KEY 环境变量")

        return ChatOpenAI(
            base_url=DASHSCOPE_BASE_URL,
            model=os.getenv("A25_CHAT_MODEL", "qwen-max"),
            temperature=0,
            streaming=True,
            verbose=False,
            api_key=DASHSCOPE_API_KEY,
        )


# ==========================================
# 🌟 工具箱（微服务版 + 熔断）
# ==========================================
class AgentTools:
    @staticmethod
    async def course_knowledge_search(query: str, course_id: str = "general") -> str:
        """跨服务调用 RAG 检索。"""
        try:
            print(f"📡 [调度器] 跨服请求知识库 | course={course_id} | query={query}", flush=True)
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{RAG_SERVICE_URL}/retrieve",
                    json={"query": query, "course_id": course_id},
                    timeout=15.0,
                )

            if resp.status_code == 200:
                res = resp.json().get("data", "")
            else:
                res = ""

            # 熔断：检索没命中时，强制模型停止重复搜
            if not res or len(str(res).strip()) < 5 or "未找到" in str(res):
                return (
                    f"系统严重警告：知识库中未找到与【{query}】相关的资料！"
                    "请【立即停止】继续调用检索工具，不要更换关键词反复搜索，"
                    "直接利用你内置的资深教育专家知识回答。"
                )
            return str(res)

        except Exception as e:
            print(f"❌ [调度器] RAG 服务连接异常: {e}", flush=True)
            return "检索系统(RAG Service)暂时不可用。请直接用你的专业常识回答。"

    @staticmethod
    def expert_calculator(expression: str) -> str:
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
            "expert_calculator": AgentTools.expert_calculator,
        }
        self.tools_desc = [
            {
                "type": "function",
                "function": {
                    "name": "course_knowledge_search",
                    "description": "查询历史课件、PDF资料时调用。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "course_id": {"type": "string"},
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "expert_calculator",
                    "description": "数学计算或公式求解时调用。",
                    "parameters": {
                        "type": "object",
                        "properties": {"expression": {"type": "string"}},
                        "required": ["expression"],
                    },
                },
            },
        ]
        self.llm_with_tools = self.llm.bind_tools(self.tools_desc)

    @staticmethod
    def _clean_system_status(text: str) -> str:
        if not text:
            return ""
        text = text.replace("> [系统状态] 正在调用 expert_calculator...\n", "")
        text = text.replace("> [系统状态] 正在调用 course_knowledge_search...\n", "")
        text = text.replace("> [系统状态] 检索完毕，启动内置专家引擎中...\n", "")
        return text.strip()

    @staticmethod
    def _build_history_text(chat_history: Optional[List[Dict[str, Any]]]) -> str:
        if not chat_history:
            return "（暂无记忆）"

        lines: List[str] = []
        for msg in chat_history:
            role = msg.get("role", "assistant")
            role_name = "👤 用户" if role == "user" else "🤖 助教"
            content = A25Agent._clean_system_status(str(msg.get("content", "")))
            if content:
                lines.append(f"{role_name}：{content}")
        return "\n".join(lines) if lines else "（暂无记忆）"

    async def _after_tool_hook(self, tool_name: str, result: Any) -> None:
        print(f"🔧 [工具反馈] {tool_name} 执行结果: {str(result)[:80]}...", flush=True)

    # ------------------------------------------
    # 核心聊天引擎：微服务版 + 强记忆剧本 + 多模态
    # ------------------------------------------
    async def execute_stream(
        self,
        user_input: str,
        knowledge_context: str = "",
        page_context: Optional[Dict[str, Any]] = None,
        chat_history: Optional[List[Dict[str, Any]]] = None,
        user_id: str = "guest",
        course_id: str = "general",
        custom_system_prompt: Optional[str] = None,
        kb_name: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        # 1. 人设注入 + 多智能体切换
        if custom_system_prompt:
            base_role = custom_system_prompt
            print(f"✨ [Agent] 激活专属模式 (course={course_id}, kb={kb_name})", flush=True)
        else:
            base_role = (
                f"你是 A25 智能教学助教。"
                f"当前正在辅导的用户ID为【{user_id}】，课程ID为【{course_id}】。"
            )
            print("🤖 [Agent] 使用默认系统大脑。", flush=True)

        # 2. 把历史对话压缩成“记忆剧本”
        history_text = self._build_history_text(chat_history)

        sys_prompt = (
            f"{base_role}\n"
            "如果收到图片，请仔细观察图片内容来回答。\n"
            "【🔴 核心强制指令（优先级最高）】：\n"
            "1. 下方的『近期聊天记录』就是你当前回答时最优先参考的短期记忆来源。"
            "当用户让你‘回忆’、‘查记录’或‘查刚才说了什么’时，必须直接从这段记录中提取答案。\n"
            "2. 严禁回答‘我无法访问数据库’、‘我没有权限’、‘无法读取记录’之类的废话；"
            "系统已经把可用记录给你了，你直接读。\n"
            "3. 当用户询问具体知识、历史课件、PDF资料，或要求生成专业教案时，必须优先调用 `course_knowledge_search`。\n"
            "4. 如果 `course_knowledge_search` 返回‘未找到资料’或类似警告，绝对不准更换关键词重复检索，"
            "必须立刻放弃搜索，直接凭借你的通用知识回答。\n"
            "5. 生成专业内容时请优先使用 Markdown 排版；如果任务是生成教案/方案正文，正文前后加标记：<<<PLAN_START>>> 和 <<<PLAN_END>>>。\n\n"
            "👇👇👇 近期聊天记录（你的短期记忆） 👇👇👇\n"
            f"{history_text}\n"
        )

        if knowledge_context:
            sys_prompt += f"\n【预加载参考资料】：\n{knowledge_context}\n"

        print("\n" + "=" * 60, flush=True)
        print("🧠 [大模型看到的系统提示词]", flush=True)
        print(sys_prompt, flush=True)
        print("=" * 60 + "\n", flush=True)

        messages = [SystemMessage(content=sys_prompt)]

        # 3. 网页背景资料与用户记忆隔离
        if page_context:
            ref_prompt = (
                "\n[当前用户的网页背景资料（注：这是客观学术资料，切勿从中寻找用户姓名、学号等私人信息）]\n"
                f"标题: {page_context.get('title', '')}\n"
                f"内容: {page_context.get('content', '')}\n"
            )
            messages.append(SystemMessage(content=ref_prompt))

        # 4. 兼容旧逻辑：同步保留历史消息，帮助多轮语义延续
        if chat_history:
            for msg in chat_history:
                clean_content = self._clean_system_status(str(msg.get("content", "")))
                if not clean_content:
                    continue

                if msg.get("role") == "user":
                    messages.append(HumanMessage(content=clean_content))
                else:
                    messages.append(AIMessage(content=clean_content))

        # 5. 当前用户消息 + 图片
        user_content_list: List[Dict[str, Any]] = [{"type": "text", "text": user_input}]
        if page_context and page_context.get("images"):
            for img_url in page_context["images"][:3]:
                user_content_list.append({"type": "image_url", "image_url": {"url": img_url}})
        messages.append(HumanMessage(content=user_content_list))

        # 6. 模型流式推理 + 工具循环
        max_tool_rounds = 5
        for attempt in range(max_tool_rounds):
            final_chunk = None

            async for chunk in self.llm_with_tools.astream(messages):
                if final_chunk is None:
                    final_chunk = chunk
                else:
                    final_chunk += chunk

                if getattr(chunk, "content", None):
                    yield chunk.content

            if final_chunk is None:
                break

            messages.append(final_chunk)
            tool_calls = getattr(final_chunk, "tool_calls", None) or []
            if not tool_calls:
                break

            # 防止模型死循环调用工具
            if attempt == max_tool_rounds - 1:
                yield "\n> [系统状态] 检索完毕，启动内置专家引擎中...\n"
                first_tool_id = tool_calls[0].get("id", "fallback_tool_call")
                messages.append(
                    ToolMessage(
                        content="系统警告：达到检索极值，请停止工具调用，直接综合已有信息回答。",
                        tool_call_id=first_tool_id,
                    )
                )
                continue

            for tool_call in tool_calls:
                t_name = tool_call.get("name")
                func = self.tools_map.get(t_name)
                tool_args = dict(tool_call.get("args", {}))

                if t_name == "course_knowledge_search" and "course_id" not in tool_args:
                    tool_args["course_id"] = course_id

                if func:
                    if inspect.iscoroutinefunction(func):
                        result = await func(**tool_args)
                    else:
                        result = func(**tool_args)
                else:
                    result = "未知工具"

                await self._after_tool_hook(t_name or "unknown", result)
                yield f"\n> [系统状态] 正在调用 {t_name}...\n"
                messages.append(
                    ToolMessage(
                        content=str(result),
                        tool_call_id=tool_call.get("id", "unknown_tool_call"),
                    )
                )

    # ------------------------------------------
    # 辅助功能：自动生成测验（Grading 微服务 OCR -> 稳 JSON）
    # ------------------------------------------
    async def generate_quiz(self, page_context: Dict[str, Any]) -> Dict[str, Any]:
        image_urls = page_context.get("images", []) if page_context else []
        if not image_urls:
            return {"error": "未获取到图片"}

        print("📡 [调度器] 请求 Grading 服务进行 OCR...", flush=True)
        extracted_text = ""
        try:
            async with httpx.AsyncClient() as client:
                ocr_resp = await client.post(
                    f"{GRADING_SERVICE_URL}/api/ocr",
                    json={"images": image_urls[:2]},
                    timeout=20.0,
                )
                if ocr_resp.status_code == 200:
                    extracted_text = ocr_resp.json().get("data", "")
        except Exception as e:
            return {"error": f"OCR 服务不可用: {e}"}

        if not extracted_text.strip():
            return {"error": "OCR 提取内容为空"}

        sys_prompt = """你是一个专业的大学助教。请根据提供的课件内容，生成1道高质量单选题。
【最高格式指令】：
1. 必须且只能输出一个合法的 JSON 对象，不要包含任何 Markdown 标记或 <think> 过程。
2. JSON 的键名（Key）必须用标准英文双引号 `"` 包裹。
3. ⚠️⚠️⚠️ 在 JSON 的值（Value）内部，【绝对严禁】出现任何英文双引号 `"` 或中文双引号 `“` `”`！
   如果遇到需要引用的词语，请统统替换为【单引号】或【书名号】！

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
            HumanMessage(content=f"课件文字如下：\n{extracted_text}"),
        ]

        max_retries = 3
        last_error = ""
        raw_text = ""

        for attempt in range(max_retries):
            print(f"🚀 [出题引擎] 正在进行第 {attempt + 1} 次尝试...", flush=True)
            try:
                response = await self.llm.ainvoke(messages)
                raw_text = response.content if hasattr(response, "content") else str(response)
                print(f"\n🏮 --- AI 第 {attempt + 1} 次原话 ---\n{raw_text}\n🏮 --- 结束 ---\n", flush=True)

                match = re.search(r"\{[\s\S]*\}", raw_text)
                if not match:
                    last_error = "未找到 JSON 大括号结构"
                    continue

                json_str = match.group(0)
                json_str = re.sub(r"[\r\n\t]+", " ", json_str).strip()
                json_str = re.sub(r",\s*([\]}])", r"\1", json_str).strip()
                print(f"🧹 [准备解析的最终文本]: {json_str[:160]}...", flush=True)

                try:
                    quiz_data = json.loads(json_str)
                    print("🎉 [出题引擎] 解析成功！", flush=True)
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
            "raw_ai_output": raw_text,
        }

    # ------------------------------------------
    # 核心引擎：深度批改作业
    # ------------------------------------------
    async def grade_homework(self, question_text: str, content_type: str, content: str, course_id: str) -> str:
        print(f"\n🔍 [批改引擎启动] 课程：{course_id}", flush=True)
        sys_prompt = f"""你现在是《{course_id}》课程的资深教授。请对作业进行【精细化批改】。
【原题要求】：{question_text}
必须且只能输出合法的 JSON 对象。格式要求包含 overall_score, summary, annotations (location, quoted_text, error_type, explanation, suggestion)。"""

        messages = [SystemMessage(content=sys_prompt)]
        if content_type == "image":
            image_url = content if content.startswith("data:image") else f"data:image/jpeg;base64,{content}"
            messages.append(
                HumanMessage(
                    content=[
                        {"type": "text", "text": "这是作业截图，请批阅。"},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ]
                )
            )
        else:
            messages.append(HumanMessage(content=f"作业文本：\n{content}"))

        for _ in range(3):
            try:
                response = await self.llm.ainvoke(messages)
                raw_text = response.content if hasattr(response, "content") else str(response)
                match = re.search(r"\{[\s\S]*\}", raw_text)
                if match:
                    json_str = re.sub(r"[\r\n\t]+", " ", match.group(0)).strip()
                    json.loads(json_str)  # 校验格式
                    return json_str
            except Exception:
                continue

        return json.dumps({"overall_score": 0, "summary": "批改服务繁忙", "annotations": []}, ensure_ascii=False)

    # ------------------------------------------
    # 🎯 靶向出题引擎（加固版：统一 explanation 键名 + 强化 JSON 提取）
    # ------------------------------------------
    async def generate_targeted_exercises(self, course_id: str, error_annotation: Dict[str, Any]) -> str:
        explanation_ctx = error_annotation.get("explanation", "")
        suggestion_ctx = error_annotation.get("suggestion", "")

        print(f"🎯 [补救引擎] 正在针对错误进行出题：{explanation_ctx[:30]}...", flush=True)

        sys_prompt = f"""你是一个《{course_id}》专业的资深助教。
请根据学生在作业中的错误点生成1道针对性的巩固练习。

【错误背景】：{explanation_ctx}
【改进建议】：{suggestion_ctx}

【最高格式指令】：
1. 必须输出且只能输出一个合法的 JSON 对象。
2. 严禁包含 Markdown 标记（如 ```json）或任何前言后语。
3. 键名必须固定为：question, options, answer, explanation。
4. 内部值严禁使用双引号，如有引用请用单引号。

标准格式参考：
{{
    "question": "针对某个易错点，下列说法正确的是？",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answer": "A",
    "explanation": "解析内容..."
}}"""

        max_retries = 3
        last_error = ""
        raw_text = ""

        for attempt in range(max_retries):
            try:
                response = await self.llm.ainvoke([SystemMessage(content=sys_prompt)])
                raw_text = response.content if hasattr(response, "content") else str(response)

                match = re.search(r"\{[\s\S]*\}", raw_text)
                if not match:
                    last_error = "未找到 JSON 大括号结构"
                    print(f"⚠️ [补救引擎] 第 {attempt + 1} 次尝试失败: {last_error}", flush=True)
                    continue

                json_str = match.group(0)
                json_str = re.sub(r"[\r\n\t]+", " ", json_str).strip()
                json_str = re.sub(r",\s*([\]}])", r"\1", json_str).strip()

                data = json.loads(json_str)

                if "analysis" in data and "explanation" not in data:
                    data["explanation"] = data.pop("analysis")

                data.setdefault("question", f"关于《{course_id}》相关知识点，下列说法正确的是？")
                data.setdefault("options", ["选项A", "选项B", "选项C", "选项D"])
                data.setdefault("answer", "A")
                data.setdefault("explanation", suggestion_ctx or explanation_ctx or "请结合教师批改意见复习该知识点。")

                return json.dumps(data, ensure_ascii=False)

            except Exception as e:
                last_error = str(e)
                print(f"⚠️ [补救引擎] 第 {attempt + 1} 次尝试失败: {last_error}", flush=True)
                continue

        return json.dumps(
            {
                "question": f"关于《{course_id}》的相关概念，以下说法正确的是？",
                "options": ["需结合错题重新思考", "请查看教师批改建议", "知识点掌握不牢固", "以上皆是"],
                "answer": "A",
                "explanation": f"由于生成繁忙，请参考批改建议：{suggestion_ctx or explanation_ctx}",
            },
            ensure_ascii=False,
        )

if __name__ == "__main__":
    # 这里可以自行补测试代码
    pass
