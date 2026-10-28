# Starts the FastAPI backend on http://127.0.0.1:8000
$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot 'venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Error "No virtual environment found at .\venv. Create it first:`n  py -3.12 -m venv venv`n  .\venv\Scripts\python.exe -m pip install -r backend\requirements.txt"
}
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) {
    Write-Warning '.env not found. Copy .env.example to .env and set OPENAI_API_KEY, otherwise runs will be refused.'
}

Set-Location (Join-Path $PSScriptRoot 'backend')
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
