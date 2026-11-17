@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto fail
where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo PowerShell not found.
    goto fail
)
echo Starting Ayureika...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0python_bootstrap.ps1"
set "AYUREIKA_EXIT=%ERRORLEVEL%"
echo.
echo Ayureika process finished with code %AYUREIKA_EXIT%.
if not "%AYUREIKA_EXIT%"=="0" goto fail
echo Ayureika stopped. This window will stay open so you can read the output.
pause
exit /b 0
:fail
echo.
echo Ayureika startup failed. Check logs\startup.log and the messages above.
pause
exit /b 1
