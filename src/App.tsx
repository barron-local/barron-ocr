import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import { clientOCR } from './clientOCR'

interface OCRLine {
  text: string
  confidence: number
  box: number[][]
  row: number
}

interface OCRResultState {
  text: string
  lines: OCRLine[]
  processingTimeMs: number
  imageWidth: number
  imageHeight: number
}

interface ImageItem {
  id: string
  file: File
  url: string
  name: string
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: OCRResultState
  error?: string
}

type ViewMode = 'text' | 'inspection'
type TextMergeMode = 'single' | 'combined'
type EngineMode = 'wasm' | 'bridge'

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null)
  const [showBoxes, setShowBoxes] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [textMergeMode, setTextMergeMode] = useState<TextMergeMode>('single')
  const [engineMode, setEngineMode] = useState<EngineMode>('wasm')
  const [bridgeStatus, setBridgeStatus] = useState<'checking' | 'online' | 'offline'>('offline')
  const [bridgeProvider, setBridgeProvider] = useState<string>('')
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showArchModal, setShowArchModal] = useState(false)
  const [bridgeErrorMsg, setBridgeErrorMsg] = useState<string | null>(null)
  const [bridgeSuccessMsg, setBridgeSuccessMsg] = useState<string | null>(null)
  const [checkingBridge, setCheckingBridge] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const processingQueueRef = useRef(false)

  // Check bridge server health periodically
  const checkBridgeHealth = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:6767/health', { method: 'GET' })
      if (res.ok) {
        const data = await res.json()
        setBridgeStatus('online')
        setBridgeProvider(data.provider || 'Hardware Accelerated')
        return true
      }
    } catch {
      // Bridge server is not running
    }
    setBridgeStatus('offline')
    return false
  }, [])

  useEffect(() => {
    checkBridgeHealth()
    const timer = setInterval(checkBridgeHealth, 5000)
    return () => clearInterval(timer)
  }, [checkBridgeHealth])

  // Current selected image item
  const currentItem = images.find((item) => item.id === selectedId) || images[0] || null

  const handleFiles = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (validFiles.length === 0) {
      return
    }

    const newItems: ImageItem[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      status: 'pending',
    }))

    setImages((prev) => {
      const updated = [...prev, ...newItems]
      if (!selectedId && newItems.length > 0) {
        setSelectedId(newItems[0].id)
      }
      return updated
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // Queue runner: auto-processes pending images
  useEffect(() => {
    const processNext = async () => {
      if (processingQueueRef.current) return
      const nextItem = images.find((item) => item.status === 'pending')
      if (!nextItem) return

      processingQueueRef.current = true
      setImages((prev) =>
        prev.map((it) => (it.id === nextItem.id ? { ...it, status: 'processing' } : it))
      )
      setStatusMsg(`กำลังประมวลผล ${nextItem.name}...`)

      try {
        let result: OCRResultState

        if (engineMode === 'bridge') {
          setStatusMsg(`กำลังส่งภาพไปประมวลผลผ่าน Native Bridge...`)
          const res = await fetch('http://127.0.0.1:6767/ocr', {
            method: 'POST',
            headers: { 'Content-Type': nextItem.file.type || 'image/png' },
            body: nextItem.file,
          })

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error(errData.error || `Bridge server error (${res.status})`)
          }

          result = await res.json()
        } else {
          // Standard in-browser WebAssembly mode
          await clientOCR.init((msg) => setStatusMsg(msg))

          const img = new Image()
          img.src = nextItem.url
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
          })

          result = await clientOCR.run(img)
        }

        setImages((prev) =>
          prev.map((it) =>
            it.id === nextItem.id ? { ...it, status: 'done', result } : it
          )
        )
      } catch (err: unknown) {
        console.error(err)
        // If bridge failed, provide friendly hint
        const errMsg = err instanceof Error ? err.message : String(err)
        setImages((prev) =>
          prev.map((it) =>
            it.id === nextItem.id
              ? {
                  ...it,
                  status: 'error',
                  error:
                    engineMode === 'bridge' && errMsg.includes('Failed to fetch')
                      ? 'Bridge Server ออฟไลน์ (ยังไม่ได้รัน python bridge_server.py หรือเซิร์ฟเวอร์ยังไม่เปิด)'
                      : errMsg,
                }
              : it
          )
        )
      } finally {
        processingQueueRef.current = false
        setStatusMsg('')
      }
    }

    processNext()
  }, [images, engineMode])

  // Get displayed text depending on single vs combined mode
  const getDisplayedText = () => {
    if (textMergeMode === 'combined') {
      const doneItems = images.filter((it) => it.status === 'done' && it.result)
      if (doneItems.length === 0) return ''
      return doneItems
        .map((it, idx) => `--- [Page ${idx + 1}: ${it.name}] ---\n${it.result?.text || ''}`)
        .join('\n\n')
    }
    return currentItem?.result?.text || ''
  }

  const copyToClipboard = () => {
    const textToCopy = getDisplayedText()
    if (!textToCopy) return
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const clearAll = () => {
    images.forEach((it) => URL.revokeObjectURL(it.url))
    setImages([])
    setSelectedId(null)
  }

  const removeImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const item = images.find((it) => it.id === id)
    if (item) URL.revokeObjectURL(item.url)

    setImages((prev) => {
      const filtered = prev.filter((it) => it.id !== id)
      if (selectedId === id) {
        setSelectedId(filtered[0]?.id || null)
      }
      return filtered
    })
  }

  // Draw bounding boxes on canvas over the selected image
  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    const ocrData = currentItem?.result

    if (!canvas) return

    if (!img || !ocrData || !showBoxes) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const renderedW = img.offsetWidth
    const renderedH = img.offsetHeight

    // If image hasn't finished layout/rendering yet, re-check next frame
    if (renderedW === 0 || renderedH === 0) {
      requestAnimationFrame(drawBoundingBoxes)
      return
    }

    canvas.width = renderedW
    canvas.height = renderedH
    canvas.style.width = `${renderedW}px`
    canvas.style.height = `${renderedH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaleX = renderedW / ocrData.imageWidth
    const scaleY = renderedH / ocrData.imageHeight

    ctx.clearRect(0, 0, renderedW, renderedH)

    ocrData.lines.forEach((line, idx) => {
      if (!line.box || line.box.length === 0) return

      const isHovered = hoveredLineIndex === idx

      ctx.beginPath()
      if (isHovered) {
        ctx.lineWidth = 2
        ctx.strokeStyle = '#2383e2'
        ctx.fillStyle = 'rgba(35, 131, 226, 0.28)'
      } else {
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(35, 131, 226, 0.65)'
        ctx.fillStyle = 'rgba(35, 131, 226, 0.08)'
      }

      const firstPt = line.box[0]
      ctx.moveTo(firstPt[0] * scaleX, firstPt[1] * scaleY)
      for (let i = 1; i < line.box.length; i++) {
        ctx.lineTo(line.box[i][0] * scaleX, line.box[i][1] * scaleY)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  }, [currentItem, hoveredLineIndex, showBoxes])

  useEffect(() => {
    drawBoundingBoxes()
  }, [drawBoundingBoxes])

  const totalLines = images.reduce((acc, it) => acc + (it.result?.lines.length || 0), 0)
  const totalDuration = images.reduce((acc, it) => acc + (it.result?.processingTimeMs || 0), 0)

  return (
    <div className="ocr-container">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <h1>Barron OCR</h1>
        </div>

        {/* Header Engine Configuration Toolbar */}
        <div className="engine-toolbar">
          <div className="engine-segmented-card">
            <button
              className={`mode-card-btn ${engineMode === 'wasm' ? 'active' : ''}`}
              onClick={() => setEngineMode('wasm')}
              title="รันผ่านเบราว์เซอร์ทันที ไม่ต้องติดตั้งโปรแกรมหรือเปิดสคริปต์ใดๆ"
            >
              <span className="mode-name">In-Browser (WASM)</span>
            </button>

            <button
              className={`mode-card-btn ${engineMode === 'bridge' ? 'active' : ''}`}
              onClick={() => setEngineMode('bridge')}
              title="รันโมเดลด้วยฮาร์ดแวร์จริงของเครื่อง (ความเร็วสูงสุด)"
            >
              <span
                className={`engine-dot ${bridgeStatus === 'online' ? 'online' : 'offline'}`}
                title={`Native Bridge: ${bridgeStatus}`}
              />
              <span className="mode-name">
                Native Bridge {bridgeStatus === 'online' ? `(${bridgeProvider})` : ''}
              </span>
            </button>
          </div>

          <button
            className="bridge-settings-trigger"
            onClick={() => setShowBridgeModal(true)}
            title="คู่มือและวิธีรัน bridge_server.py"
          >
            Setup Guide ⚙
          </button>

          <button
            className="bridge-settings-trigger"
            onClick={() => setShowArchModal(true)}
            title="System Architecture & Technical Specifications"
          >
            Architecture & Specs ⓘ
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-content">
        {/* Source Image Panel */}
        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">
              Source Document {images.length > 1 && `(${images.length} files)`}
            </span>
            {images.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-action"
                  onClick={() => document.getElementById('addMoreInput')?.click()}
                >
                  Add More
                </button>
                <input
                  id="addMoreInput"
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files)
                    }
                    e.target.value = ''
                  }}
                />
                <button className="btn btn-action" onClick={clearAll}>
                  Clear All
                </button>
              </div>
            )}
          </div>

          {images.length === 0 ? (
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <div className="dropzone-icon-box">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="dropzone-label">Click or drag multiple images here</p>
              <p className="dropzone-hint">Supports selecting multiple PNG, JPG, WebP at once</p>
              <span className="dropzone-browse-badge">Browse Files</span>
              <input
                id="fileInput"
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFiles(e.target.files)
                  }
                  e.target.value = ''
                }}
              />
            </div>
          ) : (
            <div className="preview-container">
              {/* Multi-image Filmstrip Thumbnail Bar */}
              {images.length > 1 && (
                <div className="thumbnails-bar">
                  {images.map((it, idx) => (
                    <div
                      key={it.id}
                      className={`thumb-card ${currentItem?.id === it.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(it.id)}
                    >
                      <img src={it.url} alt={it.name} className="thumb-img" />
                      <div className="thumb-info">
                        <span className="thumb-name" title={it.name}>
                          #{idx + 1} {it.name}
                        </span>
                        <span className={`thumb-status ${it.status}`}>
                          {it.status === 'done'
                            ? 'Ready'
                            : it.status === 'processing'
                            ? 'Running...'
                            : it.status === 'pending'
                            ? 'Queued'
                            : 'Error'}
                        </span>
                      </div>
                      <button
                        className="thumb-close"
                        title="Remove"
                        onClick={(e) => removeImage(it.id, e)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Main Image Stage */}
              <div className="stage">
                <div className="image-wrapper">
                  <img
                    ref={imgRef}
                    src={currentItem?.url}
                    alt="Source"
                    className="preview-image"
                    crossOrigin="anonymous"
                    onLoad={() => {
                      drawBoundingBoxes()
                    }}
                  />
                  <canvas ref={canvasRef} className="overlay-canvas" />
                </div>
              </div>

              <div className="stage-controls">
                <label className="toggle-switch-label">
                  <span className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={showBoxes}
                      onChange={(e) => setShowBoxes(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </span>
                  <span className="toggle-text">Show bounding boxes</span>
                </label>

                {currentItem?.status === 'processing' && (
                  <span className="status-badge running">
                    Processing {currentItem.name}...
                  </span>
                )}
                {currentItem?.status === 'done' && (
                  <span className="status-badge success">Ready</span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* OCR Result Panel with Tabs & Merge Selector */}
        <section className="panel">
          <div className="panel-header panel-header-tabs">
            {/* Notion-style View Tabs */}
            <div className="notion-tabs">
              <button
                className={`tab-btn ${viewMode === 'text' ? 'active' : ''}`}
                onClick={() => setViewMode('text')}
              >
                Full Text
              </button>
              <button
                className={`tab-btn ${viewMode === 'inspection' ? 'active' : ''}`}
                onClick={() => setViewMode('inspection')}
              >
                Line Inspection
              </button>
            </div>

            <div className="panel-actions">
              {/* Output Mode Selector: Single Page vs All Combined */}
              {images.length > 1 && viewMode === 'text' && (
                <div className="mode-toggle">
                  <button
                    className={`toggle-option ${textMergeMode === 'single' ? 'active' : ''}`}
                    onClick={() => setTextMergeMode('single')}
                  >
                    Current Page
                  </button>
                  <button
                    className={`toggle-option ${textMergeMode === 'combined' ? 'active' : ''}`}
                    onClick={() => setTextMergeMode('combined')}
                  >
                    All Combined
                  </button>
                </div>
              )}

              {(currentItem?.result || (textMergeMode === 'combined' && images.some((i) => i.status === 'done'))) && (
                <button
                  className={`btn btn-action copy-action-btn ${copied ? 'copied' : ''}`}
                  onClick={copyToClipboard}
                >
                  {copied ? 'Copied' : textMergeMode === 'combined' ? 'Copy All' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          {/* Current item state */}
          {currentItem?.status === 'processing' && (
            <div className="state-box">
              <div className="spinner"></div>
              <p style={{ margin: 0 }}>{statusMsg || 'กำลังประมวลผลข้อความ...'}</p>
            </div>
          )}

          {currentItem?.status === 'pending' && (
            <div className="state-box">
              <div className="spinner"></div>
              <p style={{ margin: 0 }}>อยู่ในคิว รอการประมวลผลอัตโนมัติ...</p>
            </div>
          )}

          {currentItem?.status === 'error' && (
            <div className="state-box">
              <div className="state-error-card">
                <div className="error-badge-icon">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4zm1 7.2H7V7h2v4.2z" />
                  </svg>
                </div>
                <h4 className="error-card-title">
                  {engineMode === 'bridge' && currentItem.error?.includes('Bridge Server')
                    ? 'Native Bridge Disconnected'
                    : 'Processing Failed'}
                </h4>
                <p className="error-card-desc">
                  {engineMode === 'bridge' && currentItem.error?.includes('Bridge Server') ? (
                    <>
                      ไม่สามารถเชื่อมต่อไปยัง Bridge Server ได้ กรุณาเริ่มการทำงานของเซิร์ฟเวอร์เร่งความเร็วฮาร์ดแวร์
                      <div className="error-code-preview">python bridge_server.py</div>
                    </>
                  ) : (
                    currentItem.error || 'เกิดข้อผิดพลาดในการประมวลผลเอกสาร'
                  )}
                </p>
                <div className="error-card-actions">
                  {engineMode === 'bridge' && (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => setShowBridgeModal(true)}
                      >
                        Setup Guide ⚙
                      </button>
                      <button
                        className="btn btn-action"
                        onClick={() => {
                          setEngineMode('wasm')
                          setImages((prev) =>
                            prev.map((it) => (it.id === currentItem.id ? { ...it, status: 'pending', error: undefined } : it))
                          )
                        }}
                      >
                        Switch to WASM
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-action"
                    onClick={() => {
                      setImages((prev) =>
                        prev.map((it) => (it.id === currentItem.id ? { ...it, status: 'pending', error: undefined } : it))
                      )
                    }}
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {images.length === 0 && (
            <div className="state-box">
              <p>No document processed yet</p>
            </div>
          )}

          {currentItem?.status === 'done' && currentItem.result && (
            <div className="result-container">
              {/* Minimalist Clean Metrics Bar */}
              <div className="metrics-bar">
                <div className="metric-item">
                  <span className="metric-label">
                    {textMergeMode === 'combined' ? 'Total Time' : 'Duration'}
                  </span>
                  <span className="metric-value">
                    {textMergeMode === 'combined'
                      ? totalDuration >= 1000
                        ? `${(totalDuration / 1000).toFixed(2)}s`
                        : `${totalDuration}ms`
                      : currentItem.result.processingTimeMs >= 1000
                      ? `${(currentItem.result.processingTimeMs / 1000).toFixed(2)}s`
                      : `${currentItem.result.processingTimeMs}ms`}
                  </span>
                </div>
                <div className="metric-divider" />
                <div className="metric-item">
                  <span className="metric-label">
                    {textMergeMode === 'combined' ? 'Total Detected' : 'Detected'}
                  </span>
                  <span className="metric-value">
                    {textMergeMode === 'combined'
                      ? `${totalLines} lines (${images.length} pages)`
                      : `${currentItem.result.lines.length} lines`}
                  </span>
                </div>
                {textMergeMode === 'single' && (
                  <>
                    <div className="metric-divider" />
                    <div className="metric-item">
                      <span className="metric-label">Avg Speed</span>
                      <span className="metric-value">
                        {currentItem.result.lines.length > 0
                          ? `${Math.round(currentItem.result.processingTimeMs / currentItem.result.lines.length)}ms/line`
                          : '0ms'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* View 1: Full Text Area Tab */}
              {viewMode === 'text' && (
                <div className="tab-content">
                  <textarea
                    readOnly
                    value={getDisplayedText()}
                    className="text-output full-height"
                  />
                </div>
              )}

              {/* View 2: Line Inspection Tab */}
              {viewMode === 'inspection' && (
                <div className="tab-content">
                  <div className="inspection-list full-height">
                    {currentItem.result.lines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`inspection-row ${hoveredLineIndex === idx ? 'active' : ''}`}
                        onMouseEnter={() => setHoveredLineIndex(idx)}
                        onMouseLeave={() => setHoveredLineIndex(null)}
                      >
                        <div className="row-left">
                          <span className="row-index">#{idx + 1}</span>
                          <span className="row-text" title={line.text}>
                            {line.text}
                          </span>
                        </div>

                        <span
                          className={`confidence-badge ${
                            line.confidence >= 0.9
                              ? 'high'
                              : line.confidence >= 0.75
                              ? 'medium'
                              : 'low'
                          }`}
                        >
                          {(line.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Architecture & Specs Modal */}
      {showArchModal && (
        <div className="modal-backdrop" onClick={() => setShowArchModal(false)}>
          <div className="modal-dialog arch-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3 className="arch-header-title">System Architecture</h3>
                <span className="version-pill">Dual-Engine Specs</span>
              </div>
              <button className="modal-close" onClick={() => setShowArchModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="disclaimer-grid">
                <div className="disclaimer-card wasm-card">
                  <div className="disclaimer-card-header">
                    <span className="card-engine-title">In-Browser (WASM)</span>
                  </div>
                  <p className="disclaimer-card-body">
                    ประมวลผลบนเบราว์เซอร์ด้วย ONNX Runtime Web (WASM Single-Core) เสริม Pipeline สำหรับเอกสารจริง:
                  </p>
                  <ul className="disclaimer-bullets">
                    <li>
                      <strong>Oriented Calipers &amp; Bilinear Warp:</strong> ตัดภาพตามองศาหมุนจริง สุ่มตัวอย่างแบบ Bilinear ช่วยให้อ่านเอกสารเอียง (Tilted) และภาพเบลอได้แม่นยำกว่าการตัด Bounding Box ตรง
                    </li>
                    <li>
                      <strong>Thai Canonicalization &amp; PUA Remapping:</strong> แปลงรหัสอักขระ PUA (สระ-วรรณยุกต์ลอย/จม) รวมสระแอ (เเ &rarr; แ) และจัดลำดับวรรณยุกต์อัตโนมัติ
                    </li>
                    <li>
                      <strong>Trade-off ความเร็ว:</strong> ประมวลผลผ่าน JS/WASM บน CPU เครื่องลูกข่าย ใช้เวลาเฉลี่ย ~3&ndash;8 วินาทีต่อภาพ
                    </li>
                  </ul>
                </div>

                {/* Center VS Badge */}
                <div className="vs-badge-container">
                  <span className="vs-badge">VS</span>
                </div>

                <div className="disclaimer-card bridge-card">
                  <div className="disclaimer-card-header">
                    <span className="card-engine-title">Native Bridge</span>
                  </div>
                  <p className="disclaimer-card-body">
                    ประมวลผลผ่าน Python Native Service สื่อสารผ่าน Local Port 6767:
                  </p>
                  <ul className="disclaimer-bullets">
                    <li>
                      <strong>Hardware Execution:</strong> ดึงพลังจาก CPU Multi-core และ GPU (DirectML / CUDA / OpenVINO) โดยตรง ความเร็วเฉลี่ย 150&ndash;350ms ต่อภาพ (เร็วกว่า WASM ประมาณ 10&ndash;20 เท่า)
                    </li>
                    <li>
                      <strong>Standard DBNet + CTC Pipeline:</strong> ใช้ฟังก์ชัน OpenCV Perspective Transform และ CTC Greedy Decode ดั้งเดิมของโมเดล OpenThai 2.0
                    </li>
                    <li>
                      <strong>Trade-off การใช้งาน:</strong> ผู้ใช้ต้องเปิดรัน <code>python bridge_server.py</code> ในเครื่องก่อนใช้งาน
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <div className="modal-footer-btns">
                <button className="btn btn-primary" onClick={() => setShowArchModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bridge Setup & Download Modal */}
      {showBridgeModal && (
        <div className="modal-backdrop" onClick={() => setShowBridgeModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>Native Accelerator Bridge</h3>
                <div className={`connection-status ${bridgeStatus}`}>
                  <span className="connection-dot" />
                  <span className="connection-text">
                    {bridgeStatus === 'online' ? `Connected (${bridgeProvider})` : 'Disconnected'}
                  </span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowBridgeModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-desc-banner">
                <span className="desc-badge">Hardware Acceleration</span>
                <p className="modal-desc">
                  ประมวลผลผ่าน Native ONNX Runtime ด้วย CPU/GPU ความเร็วสูงสุด (~200ms/รูป)
                </p>
              </div>

              <div className="guide-steps-list">
                <div className="guide-step">
                  <span className="step-num">1</span>
                  <div className="step-content">
                    <span className="step-title">ดาวน์โหลดตัวรัน Native Bridge</span>
                    <p className="step-sub">บันทึกไฟล์สคริปต์ลงในโฟลเดอร์เดียวกันกับโปรเจกต์</p>
                    <div style={{ marginTop: '8px' }}>
                      <a
                        href="/bridge_server.py"
                        download="bridge_server.py"
                        className="btn btn-action download-btn"
                        style={{ textDecoration: 'none' }}
                      >
                        Download bridge_server.py
                      </a>
                    </div>
                  </div>
                </div>

                <div className="guide-step">
                  <span className="step-num">2</span>
                  <div className="step-content">
                    <span className="step-title">เริ่มการทำงานของ Bridge Server</span>
                    <p className="step-sub">สคริปต์จะตรวจสอบและติดตั้งไลบรารีที่จำเป็นให้โดยอัตโนมัติในการรันครั้งแรก</p>
                    <div className="code-block-wrapper">
                      <pre className="code-block">python bridge_server.py</pre>
                      <button
                        className={`code-copy-btn ${copiedCmd ? 'copied' : ''}`}
                        title="Copy command"
                        onClick={() => {
                          navigator.clipboard.writeText('python bridge_server.py')
                          setCopiedCmd(true)
                          setTimeout(() => setCopiedCmd(false), 2000)
                        }}
                      >
                        {copiedCmd ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="step-note-box">
                      <span className="note-icon">ℹ</span>
                      <span>
                        <code className="tech-badge">Endpoint</code> พร้อมให้บริการที่ <strong className="endpoint-highlight">http://127.0.0.1:6767</strong> โดยระบบจะทำการ <code className="tech-badge">Handshake</code> กับ <code className="tech-badge">Client</code> อัตโนมัติ
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {bridgeSuccessMsg && (
                <div className="bridge-success-banner">
                  <svg className="error-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="#10b981" />
                    <path d="M5 8.2L7 10.2L11.5 5.8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="error-text">{bridgeSuccessMsg}</span>
                </div>
              )}
              {bridgeErrorMsg && (
                <div className="bridge-error-banner">
                  <svg className="error-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="#ef4444" />
                    <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="error-text">{bridgeErrorMsg}</span>
                </div>
              )}
              <div className="modal-footer-btns">
                <button
                  className="btn btn-action"
                  disabled={checkingBridge}
                  onClick={async () => {
                    setCheckingBridge(true)
                    setBridgeErrorMsg(null)
                    setBridgeSuccessMsg(null)
                    const ok = await checkBridgeHealth()
                    setCheckingBridge(false)
                    if (ok) {
                      setEngineMode('bridge')
                      setBridgeSuccessMsg('เชื่อมต่อ Native Bridge สำเร็จแล้ว พร้อมใช้งานโหมด Hardware Acceleration')
                    } else {
                      setBridgeErrorMsg('ไม่สามารถเชื่อมต่อ http://127.0.0.1:6767 ได้ กรุณาตรวจสอบว่ารัน python bridge_server.py แล้วหรือไม่')
                    }
                  }}
                >
                  {checkingBridge ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะการเชื่อมต่อ'}
                </button>
                <button className="btn btn-primary" onClick={() => setShowBridgeModal(false)}>
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
