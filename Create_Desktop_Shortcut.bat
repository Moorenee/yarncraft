@echo off
title Create Desktop App Shortcut
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_shortcut.ps1"
echo.
echo ========================================================
echo   YarnCraft Companion is now installed on your Desktop!
echo   You can double-click the icon on your Desktop anytime.
echo ========================================================
echo.
pause
