@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul || (echo Trebuetsya Python & exit /b 1)
where node >nul 2>nul || (echo Trebuetsya Node.js & exit /b 1)
where npm >nul 2>nul || (echo Trebuetsya npm & exit /b 1)
if not exist "node_modules\typescript\bin\tsc" (
    call npm install || exit /b 1
)
call npm run build || exit /b 1
start "Ayureika API" /D "%~dp0" python backend\main.py
node server.js
