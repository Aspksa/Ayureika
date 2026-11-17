@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
    where py >nul 2>nul
    if not errorlevel 1 (
        py -3 "%~dp0launcher.py"
        exit /b %errorlevel%
    )
    where winget >nul 2>nul
    if errorlevel 1 (
        echo Не найден Python и winget. Установите Python 3.
        pause
        exit /b 1
    )
    echo Установка Python через winget...
    winget install --id Python.Python.3.13 --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 exit /b 1
    where py >nul 2>nul
    if errorlevel 1 (
        echo Python установлен. Перезапустите Ayureika.bat.
        pause
        exit /b 1
    )
    py -3 "%~dp0launcher.py"
    exit /b %errorlevel%
)
python "%~dp0launcher.py"
exit /b %errorlevel%
