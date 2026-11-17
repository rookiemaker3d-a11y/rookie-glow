@echo off
cd /d "%~dp0"
echo Sirviendo Lunas en http://localhost:8080
echo Web Bluetooth requiere localhost o HTTPS.
python -m http.server 8080
