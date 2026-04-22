from fastapi import FastAPI, HTTPException, Form, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import uvicorn
import os
import json
import uuid
import re
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# 导入你原本的 OCR 核心逻辑
try:
    from ocr_service import extract_text_from_images
except ImportError as e:
    print(f"⚠️ 警告: 无法导入 ocr_service，请检查依赖。错误: {e}")


    def extract_text_from_images(image_urls, max_images=2):
        return "系统提示：OCR 服务占位符。提取内容失败。"

app = FastAPI(title="A25 Grading & Vision Service (批改与视觉微服务)")


# 定义网关传过来的数据格式
class OCRRequest(BaseModel):
    images: List[str]


@app.get("/")
async def root():
    return {"message": "Grading & Vision Service is running! 视觉批改节点已就绪。"}


@app.post("/api/ocr")
async def process_ocr(request: OCRRequest):
    """
    提供给内网 Agent 网关调用的 OCR 专属接口
    """
    print(f"👁️ [视觉服务] 收到网关发来的 OCR 解析请求，共 {len(request.images)} 张图片。")
    try:
        if not request.images:
            raise ValueError("图片列表为空")

        # 调用你原有的核心 OCR 算法
        extracted_text = extract_text_from_images(request.images, max_images=2)

        print(f"✅ [视觉服务] OCR 解析完成，提取 {len(extracted_text)} 字符。")
        return {"data": extracted_text}

    except Exception as e:
        print(f"❌ [视觉服务] OCR 解析过程发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 核心底层算法：手术刀级 Word 节点批注 (Run级别)
# ==========================================
def add_comment_to_run(run, comment_text):
    """精准操纵 Word 底层 XML 树，仅包裹具体的词组节点 (Run)，不再感染全段"""
    comment_id = str(abs(hash(comment_text)) % 10000)
    r_xml = run._r

    # 构造 Start 节点
    comment_start = OxmlElement('w:commentRangeStart')
    comment_start.set(qn('w:id'), comment_id)

    # 构造 End 节点
    comment_end = OxmlElement('w:commentRangeEnd')
    comment_end.set(qn('w:id'), comment_id)

    # 构造 Reference 节点 (侧边栏气泡)
    comment_ref = OxmlElement('w:r')
    comment_ref_xml = OxmlElement('w:commentReference')
    comment_ref_xml.set(qn('w:id'), comment_id)
    comment_ref.append(comment_ref_xml)

    # 在具体的词组前后插入批注节点
    r_xml.addprevious(comment_start)
    r_xml.addnext(comment_end)
    comment_end.addnext(comment_ref)

    # 仅高亮当前这个小词组，避免大面积误杀
    run.font.highlight_color = 7


# ==========================================
# 接口：高容错文本对齐与批注生成
# ==========================================
@app.post("/api/annotate_docx")
async def annotate_docx(
        file: UploadFile = File(...),
        annotations_json: str = Form(...)
):
    temp_input_path = f"/tmp/input_{uuid.uuid4().hex}.docx"
    temp_output_path = f"/tmp/output_{uuid.uuid4().hex}.docx"

    with open(temp_input_path, "wb") as f:
        f.write(await file.read())

    try:
        annotations = json.loads(annotations_json).get("annotations", [])
        doc = Document(temp_input_path)

        for anno in annotations:
            target_text = anno.get("target_text", "").strip()
            comment = anno.get("comment", "")
            if not target_text:
                continue

            # 🚨 核心修复 1：去除所有空格与特殊空白符，进行绝对“裸奔”匹配
            clean_target = re.sub(r'\s+', '', target_text)

            found = False
            for para in doc.paragraphs:
                clean_para = re.sub(r'\s+', '', para.text)

                # 如果这个段落确实包含了目标文本
                if clean_target in clean_para and clean_target != "":

                    # 🚨 核心修复 2：在段落内部寻找最贴近的 Run 节点，避免全段高亮
                    target_run = None
                    for run in para.runs:
                        clean_run = re.sub(r'\s+', '', run.text)
                        if not clean_run: continue

                        # 只要这个 run 包含了目标词的一部分，或者目标词包含了这个 run
                        if clean_run in clean_target or clean_target in clean_run:
                            target_run = run
                            break  # 锁定嫌疑节点

                    if not target_run and para.runs:
                        target_run = para.runs[-1]  # 如果被严重切碎，挂在段落最后一个词上

                    if target_run:
                        add_comment_to_run(target_run, comment)
                        found = True
                        break  # 只批注第一次出现的地方

            # 兜底：如果被表格或极其诡异的格式阻断没找到，放在末尾
            if not found:
                doc.add_paragraph(f"【A25全局强提示】针对原文定位失败：『{target_text}』 -> {comment}")

        doc.save(temp_output_path)

        return FileResponse(
            temp_output_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="A25智能批注版_" + file.filename
        )

    except Exception as e:
        return {"error": f"文档批注逆向渲染失败: {str(e)}"}
    finally:
        if os.path.exists(temp_input_path): os.remove(temp_input_path)


# 本地独立测试入口
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)