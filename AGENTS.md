# Development

## Windows

### pyenv

When working on Windows, `pyenv-win` is used to manage Python versions. If you also need to use Node.js inside your project (e.g., for UI frontends like Vite/React), you can keep everything isolated without polluting the global system by combining `pyenv`, `venv`, and `nodeenv`.

#### 1. Set the Local Python Version
First, ensure you have installed the required Python version (`pyenv install 3.7.4`). Then, set it as the active version for the directory:
```powershell
pyenv local 3.7.4
```

#### 2. Create and Activate a Virtual Environment
Create a localized Python environment (`venv`) to keep project dependencies isolated:
```powershell
python -m venv venv
.\venv\Scripts\activate
```

#### 3. Install Node.js via `nodeenv`
Instead of installing Node globally, you can install it directly into your active `venv` so it's only available when working on this project:
```powershell
# Install the nodeenv package via pip
pip install nodeenv

# Install Node.js directly into the currently active virtual environment
nodeenv -p
```
Once completed, `node`, `npm`, and `npx` will be fully available in your terminal anytime the `venv` is activated.

#### 4. Auto-Activate Virtual Environment in PowerShell (Optional)
To avoid typing `.\venv\Scripts\activate` every time you open a terminal, you can automate it via your PowerShell profile:

1. Open your profile (this command safely creates it if it doesn't exist):
```powershell
New-Item -Path $PROFILE -Type File -Force | Out-Null
notepad $PROFILE
```
2. Add this snippet to the bottom of the file:
```powershell
# Auto-activate a Python venv if it exists in the current directory
if (Test-Path ".\venv\Scripts\activate.ps1") {
    Write-Host "Found venv, automatically activating..." -ForegroundColor Green
    . ".\venv\Scripts\activate.ps1"
}
```
3. Save and close Notepad. Your environment will now activate automatically.
