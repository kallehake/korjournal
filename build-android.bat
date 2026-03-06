@echo off
chcp 65001 >nul
cd /d "C:\Projekt\korjournal\apps\mobile"
echo ================================
echo  Bygger Korjournal APK (Android)
echo ================================
echo.
echo Detta bygger en fristaende APK som du kan installera
echo pa din telefon utan att datorn behover vara igang.
echo.
echo Forsta gangen behover du logga in pa ditt Expo-konto.
echo Skapa ett gratis konto pa https://expo.dev/signup
echo.
eas build --profile preview --platform android
echo.
echo Klar! Ladda ner APK-filen fran lanken ovan och
echo installera den pa din telefon.
pause
