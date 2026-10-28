# Starts the Vite dev server on http://127.0.0.1:5173 (expects the backend on port 8000)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot 'frontend')

if (-not (Test-Path 'node_modules')) {
    npm install
}
npm run dev -- --host 127.0.0.1 --port 5173
