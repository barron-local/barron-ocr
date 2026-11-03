# 1. Build Stage for Frontend
FROM oven/bun:latest AS frontend-builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun --bun x vite build

# 2. Runtime Stage with Python for AI Engine
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
RUN pip install --no-cache-dir \
    openvino \
    onnxruntime \
    opencv-python-headless \
    pyclipper \
    numpy \
    pillow \
    fastapi \
    uvicorn \
    python-multipart

# Copy AI model files and runtime
COPY det.onnx det.yml rec.onnx rec_dict.txt config.json app.py ./
COPY runtime/ ./runtime/

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
