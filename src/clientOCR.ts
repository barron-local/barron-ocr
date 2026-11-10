import * as ort from 'onnxruntime-web'
import { canonicalThai } from './thaiNorm'

const ORT_VERSION = '1.31.1'
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
ort.env.wasm.numThreads = 1

export interface OCRLineResult {
  text: string
  confidence: number
  box: number[][] // 4 points [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
  row: number
}

export interface ClientOCRResult {
  text: string
  lines: OCRLineResult[]
  processingTimeMs: number
  imageWidth: number
  imageHeight: number
}

export class ClientOCRService {
  private detSession: ort.InferenceSession | null = null
  private recSession: ort.InferenceSession | null = null
  private chars: string[] = []
  private isLoading = false

  async init(onProgress?: (msg: string) => void) {
    if (this.detSession && this.recSession) return

    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise((r) => setTimeout(r, 100))
      }
      return
    }

    this.isLoading = true
    try {
      onProgress?.('กำลังโหลดพจนานุกรมอักขระ...')
      const dictRes = await fetch('/rec_dict.txt')
      const dictText = await dictRes.text()
      const rawLines = dictText.split(/\r?\n/).filter((c) => c !== '')

      this.chars = ['', ...rawLines, ' ']

      onProgress?.('กำลังโหลดโมเดลตรวจจับข้อความ...')
      this.detSession = await ort.InferenceSession.create('/det.onnx', {
        executionProviders: ['wasm'],
      })

      onProgress?.('กำลังโหลดโมเดลอ่านอักขระภาษาไทย...')
      this.recSession = await ort.InferenceSession.create('/rec.onnx', {
        executionProviders: ['wasm'],
      })

      onProgress?.('พร้อมประมวลผล')
    } finally {
      this.isLoading = false
    }
  }

  async run(imageElement: HTMLImageElement): Promise<ClientOCRResult> {
    const startTime = performance.now()
    if (!this.detSession || !this.recSession) {
      await this.init()
    }

    const origW = imageElement.naturalWidth || imageElement.width
    const origH = imageElement.naturalHeight || imageElement.height

    // 1. Detection preprocessing
    const { tensor: detTensor, targetW, targetH } = this.preprocessDet(imageElement)

    // 2. Run Detector
    const detOutputs = await this.detSession!.run({ [this.detSession!.inputNames[0]]: detTensor })
    const detMap = detOutputs[this.detSession!.outputNames[0]].data as Float32Array

    // 3. Find accurate bounding boxes
    let boxes = this.postprocessDet(detMap, targetW, targetH, origW, origH)

    if (boxes.length === 0 && origH <= 200 && origW >= 1.5 * origH) {
      boxes = [
        [
          [0, 0],
          [origW - 1, 0],
          [origW - 1, origH - 1],
          [0, origH - 1],
        ],
      ]
    }

    // 4. Sort boxes top-to-bottom
    boxes.sort((a, b) => {
      const topA = (a[0][1] + a[1][1] + a[2][1] + a[3][1]) / 4
      const topB = (b[0][1] + b[1][1] + b[2][1] + b[3][1]) / 4
      if (Math.abs(topA - topB) > 16) {
        return topA - topB
      }
      return a[0][0] - b[0][0]
    })

    // 5. Recognize each line crop
    // Pre-create full image canvas once so we can sample warped perspective boxes efficiently
    const fullImgCanvas = document.createElement('canvas')
    fullImgCanvas.width = origW
    fullImgCanvas.height = origH
    const fullImgCtx = fullImgCanvas.getContext('2d', { willReadFrequently: true })!
    fullImgCtx.drawImage(imageElement, 0, 0, origW, origH)
    const fullImgData = fullImgCtx.getImageData(0, 0, origW, origH).data

    const lines: OCRLineResult[] = []

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      const cropData = this.cropAndPreprocessRecWarp(fullImgData, origW, origH, box)
      if (!cropData) continue

      const recOutputs = await this.recSession!.run({ [this.recSession!.inputNames[0]]: cropData.tensor })
      const recProbs = recOutputs[this.recSession!.outputNames[0]]

      const decoded = this.ctcDecode(recProbs.data as Float32Array, recProbs.dims)
      if (decoded.text.trim()) {
        lines.push({
          text: canonicalThai(decoded.text),
          confidence: decoded.confidence,
          box,
          row: i,
        })
      }
    }

    const fullText = lines.map((l) => l.text).join('\n')
    const processingTimeMs = Math.round(performance.now() - startTime)

    return {
      text: fullText,
      lines,
      processingTimeMs,
      imageWidth: origW,
      imageHeight: origH,
    }
  }

  private preprocessDet(img: HTMLImageElement) {
    const limit = 1280
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height

    const scale = Math.min(limit / Math.max(h, w), 1.0)
    let rw = Math.round(w * scale)
    let rh = Math.round(h * scale)

    rw = Math.max(32, Math.round(rw / 32) * 32)
    rh = Math.max(32, Math.round(rh / 32) * 32)

    const canvas = document.createElement('canvas')
    canvas.width = rw
    canvas.height = rh
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, rw, rh)
    const imgData = ctx.getImageData(0, 0, rw, rh).data

    const mean = [0.485, 0.456, 0.406]
    const std = [0.229, 0.224, 0.225]
    const floatArr = new Float32Array(3 * rw * rh)

    const planeSize = rw * rh
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const srcIdx = (y * rw + x) * 4
        const dstIdx = y * rw + x

        floatArr[dstIdx] = (imgData[srcIdx] / 255.0 - mean[0]) / std[0]
        floatArr[planeSize + dstIdx] = (imgData[srcIdx + 1] / 255.0 - mean[1]) / std[1]
        floatArr[2 * planeSize + dstIdx] = (imgData[srcIdx + 2] / 255.0 - mean[2]) / std[2]
      }
    }

    const tensor = new ort.Tensor('float32', floatArr, [1, 3, rh, rw])
    return { tensor, targetW: rw, targetH: rh }
  }

  private postprocessDet(
    pred: Float32Array,
    mapW: number,
    mapH: number,
    origW: number,
    origH: number
  ): number[][][] {
    const thresh = 0.3
    const visited = new Uint8Array(mapW * mapH)
    const boxes: number[][][] = []

    const scaleX = origW / mapW
    const scaleY = origH / mapH

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const idx = y * mapW + x
        if (visited[idx] || pred[idx] < thresh) continue

        let scoreSum = 0
        let count = 0
        const compPts: [number, number][] = []

        const queue: [number, number][] = [[x, y]]
        visited[idx] = 1

        while (queue.length > 0) {
          const [cx, cy] = queue.pop()!
          const cidx = cy * mapW + cx
          scoreSum += pred[cidx]
          count++
          compPts.push([cx, cy])

          const neighbors: [number, number][] = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ]
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < mapW && ny >= 0 && ny < mapH) {
              const nidx = ny * mapW + nx
              if (!visited[nidx] && pred[nidx] >= thresh) {
                visited[nidx] = 1
                queue.push([nx, ny])
              }
            }
          }
        }

        const avgScore = scoreSum / count

        if (avgScore >= 0.55 && count >= 16) {
          // Compute minimum-area oriented bounding box with DBNet unclip
          const box = this.getOrientedUnclippedBox(compPts, 1.5)
          if (box) {
            // Scale box points back to original image dimensions
            const scaledBox = box.map(([bx, by]) => [
              Math.max(0, Math.min(origW, bx * scaleX)),
              Math.max(0, Math.min(origH, by * scaleY)),
            ])
            boxes.push(scaledBox)
          }
        }
      }
    }

    return boxes
  }

  // Pure mathematical minimum-area bounding box & unclip expansion
  private getOrientedUnclippedBox(pts: [number, number][], unclipRatio = 1.5): number[][] | null {
    // 1. Compute 2D convex hull using Andrew's monotone chain algorithm
    if (pts.length < 3) return null

    // Sort points by x, then y
    pts.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))

    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    const lower: [number, number][] = []
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop()
      }
      lower.push(p)
    }

    const upper: [number, number][] = []
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop()
      }
      upper.push(p)
    }

    lower.pop()
    upper.pop()
    const hull = lower.concat(upper)
    if (hull.length < 3) return null

    // 2. Rotating calipers: check each edge of convex hull to find minimum bounding box
    let minArea = Infinity
    let bestCorners: number[][] | null = null
    const n = hull.length

    for (let i = 0; i < n; i++) {
      const p1 = hull[i]
      const p2 = hull[(i + 1) % n]
      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) continue

      const ux = dx / len
      const uy = dy / len
      const vx = -uy
      const vy = ux

      let minU = Infinity,
        maxU = -Infinity
      let minV = Infinity,
        maxV = -Infinity

      for (let j = 0; j < n; j++) {
        const hp = hull[j]
        const pu = hp[0] * ux + hp[1] * uy
        const pv = hp[0] * vx + hp[1] * vy
        if (pu < minU) minU = pu
        if (pu > maxU) maxU = pu
        if (pv < minV) minV = pv
        if (pv > maxV) maxV = pv
      }

      const bw = maxU - minU
      const bh = maxV - minV
      const area = bw * bh

      if (area < minArea && bw >= 4 && bh >= 3) {
        minArea = area
        // DBNet unclip distance = area * unclipRatio / perimeter
        const perimeter = 2 * (bw + bh)
        const dist = (area * unclipRatio) / Math.max(perimeter, 1.0)

        const u0 = minU - dist
        const u1 = maxU + dist
        const v0 = minV - dist
        const v1 = maxV + dist

        bestCorners = [
          [u0 * ux + v0 * vx, u0 * uy + v0 * vy],
          [u1 * ux + v0 * vx, u1 * uy + v0 * vy],
          [u1 * ux + v1 * vx, u1 * uy + v1 * vy],
          [u0 * ux + v1 * vx, u0 * uy + v1 * vy],
        ]
      }
    }

    return bestCorners
  }

  // Order 4 quad points clockwise: Top-Left, Top-Right, Bottom-Right, Bottom-Left
  private orderPointsClockwise(pts: number[][]): number[][] {
    const sorted = [...pts].sort((a, b) => a[0] - b[0])
    const leftMost = [sorted[0], sorted[1]].sort((a, b) => a[1] - b[1])
    const rightMost = [sorted[2], sorted[3]].sort((a, b) => a[1] - b[1])
    return [leftMost[0], rightMost[0], rightMost[1], leftMost[1]]
  }

  // Warps oriented bounding box using bilinear pixel sampling directly into recognizer tensor
  private cropAndPreprocessRecWarp(
    srcPixels: Uint8ClampedArray,
    srcW: number,
    srcH: number,
    box: number[][]
  ) {
    const ordered = this.orderPointsClockwise(box)
    const [p0, p1, p2, p3] = ordered

    const widthA = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    const widthB = Math.hypot(p2[0] - p3[0], p2[1] - p3[1])
    const maxWidth = Math.max(widthA, widthB)

    const heightA = Math.hypot(p3[0] - p0[0], p3[1] - p0[1])
    const heightB = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const maxHeight = Math.max(heightA, heightB)

    if (maxWidth < 4 || maxHeight < 3) return null

    const H = 48
    const targetW = Math.max(16, Math.min(3200, Math.ceil((H * maxWidth) / maxHeight)))

    const floatArr = new Float32Array(3 * H * targetW)
    const planeSize = H * targetW

    for (let y = 0; y < H; y++) {
      const v = H > 1 ? y / (H - 1) : 0
      for (let x = 0; x < targetW; x++) {
        const u = targetW > 1 ? x / (targetW - 1) : 0

        // Bilinear interpolation on quad corners
        const topX = (1 - u) * p0[0] + u * p1[0]
        const topY = (1 - u) * p0[1] + u * p1[1]
        const botX = (1 - u) * p3[0] + u * p2[0]
        const botY = (1 - u) * p3[1] + u * p2[1]

        const sampleX = (1 - v) * topX + v * botX
        const sampleY = (1 - v) * topY + v * botY

        // Bilinear sample from source image
        const x0 = Math.floor(sampleX)
        const y0 = Math.floor(sampleY)
        const x1 = Math.min(srcW - 1, x0 + 1)
        const y1 = Math.min(srcH - 1, y0 + 1)

        const wx = Math.max(0, Math.min(1, sampleX - x0))
        const wy = Math.max(0, Math.min(1, sampleY - y0))

        const clampX0 = Math.max(0, Math.min(srcW - 1, x0))
        const clampY0 = Math.max(0, Math.min(srcH - 1, y0))

        const idx00 = (clampY0 * srcW + clampX0) * 4
        const idx10 = (clampY0 * srcW + x1) * 4
        const idx01 = (y1 * srcW + clampX0) * 4
        const idx11 = (y1 * srcW + x1) * 4

        const w00 = (1 - wx) * (1 - wy)
        const w10 = wx * (1 - wy)
        const w01 = (1 - wx) * wy
        const w11 = wx * wy

        const r =
          (srcPixels[idx00] * w00 +
            srcPixels[idx10] * w10 +
            srcPixels[idx01] * w01 +
            srcPixels[idx11] * w11) /
          255.0
        const g =
          (srcPixels[idx00 + 1] * w00 +
            srcPixels[idx10 + 1] * w10 +
            srcPixels[idx01 + 1] * w01 +
            srcPixels[idx11 + 1] * w11) /
          255.0
        const b =
          (srcPixels[idx00 + 2] * w00 +
            srcPixels[idx10 + 2] * w10 +
            srcPixels[idx01 + 2] * w01 +
            srcPixels[idx11 + 2] * w11) /
          255.0

        const dstIdx = y * targetW + x
        // Recognizer expects BGR channel order normalized as (pixel - 0.5) / 0.5
        floatArr[dstIdx] = (b - 0.5) / 0.5
        floatArr[planeSize + dstIdx] = (g - 0.5) / 0.5
        floatArr[2 * planeSize + dstIdx] = (r - 0.5) / 0.5
      }
    }

    const tensor = new ort.Tensor('float32', floatArr, [1, 3, H, targetW])
    return { tensor, width: targetW }
  }

  private ctcDecode(probs: Float32Array, dims: readonly number[]) {
    const seqLen = dims[1]
    const numClasses = dims[2]

    const ids: number[] = []
    const confs: number[] = []

    for (let t = 0; t < seqLen; t++) {
      let maxVal = -Infinity
      let maxIdx = 0
      const offset = t * numClasses

      for (let c = 0; c < numClasses; c++) {
        const v = probs[offset + c]
        if (v > maxVal) {
          maxVal = v
          maxIdx = c
        }
      }
      ids.push(maxIdx)
      confs.push(maxVal)
    }

    const chars: string[] = []
    const keptConfs: number[] = []

    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== 0 && (i === 0 || ids[i] !== ids[i - 1])) {
        const ch = this.chars[ids[i]] || ''
        chars.push(ch)
        keptConfs.push(confs[i])
      }
    }

    const avgConf =
      keptConfs.length > 0
        ? keptConfs.reduce((a, b) => a + b, 0) / keptConfs.length
        : 0.0

    const normalizedConf = Math.min(1.0, Math.max(0.6, (avgConf + 15) / 20))

    return {
      text: chars.join(''),
      confidence: normalizedConf,
    }
  }
}

export const clientOCR = new ClientOCRService()
