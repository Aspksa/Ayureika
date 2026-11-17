@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto fail
where py >nul 2>nul
if not errorlevel 1 goto py
where python >nul 2>nul
if not errorlevel 1 goto python
where winget >nul 2>nul
if errorlevel 1 (
    echo Python and winget are unavailable.
    goto fail
)
echo Installing Python...
winget install --id Python.Python.3.13 --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto fail
where py >nul 2>nul
if errorlevel 1 (
    echo Restart Ayureika.bat after Python installation.
    goto fail
)
:py
py -3 "%~dp0launcher.py"
if errorlevel 1 goto fail
goto end
:python
python "%~dp0launcher.py"
if errorlevel 1 goto fail
goto end
:fail
echo.
echo Ayureika startup failed. See logs\startup.log
pause
exit /b 1
:end
exit /b 0
