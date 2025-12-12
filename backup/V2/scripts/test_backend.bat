@echo off
echo 🐍 Testing Backend API...
echo.
cd Backend\API
call venv\Scripts\activate.bat
echo 🚀 Starting backend API server...
echo    API will be available at: http://localhost:8000
echo    Health check: http://localhost:8000/health
echo    API docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.
python main.py
