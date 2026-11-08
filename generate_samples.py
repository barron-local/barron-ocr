import os
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = "test_samples"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Select suitable Windows font with Thai support
def get_font(size=24, bold=False):
    fonts = [
        "C:/Windows/Fonts/tahomabd.ttf" if bold else "C:/Windows/Fonts/tahoma.ttf",
        "C:/Windows/Fonts/cordiab.ttf" if bold else "C:/Windows/Fonts/cordia.ttf",
        "C:/Windows/Fonts/angsab.ttf" if bold else "C:/Windows/Fonts/angsa.ttf",
        "C:/Windows/Fonts/leelawad.ttf"
    ]
    for f in fonts:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()

def create_receipt():
    img = Image.new("RGB", (500, 600), "#ffffff")
    draw = ImageDraw.Draw(img)
    f_title = get_font(28, bold=True)
    f_body = get_font(20)
    f_bold = get_font(20, bold=True)
    
    draw.text((160, 30), "ร้านสะดวกซื้อ สบายใจ", fill="#111827", font=f_title)
    draw.text((150, 70), "ใบเสร็จรับเงินอย่างย่อ", fill="#4b5563", font=f_body)
    draw.line([(30, 110), (470, 110)], fill="#9ca3af", width=1)
    
    items = [
        ("กาแฟสด อเมริกาโน่", "55.00"),
        ("แซนด์วิชแฮมชีส", "35.00"),
        ("น้ำแร่ธรรมชาติ 600ml", "15.00"),
        ("ขนมปังเนยสด", "25.00")
    ]
    
    y = 130
    for name, price in items:
        draw.text((40, y), name, fill="#1f2937", font=f_body)
        draw.text((380, y), price, fill="#1f2937", font=f_body)
        y += 40
        
    draw.line([(30, y + 10), (470, y + 10)], fill="#9ca3af", width=1)
    y += 30
    draw.text((40, y), "ยอดรวมทั้งสิ้น (Total)", fill="#111827", font=f_bold)
    draw.text((360, y), "130.00 บาท", fill="#111827", font=f_bold)
    
    y += 50
    draw.text((120, y), "วันที่: 15/11/2026  เวลา: 14:30 น.", fill="#6b7280", font=f_body)
    draw.text((170, y + 40), "ขอบคุณที่ใช้บริการ", fill="#4b5563", font=f_body)
    
    img.save(os.path.join(OUTPUT_DIR, "01_receipt.png"))

def create_official_doc():
    img = Image.new("RGB", (700, 520), "#fafafa")
    draw = ImageDraw.Draw(img)
    f_title = get_font(26, bold=True)
    f_body = get_font(21)
    
    draw.text((250, 40), "บันทึกข้อความ", fill="#000000", font=f_title)
    draw.text((60, 100), "ส่วนราชการ: สำนักงานนวัตกรรมดิจิทัลแห่งชาติ", fill="#000000", font=f_body)
    draw.text((60, 140), "ที่: นร ๐๔๐๕/๑๒๘๙          วันที่: ๑๕ พฤศจิกายน ๒๕๖๙", fill="#000000", font=f_body)
    draw.text((60, 180), "เรื่อง: รายงานผลการประเมินแบบจำลองปัญญาประดิษฐ์ (AI OCR)", fill="#000000", font=f_body)
    draw.line([(60, 220), (640, 220)], fill="#000000", width=1)
    
    draw.text((60, 250), "เรียน  หัวหน้าฝ่ายวิจัยและพัฒนา", fill="#000000", font=f_body)
    content = [
        "ตามที่ได้มอบหมายให้ทีมงานทดสอบระบบ OpenThai 2.0 OCR นั้น",
        "ผลการทดสอบพบว่ามีความแม่นยำสูงถึงร้อยละ ๙๙.๕ ในเอกสารภาษาไทย",
        "และสามารถอ่านภาษาอังกฤษควบคู่กันได้อย่างมีประสิทธิภาพ",
        "จึงเรียนมาเพื่อโปรดพิจารณาอนุมัตินำไปใช้งานในระบบต่อไป"
    ]
    y = 290
    for line in content:
        draw.text((80, y), line, fill="#000000", font=f_body)
        y += 40
        
    img.save(os.path.join(OUTPUT_DIR, "02_official_letter.png"))

def create_bilingual_menu():
    img = Image.new("RGB", (650, 480), "#ffffff")
    draw = ImageDraw.Draw(img)
    f_title = get_font(30, bold=True)
    f_name = get_font(22, bold=True)
    f_sub = get_font(18)
    
    draw.text((220, 30), "เมนูเครื่องดื่ม / DRINKS", fill="#991b1b", font=f_title)
    draw.line([(50, 80), (600, 80)], fill="#e5e7eb", width=2)
    
    menus = [
        ("ชาเขียวมัทฉะลาเต้", "Matcha Green Tea Latte", "65 THB"),
        ("ชานมไทยโบราณ", "Traditional Thai Iced Milk Tea", "50 THB"),
        ("กาแฟลาเต้ร้อน", "Hot Café Latte (Single Shot)", "55 THB"),
        ("น้ำส้มยูซุโซดา", "Sparkling Yuzu Citrus Soda", "70 THB")
    ]
    
    y = 105
    for th, en, price in menus:
        draw.text((50, y), th, fill="#111827", font=f_name)
        draw.text((490, y), price, fill="#b91c1c", font=f_name)
        draw.text((50, y + 30), en, fill="#6b7280", font=f_sub)
        y += 75
        
    img.save(os.path.join(OUTPUT_DIR, "03_bilingual_menu.png"))

