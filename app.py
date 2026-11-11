import io
import os
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image
import numpy as np

# Load OpenThai2.0-OCR runtime
from runtime.line_engine import LineOCR

app = FastAPI(title="Barron OpenThai OCR API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(" Loading OpenThai2.0-OCR Engine...")
ocr_engine = LineOCR(".", threads=1)
print(" OpenThai2.0-OCR Engine Ready!")

@app.post("/api/ocr")
async def process_ocr(file: UploadFile = File(...)):
    try:
        start_time = time.time()
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Convert PIL to BGR ndarray (OpenCV format expected by LineOCR)
        img_np = np.array(image)
        img_bgr = img_np[:, :, ::-1].copy()

        # Run OCR
        result = ocr_engine.read(img_bgr)
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        # Structure response
        lines = []
        for line in result.get("lines", []):
            lines.append({
                "text": line.get("text", ""),
                "confidence": float(line.get("confidence", 0.0)),
                "box": line.get("box", []),
                "row": line.get("row", 0)
            })

        return {
            "success": True,
            "text": result.get("text", ""),
            "lines": lines,
            "rotation": result.get("rotation", 0),
            "text_angle": result.get("text_angle", 0.0),
            "processing_time_ms": elapsed_ms,
            "image_size": {
                "width": image.width,
                "height": image.height
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static frontend build if dist directory exists
if os.path.exists("./dist"):
    app.mount("/assets", StaticFiles(directory="./dist/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join("./dist", full_path)
        if full_path != "" and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("./dist/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
