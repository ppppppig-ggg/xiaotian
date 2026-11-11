@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm was not found. Install Node.js 18 or newer first.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://localhost:5173' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  start "" "http://localhost:5173"
  exit /b 0
)

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing 'http://localhost:5173' -TimeoutSec 1 | Out-Null; Start-Process 'http://localhost:5173'; break } catch { Start-Sleep -Milliseconds 500 } }"

call npm run dev
pause