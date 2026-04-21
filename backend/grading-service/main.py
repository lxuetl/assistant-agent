from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import uvicorn
import os

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


# 本地独立测试入口
if __name__ == "__main__":
    # 批改微服务固定在 8002 端口
    uvicorn.run(app, host="0.0.0.0", port=8002)