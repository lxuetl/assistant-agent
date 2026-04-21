#一个专门把前端图片链接变成纯文本的函数
import requests
from rapidocr_onnxruntime import RapidOCR

# 初始化 OCR 引擎（第一次运行可能会稍微加载一下模型文件）
ocr = RapidOCR()


def extract_text_from_images(image_urls: list, max_images: int = 2) -> str:
    """
    接收前端传来的图片 URL 列表，下载并进行 OCR 识别，返回拼接后的纯文本。
    max_images: 限制最多识别几张图，防止处理时间过长
    """
    full_text = ""

    for i, url in enumerate(image_urls[:max_images]):
        print(f"⏳ [OCR 引擎] 正在下载并识别第 {i + 1} 张图片...")
        try:
            # 1. 临时下载图片到内存
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                image_bytes = response.content

                # 2. 执行光学字符识别
                result, _ = ocr(image_bytes)

                # 3. 提取文字结果
                if result:
                    # result 的结构是 [ [[坐标], "识别出的文字", 置信度], ... ]
                    page_text = "\n".join([line[1] for line in result])
                    full_text += f"\n--- 第 {i + 1} 页提取内容 ---\n{page_text}\n"
                    print(f"✅ [OCR 引擎] 第 {i + 1} 张图片提取成功！")
                else:
                    print(f"⚠️ [OCR 引擎] 第 {i + 1} 张图片未发现明显文字。")
            else:
                print(f"❌ [OCR 引擎] 图片下载失败，状态码: {response.status_code}")

        except Exception as e:
            print(f"❌ [OCR 引擎] 处理图片 {url} 时发生异常: {e}")

    return full_text