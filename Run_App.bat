@echo off
title YarnCraft Companion Application
cd /d "%~dp0"
echo Starting YarnCraft Companion Application...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
