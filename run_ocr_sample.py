import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from runtime.line_engine import LineOCR

def main():
    print(" กำลังทดสอบโหลด LineOCR Engine...")
    ocr = LineOCR(".", threads=1)
    print(" โหลดโมเดล OpenThai2.0-OCR สำเร็จ!")

    # สร้างรูปภาพตัวอย่างสำหรับทดสอบ OCR
    img_path = "sample_test.png"
    img = Image.new('RGB', (600, 150), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # วาดข้อความภาษาไทย/อังกฤษ (ใช้ฟอนต์ระบบพื้นฐานหรือ default)
    try:
        # ลองใช้ฟอนต์ Tahoma / Angsana / Cordia ของ Windows
        font_path = "C:/Windows/Fonts/tahoma.ttf"
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, 28)
        else:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    draw.text((30, 30), "สวัสดีประเทศไทย OpenThai 2.0 OCR", fill=(0, 0, 0), font=font)
    draw.text((30, 80), "Fast Thai and English printed-text OCR", fill=(0, 0, 0), font=font)
    img.save(img_path)
    print(f" สร้างภาพทดสอบแล้ว: {img_path}")

    # รัน OCR
    print(" กำลังประมวลผล OCR...")
    result = ocr.read(img_path)

    print("\n" + "="*40)
    print(" ผลลัพธ์การอ่าน OCR:")
    print("="*40)
    print(result.get("text", ""))
    print("="*40)
    
    for idx, line in enumerate(result.get("lines", [])):
        print(f"Line {idx+1}: [{line.get('text')}] (Confidence: {line.get('confidence', 0):.2f})")

if __name__ == "__main__":
    main()
