@echo off
REM Set Django settings module
set DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings

REM Start Django with Daphne for WebSocket support
echo Starting Django with Daphne for WebSocket support...
echo Backend will be available at: http://127.0.0.1:8000
echo WebSocket endpoint: ws://127.0.0.1:8000/ws/presence/
echo.

daphne -p 8000 poehr_scheduling_backend.asgi:application
