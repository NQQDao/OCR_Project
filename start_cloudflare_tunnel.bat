@echo off
title Cloudflare Tunnel - Dua Website ra Internet
cd /d "%~dp0"
echo ============================================================
echo   DANG KHOI TAO DUONG HAM CLOUDFLARE TUNNEL...
echo ============================================================
echo   Website tren may: http://127.0.0.1:8000
echo   Cloudflare se cap cho ban mot duong link HTTPS cong khai.
echo   Moi nguoi o bat ky dau deu co the mo link de su dung web!
echo ============================================================
echo.
cloudflared.exe tunnel --url http://127.0.0.1:8000
pause

