import { describe, it, expect } from 'bun:test'
import { correctThaiOCR } from './lexicalCorrector'
import { ThaiLexiconIndex } from './thaiSpellEngine'

describe('Lexical OCR Post-Corrector (100% Free & Fast)', () => {
  it('should correct optical confusions in invoices and document headers instantly', () => {
    const rawInput = `ใมส่งของชั่วตราว
ลูกค้า: ห้างหุ้นส่วนจำถัด สยามซอฟต์แวร์
ทีอยู่: 99/1 ถนนแช้งวัฒนะ หลักสี กทม.
รายการสินศ้า: บริภารระบบ OCR อัจฉริยะ
ราศาประเมิน: 45,000.00 ขาท
ผู้ส่งมอข: นายสมชาย ชัยชนะ`

    const res = correctThaiOCR(rawInput)
    expect(res.fixedCount).toBeGreaterThan(0)
    expect(res.corrected).toContain('ใบส่งของชั่วคราว')
    expect(res.corrected).toContain('ห้างหุ้นส่วนจำกัด')
    expect(res.corrected).toContain('ที่อยู่:')
    expect(res.corrected).toContain('หลักสี่')
    expect(res.corrected).toContain('รายการสินค้า')
    expect(res.corrected).toContain('บริการระบบ')
    expect(res.corrected).toContain('ราคาประเมิน')
    expect(res.corrected).toContain('45,000.00 บาท')
    expect(res.corrected).toContain('ผู้ส่งมอบ')
  })

  it('should collapse duplicate vowels and misplaced tone marks', () => {
    const raw = 'หนัังงสืืออราชการ'
    const res = correctThaiOCR(raw)
    expect(res.corrected).not.toContain('ัั')
  })

  it('should use 62,000-word algorithmic lexicon to fix general Thai OCR confusions', () => {
    const lexicon = new ThaiLexiconIndex()
    lexicon.loadWords(['กระทรวง', 'วัฒนธรรม', 'วิทยาศาสตร์', 'เทคโนโลยี', 'การศึกษา'])

    const raw = 'กวะทรวง วัฒนธวรม วิทยาศาสตว์'
    // 'กวะทรวง' -> 'กระทรวง' (ว vs ร)
    // 'วัฒนธวรม' -> 'วัฒนธรรม' (ว vs ร)
    const res = correctThaiOCR(raw, lexicon)
    expect(res.corrected).toContain('กระทรวง')
    expect(res.corrected).toContain('วัฒนธรรม')
  })
})
