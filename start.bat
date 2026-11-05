@echo off
title Barron Intelligent OpenThai OCR Web
echo ===================================================
echo   Starting Barron Intelligent OpenThai OCR Web App
echo ===================================================
echo.
echo Opening browser at http://localhost:8000 ...
start http://localhost:8000
echo.
echo Running AI Model Engine & Web Server...
.\.venv\Scripts\python.exe app.py
pause
