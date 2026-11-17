@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul || (echo Python is required & exit /b 1)
where node >nul 2>nul || (echo Node.js is required & exit /b 1)
start "Ayureika API" /D "%~dp0" python backend\main.py
node server.js
