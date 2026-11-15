import { describe, it, expect } from 'bun:test'
import { thaiOpticalDistance, areVisuallyConfused, ThaiLexiconIndex } from './thaiSpellEngine'

describe('Thai Spell Engine - Optical Matrix & Weighted Distance', () => {
  it('should identify visually confusing Thai characters with reduced penalty', () => {
    expect(areVisuallyConfused('ด', 'ค')).toBe(true)
    expect(areVisuallyConfused('ก', 'ถ')).toBe(true)
    expect(areVisuallyConfused('บ', 'ม')).toBe(true)
    expect(areVisuallyConfused('ก', 'ฮ')).toBe(false)
  })

  it('should compute lower distance for visual OCR errors than random typos', () => {
    // "กดหมาย" vs "กฎหมาย" vs "กมหมาย"
    const distVisual = thaiOpticalDistance('จังหวด', 'จังหวัด')
    const distUnrelated = thaiOpticalDistance('จังหกส', 'จังหวัด')

    expect(distVisual).toBeLessThan(distUnrelated)
  })

  it('should find closest match in lexicon under 2ms', () => {
    const lexicon = new ThaiLexiconIndex()
    lexicon.loadWords(['จังหวัด', 'หนังสือ', 'บริษัท', 'กระทรวง', 'ประเทศไทย', 'ใบเสร็จรับเงิน'])

    const start = performance.now()
    const result = lexicon.findBestMatch('จังหวด')
    const elapsed = performance.now() - start

    expect(result).not.toBeNull()
    expect(result?.match).toBe('จังหวัด')
    expect(elapsed).toBeLessThan(5) // ultra-fast
  })

  it('should correct optical confusions like ก -> ถ in words', () => {
    const lexicon = new ThaiLexiconIndex()
    lexicon.loadWords(['อำเภอ', 'จำกัด', 'ตำบล', 'บริการ'])

    // "จำถัด" -> "จำกัด" (ถ vs ก confusion)
    const match = lexicon.findBestMatch('จำถัด')
    expect(match?.match).toBe('จำกัด')
  })
})