def create_shipping_label():
    img = Image.new("RGB", (600, 420), "#ffffff")
    draw = ImageDraw.Draw(img)
    f_bold = get_font(22, bold=True)
    f_body = get_font(19)
    
    draw.rectangle([(20, 20), (580, 400)], outline="#111827", width=2)
    draw.text((40, 35), "EXPRESS DELIVERY / บริการส่งด่วน", fill="#111827", font=f_bold)
    draw.text((400, 35), "TRACK: TH982341", fill="#1d4ed8", font=f_bold)
    draw.line([(20, 75), (580, 75)], fill="#111827", width=2)
    
    draw.text((40, 95), "ผู้ส่ง (Sender):", fill="#4b5563", font=f_body)
    draw.text((40, 125), "บริษัท บาร์รอน เทคโนโลยี จำกัด โทร. 02-999-8888", fill="#111827", font=f_body)
    draw.text((40, 155), "เลขที่ 123 อาคารสาทรทาวเวอร์ ชั้น 18 เขตสาทร กทม. 10120", fill="#111827", font=f_body)
    draw.line([(20, 195), (580, 195)], fill="#d1d5db", width=1)
    
    draw.text((40, 215), "ผู้รับ (Recipient):", fill="#4b5563", font=f_body)
    draw.text((40, 245), "คุณวรเดช สุขสวัสดิ์  โทร. 081-234-5678", fill="#111827", font=f_bold)
    draw.text((40, 275), "บ้านเลขที่ 88/9 หมู่บ้านสุขสำราญ ซอย 5", fill="#111827", font=f_body)
    draw.text((40, 305), "ตำบลบางตลาด อำเภอปากเกร็ด จังหวัดนนทบุรี 11120", fill="#111827", font=f_body)
    draw.text((40, 350), "หมายเหตุ: หากไม่มีผู้รับให้ติดต่อเบอร์สำรอง", fill="#b91c1c", font=f_body)
    
    img.save(os.path.join(OUTPUT_DIR, "04_shipping_label.png"))

def create_table_document():
    img = Image.new("RGB", (650, 420), "#ffffff")
    draw = ImageDraw.Draw(img)
    f_title = get_font(24, bold=True)
    f_th = get_font(19, bold=True)
    f_td = get_font(18)
    
    draw.text((180, 30), "ตารางเปรียบเทียบผลการดำเนินงาน", fill="#111827", font=f_title)
    
    headers = ["รหัส", "รายการอุปกรณ์", "จำนวน", "สถานะ"]
    cols = [40, 130, 420, 520]
    
    draw.rectangle([(30, 80), (620, 120)], fill="#f3f4f6")
    for h, x in zip(headers, cols):
        draw.text((x, 90), h, fill="#111827", font=f_th)
        
    rows = [
        ("A-101", "จอคอมพิวเตอร์ 27 นิ้ว 4K", "12 เครื่อง", "พร้อมส่ง"),
        ("A-102", "คีย์บอร์ดกลไกไร้สาย", "25 ชุด", "พร้อมส่ง"),
        ("B-201", "สายเชื่อมต่อ USB Type-C", "50 เส้น", "สินค้าหมด"),
        ("C-305", "เก้าอี้เพื่อสุขภาพ Ergonomic", "8 ตัว", "กำลังจัดเตรียม")
    ]
    
    y = 135
    for code, desc, qty, status in rows:
        draw.text((cols[0], y), code, fill="#374151", font=f_td)
        draw.text((cols[1], y), desc, fill="#111827", font=f_td)
        draw.text((cols[2], y), qty, fill="#374151", font=f_td)
        color = "#059669" if status == "พร้อมส่ง" else ("#dc2626" if status == "สินค้าหมด" else "#d97706")
        draw.text((cols[3], y), status, fill=color, font=f_td)
        draw.line([(30, y + 32), (620, y + 32)], fill="#e5e7eb", width=1)
        y += 45
        
    img.save(os.path.join(OUTPUT_DIR, "05_table_document.png"))

def create_tilted_receipt():
    # Create base receipt and rotate slightly to test deskew
    base = Image.new("RGB", (480, 380), "#ffffff")
    draw = ImageDraw.Draw(base)
    f_title = get_font(24, bold=True)
    f_body = get_font(20)
    
    draw.text((120, 30), "ใบส่งของชั่วคราว (Draft)", fill="#1f2937", font=f_title)
    draw.text((40, 90), "ลูกค้า: ห้างหุ้นส่วนจำกัด สยามซอฟต์แวร์", fill="#111827", font=f_body)
    draw.text((40, 130), "ที่อยู่: 99/1 ถนนแจ้งวัฒนะ หลักสี่ กทม.", fill="#111827", font=f_body)
    draw.text((40, 180), "รายการสินค้า: บริการระบบ OCR อัจฉริยะ", fill="#111827", font=f_body)
    draw.text((40, 220), "ราคาประเมิน: 45,000.00 บาท", fill="#1d4ed8", font=f_body)
    draw.text((40, 280), "ผู้ส่งมอบ: นายสมชาย ชัยชนะ", fill="#4b5563", font=f_body)
    
    # Rotate 4 degrees
    rotated = base.rotate(-4, expand=True, fillcolor="#f3f4f6")
    rotated.save(os.path.join(OUTPUT_DIR, "06_tilted_invoice.png"))

if __name__ == "__main__":
    create_receipt()
    create_official_doc()
    create_bilingual_menu()
    create_shipping_label()
    create_table_document()
    create_tilted_receipt()
    print("All sample images generated successfully in test_samples/")
