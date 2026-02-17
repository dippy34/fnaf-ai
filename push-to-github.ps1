# Run this AFTER you install Git and create an empty repo on GitHub.
# Usage: powershell -ExecutionPolicy Bypass -File push-to-github.ps1
# Then run the two commands it prints at the end (with your repo URL).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Check for git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git is not installed. Install from: https://git-scm.com/download/win"
    Write-Host "Then restart your terminal and run this script again."
    exit 1
}

if (Test-Path .git) {
    Write-Host "Already a git repo. Adding and committing..."
} else {
    Write-Host "Initializing git repo..."
    git init
    git branch -M main
}

git add index.html styles.css game.js README.md .gitignore
git status
git commit -m "Initial commit: FNAF browser game" 2>$null
if ($LASTEXITCODE -ne 0) {
    git commit -m "Initial commit: FNAF browser game"
}

Write-Host ""
Write-Host "=============================================="
Write-Host "Next: create an EMPTY repo on GitHub:"
Write-Host "  https://github.com/new"
Write-Host ""
Write-Host "Then run (replace YOUR_USERNAME and REPO_NAME):"
Write-Host "  git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git"
Write-Host "  git push -u origin main"
Write-Host "=============================================="
