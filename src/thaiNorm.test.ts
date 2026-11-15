import { describe, it, expect } from 'bun:test'
import { canonicalThai } from './thaiNorm'

describe('Thai Canonicalization (thaiNorm)', () => {
  it('should collapse double sara e into sara ae', () => {
    expect(canonicalThai('เเม่')).toBe('แม่')
    expect(canonicalThai('เเปลง')).toBe('แปลง')
  })

  it('should remap legacy PUA tone marks to standard unicode', () => {
    const legacyText = String.fromCharCode(0x0E17, 0x0E35, 0xF705)
    const normalized = canonicalThai(legacyText)
    expect(normalized).toBe('ที่')
  })

  it('should drop zero-width and invisible control characters', () => {
    const textWithZW = 'ทด\u200Bสอบ\uFEFFระบบ'
    expect(canonicalThai(textWithZW)).toBe('ทดสอบระบบ')
  })

  it('should normalize non-breaking spaces to standard spaces and trim excess', () => {
    const textWithNbsp = '  ข้อความ\u00A0\u00A0ทดสอบ   '
    expect(canonicalThai(textWithNbsp)).toBe('ข้อความ ทดสอบ')
  })

  // NEW TDD SPEC: Optical character confusions on legal/invoice documents
  it('should resolve optical character substitutions in invoice headers', () => {
    expect(canonicalThai('ใมส่งของชั่วคราว')).toBe('ใบส่งของชั่วคราว')
    expect(canonicalThai('ราศาประเมิน: 45,000.00 บาท')).toBe('ราคาประเมิน: 45,000.00 บาท')
    expect(canonicalThai('ทีอยู่: 99/1 ถนนแจ้งวัฒนะ หลักสี กทม.')).toBe('ที่อยู่: 99/1 ถนนแจ้งวัฒนะ หลักสี่ กทม.')
  })
})
