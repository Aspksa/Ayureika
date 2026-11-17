@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto fail

rem Prefer a working Python executable; py.exe may point to a removed Python.
where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; assert sys.version_info >= (3, 9)" >nul 2>nul
    if not errorlevel 1 goto python
)
where py >nul 2>nul
if not errorlevel 1 (
    py -3 -c "import sys; assert sys.version_info >= (3, 9)" >nul 2>nul
    if not errorlevel 1 goto py
)
where winget >nul 2>nul
if errorlevel 1 (
    echo No working Python 3.9+ found, and winget is unavailable.
    goto fail
)
echo Installing Python 3.13...
winget install --id Python.Python.3.13 --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto fail
rem Installation may not refresh PATH in this console.
where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; assert sys.version_info >= (3, 9)" >nul 2>nul
    if not errorlevel 1 goto python
)
where py >nul 2>nul
if not errorlevel 1 (
    py -3 -c "import sys; assert sys.version_info >= (3, 9)" >nul 2>nul
    if not errorlevel 1 goto py
)
echo Python installed but not yet available. Restart this BAT.
goto fail

:python
python "%~dp0launcher.py"
if errorlevel 1 goto fail
goto end

:py
py -3 "%~dp0launcher.py"
if errorlevel 1 goto fail
goto end

:fail
echo.
echo Ayureika startup failed. See logs\startup.log
pause
exit /b 1

:end
exit /b 0
