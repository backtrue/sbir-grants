@echo off
chcp 65001 >nul

REM 切換到腳本所在目錄（這樣不管從哪裡執行都能正常運作）
cd /d "%~dp0"

REM SBIR Skill 自動安裝程式 (Final v6)
echo ==========================================
echo    SBIR Skill 自動安裝程式
echo ==========================================
echo.
echo 正在啟動安裝程式...
echo 腳本位置: %~dp0
echo.

REM 步驟 0: 環境檢查
if not exist "mcp-server\server.py" (
    echo [X] 錯誤：請在 sbir-grants 資料夾中執行此程式
    echo 請先下載專案，然後在專案資料夾中執行
    pause
    exit /b 1
)

echo [OK] 找到專案資料夾
echo.

REM 步驟 1: 檢查 Python
echo 步驟 1/4: 檢查 Python...
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

REM 步驟 2: 建立虛擬環境與安裝套件
echo 步驟 2/4: 建立虛擬環境與安裝套件...
echo 這可能需要幾分鐘，請稍候...

if not exist "venv" (
    echo 正在建立虛擬環境...
    python -m venv venv
    if errorlevel 1 (
        echo [X] 虛擬環境建立失敗
        pause
        exit /b 1
    )
)

echo 正在升級 pip...
venv\Scripts\python.exe -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo [X] pip 升級失敗
    pause
    exit /b 1
)

echo 正在安裝依賴套件...
venv\Scripts\python.exe -m pip install mcp httpx pydantic python-docx --quiet
if errorlevel 1 (
    echo [X] 套件安裝失敗
    echo 請檢查網路連線
    pause
    exit /b 1
)

echo [OK] 虛擬環境與套件安裝完成
echo.

REM 步驟 3: 設定 Claude Desktop
echo 步驟 3/4: 設定 Claude Desktop...

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

REM 使用專案內的 Python 腳本更新設定（最可靠）
echo 正在更新設定檔...

REM 先測試 Python 和腳本是否可用
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

REM 使用標準變數語法（更可靠）
set PYTHON_PATH=%PROJECT_PATH%\venv\Scripts\python.exe
set SERVER_PATH=%PROJECT_PATH%\mcp-server\server.py

REM 轉換為 JSON 格式的路徑（使用正斜線）
set PYTHON_JSON=%PYTHON_PATH:\=/%
set SERVER_JSON=%SERVER_PATH:\=/%

REM 執行設定更新
venv\Scripts\python.exe mcp-server\update_config.py "%CONFIG_FILE%" "%PYTHON_JSON%" "%SERVER_JSON%"

if %errorlevel% neq 0 (
    echo [X] 設定檔更新失敗
    echo.
    echo 請嘗試手動設定：
    echo 1. 開啟檔案：%CONFIG_FILE%
    echo 2. 加入以下內容：
    echo {
    echo   "mcpServers": {
    echo     "sbir-grants": {
    echo       "command": "%PYTHON_JSON%",
    echo       "args": ["%SERVER_JSON%"]
    echo     }
    echo   }
    echo }
    pause
    exit /b 1
)

echo [OK] Claude Desktop 設定已安全更新
echo     設定檔位置: %CONFIG_FILE%
echo     已保留其他 MCP Server 設定
echo.

REM 步驟 4: 完成
echo 步驟 4/4: 完成安裝
echo.
echo ==========================================
echo    安裝成功！
echo ==========================================
echo.
echo 下一步：
echo 1. 重新啟動 Claude Desktop
echo    - 完全關閉 Claude（右上角 X）
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
