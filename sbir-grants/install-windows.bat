@echo off
chcp 65001 >nul

REM SBIR Skill 自動安裝程式 (Windows) - v7 穩定版
REM 修復：依賴完整性、路徑空格、驗證步驟

REM 切換到腳本所在目錄
cd /d "%~dp0"

echo ==========================================
echo    SBIR Skill 自動安裝程式 (Windows)
echo ==========================================
echo.
echo 正在啟動安裝程式...
echo.

REM ============================================
REM 步驟 0: 環境檢查
REM ============================================
if not exist "mcp-server\server.py" (
    echo [X] 錯誤：請在 sbir-grants 資料夾中執行此程式
    echo 請先下載專案，然後在專案資料夾中執行
    pause
    exit /b 1
)

echo [OK] 找到專案資料夾
echo.

REM ============================================
REM 步驟 1/5: 檢查 Python
REM ============================================
echo 步驟 1/5: 檢查 Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [X] 找不到 Python
    echo.
    echo 請先安裝 Python：
    echo 1. 前往 https://www.python.org/downloads/
    echo 2. 下載 Python 3.10 或更新版本
    echo 3. 安裝時記得勾選 Add Python to PATH
    echo 4. 安裝完成後，重新執行此程式
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set "PYTHON_VERSION=%%i"
echo [OK] 找到 Python: %PYTHON_VERSION%
echo.

REM ============================================
REM 步驟 2/5: 建立虛擬環境
REM ============================================
echo 步驟 2/5: 建立虛擬環境...

if not exist "venv" (
    echo 正在建立虛擬環境...
    python -m venv venv
    if errorlevel 1 (
        echo [X] 虛擬環境建立失敗
        pause
        exit /b 1
    )
) else (
    echo [i] 虛擬環境已存在，跳過建立
)
echo [OK] 虛擬環境就緒
echo.

REM ============================================
REM 步驟 3/5: 安裝依賴套件（使用 requirements.txt）
REM ============================================
echo 步驟 3/5: 安裝依賴套件...
echo 首次安裝可能需要 5-10 分鐘（需下載 AI 模型），請耐心等候...
echo.

echo 正在升級 pip...
"venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo [!] pip 升級失敗，繼續使用現有版本...
)

echo 正在安裝所有依賴套件...
"venv\Scripts\python.exe" -m pip install -r "mcp-server\requirements.txt" --quiet
if errorlevel 1 (
    echo [X] 套件安裝失敗
    echo.
    echo 常見原因：
    echo   1. 網路連線問題
    echo   2. 磁碟空間不足（需要約 1.5 GB）
    echo   3. Python 版本太舊（需要 3.10+）
    pause
    exit /b 1
)

echo [OK] 所有依賴套件安裝完成
echo.

REM ============================================
REM 步驟 4/5: 設定 Claude Desktop
REM ============================================
echo 步驟 4/5: 設定 Claude Desktop...

set "PROJECT_PATH=%~dp0"
REM 移除最後的反斜線
if "%PROJECT_PATH:~-1%"=="\" set "PROJECT_PATH=%PROJECT_PATH:~0,-1%"

set "CONFIG_DIR=%APPDATA%\Claude"
set "CONFIG_FILE=%CONFIG_DIR%\claude_desktop_config.json"

if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

if exist "%CONFIG_FILE%" (
    copy /y "%CONFIG_FILE%" "%CONFIG_FILE%.bak" >nul
    echo [i] 已備份現有設定至 claude_desktop_config.json.bak
)

REM 檢查輔助腳本是否存在
if not exist "venv\Scripts\python.exe" (
    echo [X] 找不到虛擬環境中的 Python
    pause
    exit /b 1
)

if not exist "mcp-server\update_config.py" (
    echo [X] 找不到設定更新腳本
    pause
    exit /b 1
)

REM 使用帶引號的變數（防止路徑空格）
set "PYTHON_PATH=%PROJECT_PATH%\venv\Scripts\python.exe"
set "SERVER_PATH=%PROJECT_PATH%\mcp-server\server.py"

REM 轉換為 JSON 格式的路徑（使用正斜線）
set "PYTHON_JSON=%PYTHON_PATH:\=/%"
set "SERVER_JSON=%SERVER_PATH:\=/%"

REM 執行設定更新（帶引號保護路徑中的空格）
"venv\Scripts\python.exe" "mcp-server\update_config.py" "%CONFIG_FILE%" "%PYTHON_JSON%" "%SERVER_JSON%"

if %errorlevel% neq 0 (
    echo [X] 設定檔更新失敗
    echo.
    echo 請嘗試手動設定：
    echo 1. 開啟檔案：%CONFIG_FILE%
    echo 2. 加入以下 JSON 內容（注意使用正斜線路徑）
    pause
    exit /b 1
)

echo [OK] Claude Desktop 設定已安全更新
echo     設定檔位置: %CONFIG_FILE%
echo     已保留其他 MCP Server 設定
echo.

REM ============================================
REM 步驟 5/5: 安裝後自動驗證
REM ============================================
echo 步驟 5/5: 驗證安裝...

"venv\Scripts\python.exe" -c "import mcp; import pydantic; import httpx; import yaml; import docx; print('CORE_OK')" >nul 2>&1
if errorlevel 1 (
    echo [!] 部分核心模組驗證失敗，Server 可能無法正常啟動
    echo     建議重新執行安裝程式
) else (
    echo [OK] 核心模組驗證通過
)

"venv\Scripts\python.exe" -c "import chromadb; print('OK')" >nul 2>&1
if errorlevel 1 (
    echo [i] AI 語意搜尋模組未安裝（不影響核心功能）
    echo     如需啟用，請執行：
    echo     venv\Scripts\python.exe -m pip install chromadb sentence-transformers
) else (
    echo [OK] AI 語意搜尋模組驗證通過
)
echo.

REM ============================================
REM 完成
REM ============================================
echo ==========================================
echo    安裝成功！
echo ==========================================
echo.
echo 下一步：
echo 1. 重新啟動 Claude Desktop
echo    - 完全關閉 Claude（右上角 X 或工作列關閉）
echo    - 重新開啟 Claude
echo.
echo 2. 測試是否成功：
echo    在 Claude 中輸入：
echo    請使用 MCP Server 查詢機械產業的市場數據
echo.
echo 3. 如果看到 Claude 呼叫 MCP Server，就代表成功了！
echo.
echo 4. 查看使用指南：
echo    - FIRST_TIME_USE.md
echo    - HOW_TO_USE.md
echo.
echo 注意事項：
echo    - 已使用虛擬環境隔離依賴套件
echo    - 已保留您原有的 Claude Desktop 設定
echo    - 備份檔案：claude_desktop_config.json.bak
echo.
echo ==========================================
pause
