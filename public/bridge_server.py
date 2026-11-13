import sys
import subprocess
import os
import urllib.request

REQUIRED_PACKAGES = ["onnxruntime", "opencv-python", "numpy"]

def ensure_dependencies():
    missing = []
    for pkg in REQUIRED_PACKAGES:
        mod_name = "cv2" if pkg == "opencv-python" else pkg
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg)
    if missing:
        sys.stdout.write(f"Installing missing dependencies: {', '.join(missing)}...\n")
        sys.stdout.flush()
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])

ensure_dependencies()

from http.server import HTTPServer, BaseHTTPRequestHandler
import base64
import json
import time
import re
import numpy as np
import cv2
import onnxruntime as ort
import unicodedata

# Standalone Thai PUA Mapping & Normalizer (Zero external file dependencies)
PUA_MAP = {
    0xF700: 0x0E10, 0xF701: 0x0E34, 0xF702: 0x0E35, 0xF703: 0x0E36, 0xF704: 0x0E37,
    0xF705: 0x0E48, 0xF706: 0x0E49, 0xF707: 0x0E4A, 0xF708: 0x0E4B, 0xF709: 0x0E4C,
    0xF70A: 0x0E48, 0xF70B: 0x0E49, 0xF70C: 0x0E4A, 0xF70D: 0x0E4B, 0xF70E: 0x0E4C,
    0xF70F: 0x0E0D, 0xF710: 0x0E31, 0xF711: 0x0E4D, 0xF712: 0x0E47, 0xF713: 0x0E48,
    0xF714: 0x0E49, 0xF715: 0x0E4A, 0xF716: 0x0E4B, 0xF717: 0x0E4C, 0xF718: 0x0E38,
    0xF719: 0x0E39, 0xF71A: 0x0E3A,
}
DROP_CHARS = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\u00ad\ufeff"))
TRANSLATE_TABLE = {**PUA_MAP, **DROP_CHARS, 0x00A0: 0x20}

SARA_AM_REGEX = re.compile(r"([่-๋]?)ํ([่-๋]?)า")
DOUBLE_SARA_E = re.compile(r"เเ")

THAI_OCR_FIXES = [
    (re.compile(r"\bใมส่งของ"), "ใบส่งของ"),
    (re.compile(r"ชั่วตราว"), "ชั่วคราว"),
    (re.compile(r"บริภารระบบ"), "บริการระบบ"),
    (re.compile(r"ราศาประเมิน"), "ราคาประเมิน"),
    (re.compile(r"ทีอยู่:"), "ที่อยู่:"),
    (re.compile(r"หลักสี(?=\s|$)"), "หลักสี่"),
]

def clean_thai_text(text: str) -> str:
    if not text:
        return ""
    # 1. PUA and invisible characters translation + NFC
    s = unicodedata.normalize("NFC", text.translate(TRANSLATE_TABLE))
    # 2. Collapse double sara e
    s = DOUBLE_SARA_E.sub("แ", s)
    # 3. Sara Am normalization
    s = SARA_AM_REGEX.sub(lambda m: m.group(1) + m.group(2) + "ำ", s)
    # 4. Domain & OCR confusion corrections
    for pat, rep in THAI_OCR_FIXES:
        s = pat.sub(rep, s)
    # 5. Collapse spaces
    s = re.sub(r"[ \t\f\v]+", " ", s).strip()
    return s

PORT = 6767
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

MODEL_URLS = {
    "det.onnx": "https://huggingface.co/iapp/OpenThai2.0-OCR-Text/resolve/main/det.onnx",
    "rec.onnx": "https://huggingface.co/iapp/OpenThai2.0-OCR-Text/resolve/main/rec.onnx",
    "rec_dict.txt": "https://huggingface.co/iapp/OpenThai2.0-OCR-Text/resolve/main/rec_dict.txt"
}

