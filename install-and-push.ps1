# Run this after Git is installed. You will be asked to sign into GitHub when you push.
# If you just installed Git: close this terminal, open a NEW one, then run:
#   cd c:\Users\learnwell\Desktop\fnaf
#   powershell -ExecutionPolicy Bypass -File install-and-push.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Find Git: PATH first, then common install locations, then refresh PATH
$gitExe = $null
$g = Get-Command git -ErrorAction SilentlyContinue
if ($g) { $gitExe = $g.Source }
if (-not $gitExe -and (Test-Path "C:\Program Files\Git\bin\git.exe")) {
    $gitExe = "C:\Program Files\Git\bin\git.exe"
}
if (-not $gitExe -and (Test-Path "C:\Program Files (x86)\Git\bin\git.exe")) {
    $gitExe = "C:\Program Files (x86)\Git\bin\git.exe"
}
if (-not $gitExe) {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $g = Get-Command git -ErrorAction SilentlyContinue
    if ($g) { $gitExe = $g.Source }
}

if (-not $gitExe) {
    Write-Host "Git is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it with one of these options:"
    Write-Host "  Option A - Run in this terminal (may ask for admin):"
    Write-Host "    winget install --id Git.Git -e --source winget"
    Write-Host ""
    Write-Host "  Option B - Download and run the installer:"
    Write-Host "    https://git-scm.com/download/win"
    Write-Host ""
    Write-Host "After installing: close this terminal, open a NEW one, then run this script again."
    exit 1
}

& $gitExe --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git could not run." -ForegroundColor Red
    exit 1
}

Write-Host "Git found. Setting up repo..." -ForegroundColor Green

if (-not (Test-Path .git)) {
    & $gitExe init
    & $gitExe branch -M main
}

& $gitExe add index.html styles.css game.js README.md .gitignore
& $gitExe status
& $gitExe commit -m "Initial commit: FNAF browser game"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing to commit or commit failed (may already be committed)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Create a new EMPTY repo on GitHub:"
Write-Host "  https://github.com/new"
Write-Host "  (Name it e.g. 'fnaf', leave README/gitignore unchecked)"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$repoUrl = Read-Host "Paste your new repo URL (e.g. https://github.com/YourName/fnaf.git)"
if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Host "Skipped. Run these yourself when ready:"
    Write-Host "  git remote add origin YOUR_URL"
    Write-Host "  git push -u origin main"
    exit 0
}

$repoUrl = $repoUrl.Trim()
if (-not $repoUrl.EndsWith(".git")) { $repoUrl = $repoUrl + ".git" }

# Remove existing origin only if it exists (ignore "no such remote" error)
$prevErr = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
& $gitExe remote remove origin 2>&1 | Out-Null
$ErrorActionPreference = $prevErr
& $gitExe remote add origin $repoUrl
Write-Host "Pushing... (you may be asked to sign into GitHub)" -ForegroundColor Green
& $gitExe push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Your code is on GitHub." -ForegroundColor Green
} else {
    Write-Host "Push failed. Sign in when prompted, or use a Personal Access Token as password." -ForegroundColor Yellow
    Write-Host "Retry with: git push -u origin main"
}
