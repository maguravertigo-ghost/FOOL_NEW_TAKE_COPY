@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  NEW_FOOL - build the archive for Yandex Games
REM
REM  Packs ONLY the files the game needs at runtime:
REM    index.html, favicon.ico, card_constructor.css, css\, js\, assets\
REM  Output: yandex_zip\fool_YYYYMMDD_HHMM.zip
REM
REM  Yandex limits: <= 100 MB unpacked, index.html in the archive
REM  root, no spaces or Cyrillic in file/folder names.
REM ============================================================

cd /d "%~dp0"
title NEW_FOOL - build yandex zip

set "OUT_DIR=%~dp0yandex_zip"
set "SEVENZIP="

REM ---------- find 7-Zip ----------
if exist "%ProgramFiles%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles%\7-Zip\7z.exe"
if not defined SEVENZIP if exist "%ProgramFiles(x86)%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles(x86)%\7-Zip\7z.exe"
if not defined SEVENZIP for %%i in (7z.exe) do if exist "%%~$PATH:i" set "SEVENZIP=%%~$PATH:i"

if not defined SEVENZIP (
  echo [ERROR] 7-Zip not found.
  echo         Install it or add 7z.exe to PATH.
  pause
  exit /b 1
)

REM ---------- sanity checks ----------
if not exist "index.html" (
  echo [ERROR] index.html not found - run this .bat from the project root.
  pause
  exit /b 1
)
for %%D in (css js assets) do (
  if not exist "%%D\" (
    echo [ERROR] folder "%%D" not found - run this .bat from the project root.
    pause
    exit /b 1
  )
)
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

REM ---------- timestamp ----------
set "DT="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmm"`) do set "DT=%%i"
if not defined DT set "DT=build"

set "OUT=%OUT_DIR%\fool_%DT%.zip"
if exist "%OUT%" del "%OUT%"

echo.
echo  7-Zip : %SEVENZIP%
echo  Output: %OUT%
echo.

REM ---------- pack ----------
REM  node_modules / system junk are excluded just in case.
"%SEVENZIP%" a -tzip -mx=5 -mmt=on "%OUT%" ^
  "index.html" "favicon.ico" "card_constructor.css" ^
  "css" "js" "assets" ^
  -xr!node_modules -xr!*.log -xr!.DS_Store -xr!Thumbs.db

if errorlevel 1 (
  echo.
  echo [ERROR] 7-Zip failed to create the archive.
  pause
  exit /b 1
)

REM ---------- report ----------
set "SIZE=0"
for %%A in ("%OUT%") do set "SIZE=%%~zA"
set /a SIZE_MB=%SIZE% / 1048576

echo.
echo  ============================================
echo   Archive : %OUT%
echo   Size    : %SIZE_MB% MB (%SIZE% bytes)
echo  ============================================

if %SIZE_MB% GEQ 100 (
  echo  [WARN] Archive is 100 MB or larger - Yandex limit is 100 MB unpacked.
) else (
  echo  OK - within the 100 MB limit.
)

REM Quiet content check: index.html must be in the archive root.
"%SEVENZIP%" l "%OUT%" | findstr /b /c:"  index.html" >nul
if errorlevel 1 (
  echo  [WARN] index.html not found in the archive root - check the archive.
)

echo.
pause
exit /b 0