def locate_or_download_asset(filename: str) -> str:
    candidates = [
        os.path.join(SCRIPT_DIR, filename),
        os.path.join(SCRIPT_DIR, "public", filename),
        os.path.join(MODELS_DIR, filename)
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path

    dest_path = os.path.join(MODELS_DIR, filename)
    url = MODEL_URLS.get(filename)
    if not url:
        raise FileNotFoundError(f"No source URL defined for {filename}")

    sys.stdout.write(f"Downloading model asset: {filename}...\n")
    sys.stdout.flush()
    urllib.request.urlretrieve(url, dest_path)
    return dest_path

DET_MODEL_PATH = locate_or_download_asset("det.onnx")
REC_MODEL_PATH = locate_or_download_asset("rec.onnx")
DICT_PATH = locate_or_download_asset("rec_dict.txt")

with open(DICT_PATH, "r", encoding="utf-8") as f:
    CHAR_DICT = [""] + [line.strip("\r\n") for line in f] + [" "]

session_opts = ort.SessionOptions()
session_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
session_opts.intra_op_num_threads = os.cpu_count() or 4

available_providers = ort.get_available_providers()
active_providers = [
    p for p in ["OpenVINOExecutionProvider", "DmlExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]
    if p in available_providers
]

det_session = ort.InferenceSession(DET_MODEL_PATH, session_opts, providers=active_providers)
rec_session = ort.InferenceSession(REC_MODEL_PATH, session_opts, providers=active_providers)
CURRENT_PROVIDER = det_session.get_providers()[0]


def order_quad_clockwise(pts: np.ndarray) -> np.ndarray:
    x_sorted = pts[np.argsort(pts[:, 0]), :]
    left_pts = x_sorted[:2, :]
    right_pts = x_sorted[2:, :]
    left_pts = left_pts[np.argsort(left_pts[:, 1]), :]
    tl, bl = left_pts[0], left_pts[1]
    right_pts = right_pts[np.argsort(right_pts[:, 1]), :]
    tr, br = right_pts[0], right_pts[1]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def perspective_crop(img: np.ndarray, quad: np.ndarray) -> np.ndarray:
    ordered = order_quad_clockwise(quad)
    w_a = np.linalg.norm(ordered[1] - ordered[0])
    w_b = np.linalg.norm(ordered[2] - ordered[3])
    max_w = max(int(w_a), int(w_b))

    h_a = np.linalg.norm(ordered[3] - ordered[0])
    h_b = np.linalg.norm(ordered[2] - ordered[1])
    max_h = max(int(h_a), int(h_b))

    if max_w < 4 or max_h < 3:
        return None

    dst = np.array([[0, 0], [max_w, 0], [max_w, max_h], [0, max_h]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(ordered, dst)
    return cv2.warpPerspective(img, m, (max_w, max_h), borderMode=cv2.BORDER_REPLICATE)


def ctc_greedy_decode(probabilities: np.ndarray):
    indices = np.argmax(probabilities, axis=1)
    confidences = np.max(probabilities, axis=1)
    chars = []
    kept_scores = []

    for i, idx in enumerate(indices):
        if idx != 0 and (i == 0 or idx != indices[i - 1]):
            if idx < len(CHAR_DICT):
                chars.append(CHAR_DICT[idx])
                kept_scores.append(float(confidences[i]))

    mean_score = float(np.mean(kept_scores)) if kept_scores else 0.0
    normalized_conf = min(1.0, max(0.6, (mean_score + 15.0) / 20.0))
    return "".join(chars), normalized_conf


def execute_pipeline(image_bytes: bytes) -> dict:
    t0 = time.perf_counter()
    raw_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(raw_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode binary image data")

    orig_h, orig_w = image.shape[:2]

    limit_len = 960
    scale = 1.0
    if max(orig_h, orig_w) > limit_len:
        scale = float(limit_len) / max(orig_h, orig_w)

    target_h = max(int(round(orig_h * scale / 32) * 32), 32)
    target_w = max(int(round(orig_w * scale / 32) * 32), 32)

    resized = cv2.resize(image, (target_w, target_h))
    rgb_normalized = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    det_tensor = ((rgb_normalized - mean) / std).transpose((2, 0, 1))[None, ...].astype(np.float32)

    det_output = det_session.run(None, {det_session.get_inputs()[0].name: det_tensor})[0][0, 0]
    binary_mask = (det_output > 0.3).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    scale_x = orig_w / target_w
    scale_y = orig_h / target_h

    boxes = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 16:
            continue
        rect = cv2.minAreaRect(cnt)
        (cx, cy), (bw, bh), angle = rect
        perimeter = cv2.arcLength(cnt, True)
        unclip_dist = area * 1.5 / max(perimeter, 1.0)
        bw += unclip_dist * 2
        bh += unclip_dist * 2
        expanded_rect = ((cx, cy), (bw, bh), angle)
        box = cv2.boxPoints(expanded_rect)
        box[:, 0] *= scale_x
        box[:, 1] *= scale_y
        boxes.append(box)

    boxes.sort(key=lambda b: float(b[:, 1].mean()))

    lines = []
    for i, box in enumerate(boxes):
        warped = perspective_crop(image, box)
        if warped is None:
            continue
        if warped.shape[0] > warped.shape[1] * 1.2:
            warped = np.rot90(warped)

        fixed_h = 48
        dynamic_w = max(16, min(3200, int(round(fixed_h * warped.shape[1] / warped.shape[0]))))
        rec_input = cv2.resize(warped, (dynamic_w, fixed_h))
        rec_normalized = (rec_input.astype(np.float32) / 255.0 - 0.5) / 0.5
        rec_tensor = rec_normalized.transpose((2, 0, 1))[None, ...].astype(np.float32)

        rec_output = rec_session.run(None, {rec_session.get_inputs()[0].name: rec_tensor})[0]
        raw_text, conf = ctc_greedy_decode(rec_output[0])
        text = clean_thai_text(raw_text)
        if text.strip():
            lines.append({
                "text": text,
                "confidence": conf,
                "box": box.tolist(),
                "row": i
            })

    elapsed_ms = int(round((time.perf_counter() - t0) * 1000))
    return {
        "text": "\n".join([line["text"] for line in lines]),
        "lines": lines,
        "processingTimeMs": elapsed_ms,
        "imageWidth": orig_w,
        "imageHeight": orig_h,
        "provider": CURRENT_PROVIDER
    }


class HTTPBridgeHandler(BaseHTTPRequestHandler):
    def send_cors_response(self, code: int, body: bytes, content_type: str = "application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_cors_response(204, b"")

    def do_GET(self):
        if self.path == "/health":
            payload = json.dumps({
                "status": "online",
                "engine": "Barron OCR Native Bridge",
                "provider": CURRENT_PROVIDER,
                "threads": session_opts.intra_op_num_threads
            }).encode("utf-8")
            self.send_cors_response(200, payload)
        else:
            self.send_cors_response(404, b'{"error": "Resource Not Found"}')

    def do_POST(self):
        if self.path == "/ocr":
            length = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(length)
            try:
                content_type = self.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    parsed = json.loads(data.decode("utf-8"))
                    encoded = parsed.get("image", "")
                    if "," in encoded:
                        encoded = encoded.split(",", 1)[1]
                    raw_bytes = base64.b64decode(encoded)
                else:
                    raw_bytes = data

                output = execute_pipeline(raw_bytes)
                payload = json.dumps(output, ensure_ascii=False).encode("utf-8")
                self.send_cors_response(200, payload)
            except Exception as exc:
                err_payload = json.dumps({"error": str(exc)}).encode("utf-8")
                self.send_cors_response(500, err_payload)
        else:
            self.send_cors_response(404, b'{"error": "Endpoint Not Found"}')

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {args[0]} {args[1]} {args[2]}\n")


def serve():
    address = ("127.0.0.1", PORT)
    server = HTTPServer(address, HTTPBridgeHandler)
    sys.stdout.write(f"Barron OCR Native Bridge initialized on http://127.0.0.1:{PORT} [{CURRENT_PROVIDER}]\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    serve()
