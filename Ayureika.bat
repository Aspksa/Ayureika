@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto fail
where powershell.exe >nul 2>nul
if errorlevel 1 goto fail
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0python_bootstrap.ps1"
if errorlevel 1 goto fail
exit /b 0
:fail
echo.
echo Ayureika startup failed. Check the message above.
pause
exit /b 1
