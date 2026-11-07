import { describe, it, expect } from 'bun:test'
import { canonicalThai } from './thaiNorm'

describe('Thai Canonicalization (thaiNorm)', () => {
  it('should collapse double sara e into sara ae', () => {
    expect(canonicalThai('เเม่')).toBe('แม่')
    expect(canonicalThai('เเปลง')).toBe('แปลง')
  })

  it('should remap legacy PUA tone marks to standard unicode', () => {
    // 0xF705 is PUA mai ek (0x0E48)
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
})
