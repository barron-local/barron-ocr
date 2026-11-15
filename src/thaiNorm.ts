// Thai text normalization & common OCR post-corrections
const PUA: Record<number, number> = {
  0xf700: 0x0e10, 0xf701: 0x0e34, 0xf702: 0x0e35, 0xf703: 0x0e36, 0xf704: 0x0e37,
  0xf705: 0x0e48, 0xf706: 0x0e49, 0xf707: 0x0e4a, 0xf708: 0x0e4b, 0xf709: 0x0e4c,
  0xf70a: 0x0e48, 0xf70b: 0x0e49, 0xf70c: 0x0e4a, 0xf70d: 0x0e4b, 0xf70e: 0x0e4c,
  0xf70f: 0x0e0d, 0xf710: 0x0e31, 0xf711: 0x0e4d, 0xf712: 0x0e47, 0xf713: 0x0e48,
  0xf714: 0x0e49, 0xf715: 0x0e4a, 0xf716: 0x0e4b, 0xf717: 0x0e4c, 0xf718: 0x0e38,
  0xf719: 0x0e39, 0xf71a: 0x0e3a,
}

const DROP = new Set(['\u200B', '\u200C', '\u200D', '\u2060', '\u00AD', '\uFEFF'])

// High-confidence lexical word replacements for recurring OCR confusions in Thai documents
const THAI_OCR_FIXES: [RegExp, string][] = [
  [/ใมส่งของ/g, 'ใบส่งของ'],
  [/ชั่วตราว/g, 'ชั่วคราว'],
  [/บริภารระบบ/g, 'บริการระบบ'],
  [/ราศาประเมิน/g, 'ราคาประเมิน'],
  [/ทีอยู่:/g, 'ที่อยู่:'],
  [/หลักสี(?=[\s.]|$)/g, 'หลักสี่'],
]

export function canonicalThai(text: string): string {
  if (!text) return ''

  // 1. Map legacy PUA characters and drop invisible marks
  const chars: string[] = []
  for (const ch of text) {
    if (DROP.has(ch)) continue
    if (ch === '\u00A0') {
      chars.push(' ')
      continue
    }
    const code = ch.charCodeAt(0)
    if (PUA[code]) {
      chars.push(String.fromCharCode(PUA[code]))
    } else {
      chars.push(ch)
    }
  }

  let s = chars.join('').normalize('NFC')

  // 2. Collapse double sara e (เเ -> แ)
  s = s.replace(/เเ/g, 'แ')

  // 3. Normalize sara am combinations
  s = s.replace(/([่-๋]?)ํ([่-๋]?)า/g, (_, t1, t2) => `${t1 || t2 || ''}ำ`)

  // 4. Apply high-confidence OCR word confusions
  for (const [pattern, replacement] of THAI_OCR_FIXES) {
    s = s.replace(pattern, replacement)
  }

  // 5. Clean extra spaces
  s = s.replace(/[ \t\f\v]+/g, ' ').trim()

  return s
}
