@echo off
chcp 65001 >nul
title Rubsax Editor & Transposer (Local Dev Server)
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0"
echo ========================================================
echo   RUBSAX EDITOR ^& TRANSPOSER - ETAPA 1 (SaaS Local)
echo   Acesse no navegador: http://localhost:3000
echo ========================================================
npm run dev
pause
