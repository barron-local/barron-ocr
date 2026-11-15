# Barron OCR

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-Web_%26_Native-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Barron OCR** is a dual-engine Thai and English Optical Character Recognition (OCR) platform built with a minimalist precision interface. It powers instant zero-setup browser inference via WebAssembly (ONNX Runtime Web) and native high-throughput local hardware acceleration via a local Python Bridge.

---

## Key Highlights

- **Dual-Engine Architecture**:
  - **In-Browser (WASM)**: Zero installation. Fully client-side execution using ONNX Runtime Web. Data never leaves the browser sandbox.
  - **Native Bridge**: Local IPC daemon on port `6767` with CPU multi-threading and GPU acceleration (DirectML / CUDA / OpenVINO).
- **Rotated Text and Skew Robustness**:
  - Implements Convex Hull and Rotating Calipers for minimum bounding boxes and Bilinear quad perspective warping directly into model input tensors.
- **Thai Orthography Normalization**:
  - Handles legacy Private Use Area (PUA) tone marks, collapsed double vowels (`เเ` $\rightarrow$ `แ`), and Unicode canonical composition (NFC).
- **Precision UI / UX**:
  - Engineered for clarity with monochrome aesthetic, real-time bounding box inspection, multi-page batch queuing, and single-click copy export.

---

## Benchmark and Empirical Test Results

All benchmarks below were executed on actual synthetic and real-world test documents in `test_samples/` using the native ONNX Runtime pipeline (averaged over 3 runs on Intel/AMD x86_64 architecture).

| Test Document | Resolution | Lines Detected | Avg Latency (Native Bridge) | Mean Confidence | Typical Target |
|---|---|:---:|:---:|:---:|---|
| **01 Receipt** (`01_receipt.png`) | 480 × 640 | 14 lines | **630.33 ms** | 79.8% | Receipts, POS slips |
| **02 Official Letter** (`02_official_letter.png`) | 600 × 750 | 10 lines | **620.86 ms** | 79.9% | Thai government memoranda |
| **03 Bilingual Menu** (`03_bilingual_menu.png`) | 500 × 700 | 13 lines | **539.98 ms** | 79.3% | Mixed Thai/English typography |
| **04 Shipping Label** (`04_shipping_label.png`) | 620 × 520 | 9 lines | **668.96 ms** | 79.8% | Logistics parcels and barcodes |
| **05 Table Document** (`05_table_document.png`) | 720 × 580 | 21 lines | **645.60 ms** | 79.8% | Dense tabular grids |
| **06 Tilted Invoice** (`06_tilted_invoice.png`) | 506 × 414 | 6 lines | **627.21 ms** | 79.8% | Angled phone scans (-5° tilt) |

> **Note on WASM Latency**: WebAssembly runs in a single-thread CPU sandbox inside the browser, averaging **3.5s – 7.8s** depending on device CPU capability and image line count.

---

## Architecture

```
                      ┌──────────────────────────────────────┐
                      │              Web UI                  │
                      │  (React 18 + Vite + TypeScript)      │
                      └──────────────┬───────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    ┌───────────────────────────┐         ┌───────────────────────────┐
    │   In-Browser (WASM)       │         │   Native Bridge           │
    ├───────────────────────────┤         ├───────────────────────────┤
    │ • onnxruntime-web         │         │ • python bridge_server.py │
    │ • 100% Client-side        │         │ • Local Port 6767         │
    │ • Rotating Calipers Quad  │         │ • Multi-threaded CPU/GPU  │
    │ • Bilinear Perspective    │         │ • Auto-Dependency Install │
    │ • Canonical Thai Norm     │         │ • Low Latency (~600ms)    │
    └───────────────────────────┘         └───────────────────────────┘
```

### Models Used
- **Detector**: `DBNet` (Real-time Scene Text Detection with Differentiable Binarization)
- **Recognizer**: `OpenThai 2.0 OCR Text Recognizer` (CRNN with CTC loss)
- **Dictionary**: 1,783 Thai and alphanumeric character vocabulary

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18+) or **Bun** (v1.0+)
- **Python** (v3.9+) *(Optional, only required for Native Bridge)*

### 2. Installation
Clone the repository:
```bash
git clone https://github.com/barron-local/barron-ocr.git
cd barron-ocr
```

Install frontend dependencies:
```bash
bun install
# or: npm install
```

### 3. Running the Web Application
```bash
bun run dev
# or: npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. The application will initialize the WebAssembly engine automatically.

### 4. Running the Native Bridge (Optional, High Speed)
In a separate terminal:
```bash
python bridge_server.py
```
The server runs on `http://127.0.0.1:6767`. On the first run, it will automatically download missing model weights (`det.onnx`, `rec.onnx`, `rec_dict.txt`) from Hugging Face and install missing python packages (`onnxruntime`, `opencv-python`, `numpy`).

---

## Testing

### Frontend Unit Tests (Bun)
```bash
bun test
```
Runs test suite for Thai text normalizer, Unicode PUA remapping, and orthography rules.

### Building for Production
```bash
bun run build
# or: npm run build
```

---

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
