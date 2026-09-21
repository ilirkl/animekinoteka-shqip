@echo off
rem Thin wrapper so the pipeline can be driven as "ani scan" from anywhere,
rem instead of repeating the interpreter path and --project on every call.
rem Arguments pass straight through, so the commands are exactly pipeline.py's:
rem
rem   ani init                     once, ever - never on an ordinary run
rem   ani scan                     queue newly observed releases
rem   ani status                   dump the queue state
rem   ani prepare RELEASE_ID       match, then download the English ASS
rem   ani build RELEASE_ID --reviewed
rem   ani publish RELEASE_ID
rem   ani expand BATCH_ID          deliberate backfill only
setlocal
set "PROJECT=%~dp0"
if "%PROJECT:~-1%"=="\" set "PROJECT=%PROJECT:~0,-1%"
set "PY=C:\Python312\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" "%PROJECT%\scripts\automation\pipeline.py" --project "%PROJECT%" %*
exit /b %ERRORLEVEL%
