@echo off
chcp 65001 >nul
cd /d "C:\Projekt\korjournal"
echo Startar Korjournal webbapp...
echo.
echo Oppna http://localhost:3000 i din webblasare
echo Tryck Ctrl+C for att stanga av servern
echo.
pnpm run dev:web
pause
