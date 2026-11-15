// Barron Thai Orthography & Lexical Correction Engine
// Optical Character Confusion Matrix & Weighted Damerau-Levenshtein Engine

/**
 * Visual OCR Confusion Map: Pairs of Thai characters that frequently get misread
 * due to stroke similarity, loop confusion, or CTC boundary leaks.
 */
export const OPTICAL_CONFUSION_PAIRS: [string, string][] = [
  // Loop / Curve confusions
  ['ด', 'ค'],
  ['ด', 'ต'],
  ['ค', 'ศ'],
  ['บ', 'ม'],
  ['บ', 'ป'],
  ['บ', 'ข'],
  ['ข', 'ช'],
  ['ข', 'ซ'],
  ['ช', 'ซ'],
  ['ก', 'ถ'],
  ['ก', 'ภ'],
  ['ถ', 'ภ'],
  ['ถ', 'ฤ'],
  ['ว', 'อ'],
  ['ว', 'ร'],
  ['ร', 'ว'],
  ['น', 'ม'],
  ['ผ', 'ฝ'],
  ['ผ', 'พ'],
  ['พ', 'ฟ'],
  ['ฟ', 'ฬ'],
  ['ย', 'บ'],
  ['ร', 'า'],
  ['ร', 'ธ'],
  ['ล', 'ส'],

  // Upper/Lower vowels & tone marks
  ['ิ', 'ี'],
  ['ึ', 'ื'],
  ['ุ', 'ู'],
  ['่', '้'],
  ['๊', '๋'],
  ['ั', '็'],
  ['ั', 'ิ'],

  // Leading vowels
  ['เ', 'แ'],
  ['โ', 'ใ'],
  ['ใ', 'ไ'],
]

// Fast lookup set for bidirectional optical confusion
const confusionMap = new Map<string, string[]>()
for (const [a, b] of OPTICAL_CONFUSION_PAIRS) {
  if (!confusionMap.has(a)) confusionMap.set(a, [])
  if (!confusionMap.has(b)) confusionMap.set(b, [])
  confusionMap.get(a)!.push(b)
  confusionMap.get(b)!.push(a)
}

export function areVisuallyConfused(charA: string, charB: string): boolean {
  if (charA === charB) return true
  const list = confusionMap.get(charA)
  return list ? list.includes(charB) : false
}

export function getVisualTwins(char: string): string[] {
  return confusionMap.get(char) || []
}

/**
 * Weighted Edit Distance specifically designed for Thai OCR:
 * - Substitution between visually confusing glyphs costs 0.4
 * - Ordinary substitution costs 1.0
 * - Insertion / Deletion of floating vowels/tone marks costs 0.5
 * - Ordinary insertion / deletion costs 1.0
 * - Transposition (Damerau) costs 0.8
 */
const TONE_AND_VOWEL_CHARS = new Set([
  '่', '้', '๊', '๋', '์', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', 'ั', '็', 'ํ'
])

export function thaiOpticalDistance(s1: string, s2: string): number {
  const len1 = s1.length
  const len2 = s2.length

  if (s1 === s2) return 0
  if (Math.abs(len1 - len2) > 3) return 99

  const dp: number[][] = Array.from({ length: len1 + 1 }, () =>
    new Array(len2 + 1).fill(0)
  )

  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    const c1 = s1[i - 1]
    for (let j = 1; j <= len2; j++) {
      const c2 = s2[j - 1]

      let subCost = 0
      if (c1 === c2) {
        subCost = 0
      } else if (areVisuallyConfused(c1, c2)) {
        subCost = 0.4
      } else {
        subCost = 1.0
      }

      const delCost = TONE_AND_VOWEL_CHARS.has(c1) ? 0.5 : 1.0
      const insCost = TONE_AND_VOWEL_CHARS.has(c2) ? 0.5 : 1.0

      dp[i][j] = Math.min(
        dp[i - 1][j] + delCost,
        dp[i][j - 1] + insCost,
        dp[i - 1][j - 1] + subCost
      )

      if (
        i > 1 &&
        j > 1 &&
        s1[i - 1] === s2[j - 2] &&
        s1[i - 2] === s2[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 0.8)
      }
    }
  }

  return dp[len1][len2]
}

/**
 * High-Speed SymSpell-style Index with Optical Neighborhood Generation
 */
export class ThaiLexiconIndex {
  private words: string[] = []
  private wordSet: Set<string> = new Set()
  private deletionIndex: Map<string, string[]> = new Map()
  private isLoaded = false

  public loadWords(wordList: string[]): void {
    this.words = wordList
    this.wordSet = new Set(wordList)
    this.deletionIndex.clear()

    for (const w of wordList) {
      // Index 1-deletion variants for O(1) SymSpell candidate discovery
      for (let i = 0; i < w.length; i++) {
        const sub = w.slice(0, i) + w.slice(i + 1)
        let bucket = this.deletionIndex.get(sub)
        if (!bucket) {
          bucket = []
          this.deletionIndex.set(sub, bucket)
        }
        bucket.push(w)
      }
    }
    this.isLoaded = true
  }

  public hasWord(word: string): boolean {
    return this.wordSet.has(word)
  }

  public get count(): number {
    return this.words.length
  }

  public get loaded(): boolean {
    return this.isLoaded
  }

  /**
   * Find closest dictionary match in <2ms using SymSpell + Optical Confusion matrix.
   */
  public findBestMatch(token: string, maxDistance = 1.6): { match: string; distance: number } | null {
    if (!token || token.length < 2) return null
    if (this.wordSet.has(token)) {
      return { match: token, distance: 0 }
    }

    const candidates = new Set<string>()

    // 1. Check deletion index hits (Token is a 1-delete of a valid dictionary word)
    const delHits = this.deletionIndex.get(token)
    if (delHits) {
      for (const h of delHits) candidates.add(h)
    }

    // 2. Token deletion matches (Token has an extra ghost character/vowel)
    for (let i = 0; i < token.length; i++) {
      const sub = token.slice(0, i) + token.slice(i + 1)
      if (this.wordSet.has(sub)) candidates.add(sub)
      const subHits = this.deletionIndex.get(sub)
      if (subHits) {
        for (const h of subHits) candidates.add(h)
      }
    }

    // 3. Optical character twin substitutions
    for (let i = 0; i < token.length; i++) {
      const c = token[i]
      const twins = getVisualTwins(c)
      for (const twin of twins) {
        const alt = token.slice(0, i) + twin + token.slice(i + 1)
        if (this.wordSet.has(alt)) candidates.add(alt)
        const altHits = this.deletionIndex.get(alt)
        if (altHits) {
          for (const h of altHits) candidates.add(h)
        }
      }
    }

    if (candidates.size === 0) return null

    let bestWord: string | null = null
    let minDistance = maxDistance

    for (const cand of candidates) {
      const dist = thaiOpticalDistance(token, cand)
      if (dist < minDistance) {
        minDistance = dist
        bestWord = cand
        if (dist <= 0.4) {
          // Exact single-optical-twin match found, return immediately
          return { match: bestWord, distance: minDistance }
        }
      }
    }

    if (bestWord) {
      return { match: bestWord, distance: minDistance }
    }
    return null
  }
}

// Global Singleton Lexicon Instance
export const globalLexicon = new ThaiLexiconIndex()
