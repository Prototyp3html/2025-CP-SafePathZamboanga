# 🧹 Managing Auto-Generated Files

## Why Files Keep Coming Back

The following files/folders are **automatically generated** by development tools and will reappear whenever you run the project:

### 🐍 Python Auto-Generated Files

- `__pycache__/` - Python bytecode cache (created when running Python)
- `*.pyc` files - Compiled Python files
- `.venv/` - Virtual environment (if created)

### 📦 Node.js Auto-Generated Files

- `node_modules/` - Dependencies (created by `npm install`)
- `dist/` - Build output (created by `npm run build`)
- `*.tsbuildinfo` - TypeScript incremental build cache

### 🔧 IDE Auto-Generated Files

- `.vscode/` - VS Code workspace settings
- `.idea/` - IntelliJ IDEA settings

## ✅ Solutions

### 1. **Use .gitignore (Recommended)**

All auto-generated files are now properly ignored in `.gitignore`. They won't be tracked by Git even if they exist.

### 2. **Use the Cleanup Script**

Run the PowerShell cleanup script when needed:

```powershell
.\cleanup.ps1
```

### 3. **Don't Delete These Files**

These files actually **improve performance**:

- `__pycache__/` makes Python imports faster
- `*.tsbuildinfo` makes TypeScript compilation faster
- `node_modules/` contains required dependencies

## 🎯 Best Practice

**Leave the files alone!** They're meant to exist during development. The `.gitignore` prevents them from being committed to version control, which is what matters.

## 🚫 Files That Should Never Come Back

If you see these files reappearing, it indicates a problem:

- `risk-visualization.html` (old prototype file)
- `simple_test.py` (temporary test file)
- Any `.env` files with sensitive data

## 🛠️ VS Code Settings

To prevent VS Code from creating unwanted files, you can add to `.vscode/settings.json`:

```json
{
  "files.exclude": {
    "**/__pycache__": true,
    "**/*.tsbuildinfo": true,
    "**/node_modules": true
  }
}
```

This will hide them from the file explorer while allowing them to exist.
