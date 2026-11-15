import { describe, it, expect, beforeEach } from 'bun:test'
import { ClientOCRService } from './clientOCR'

describe('CTC Greedy Decoder (Seam C)', () => {
  let service: ClientOCRService

  beforeEach(() => {
    service = new ClientOCRService()
    // Mock character vocabulary dictionary: [blank, A, B, C, space]
    ;(service as any).chars = ['', 'A', 'B', 'C', ' ']
  })

  it('should collapse adjacent duplicate character predictions', () => {
    // seqLen = 4, numClasses = 5
    // Timesteps predict: A, A, B, B -> Expected collapsed text: "AB"
    const probs = new Float32Array([
      0.0, 0.95, 0.05, 0.0, 0.0,  // t=0 -> A
      0.0, 0.98, 0.02, 0.0, 0.0,  // t=1 -> A (duplicate, should collapse)
      0.0, 0.01, 0.90, 0.0, 0.0,  // t=2 -> B
      0.0, 0.02, 0.96, 0.0, 0.0,  // t=3 -> B (duplicate, should collapse)
    ])
    const dims = [1, 4, 5]

    const result = service.ctcDecode(probs, dims)
    expect(result.text).toBe('AB')
    expect(result.confidence).toBeGreaterThan(0.9)
  })

  it('should eliminate blank index (0) and preserve non-adjacent characters separated by blank', () => {
    // Timesteps predict: A, blank, A -> Expected: "AA" (not collapsed because separated by blank)
    const probs = new Float32Array([
      0.0, 0.95, 0.0, 0.0, 0.0,   // t=0 -> A
      0.99, 0.0, 0.0, 0.0, 0.0,   // t=1 -> Blank (index 0)
      0.0, 0.92, 0.0, 0.0, 0.0,   // t=2 -> A
    ])
    const dims = [1, 3, 5]

    const result = service.ctcDecode(probs, dims)
    expect(result.text).toBe('AA')
  })

  it('should return empty string when all predictions are blank tokens', () => {
    const probs = new Float32Array([
      1.0, 0.0, 0.0, 0.0, 0.0,
      1.0, 0.0, 0.0, 0.0, 0.0,
    ])
    const dims = [1, 2, 5]

    const result = service.ctcDecode(probs, dims)
    expect(result.text).toBe('')
    expect(result.confidence).toBe(0.0)
  })
})
