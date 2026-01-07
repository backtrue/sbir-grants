@echo off
chcp 65001 >nul
REM SBIR Skill 自動安裝程式（Windows 版）
REM 這個程式會自動幫您安裝所有需要的東西

echo ==========================================
echo    SBIR Skill 自動安裝程式
echo ==========================================
echo.

REM 檢查是否在正確的目錄
if not exist "mcp-server\server.py" (
    echo ❌ 錯誤：請在 sbir-grants 資料夾中執行此程式
    echo 請先下載專案，然後在專案資料夾中執行
    pause
    exit /b 1
)

echo ✅ 找到專案資料夾
echo.

REM 步驟 1: 檢查 Python
echo 步驟 1/4: 檢查 Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 找不到 Python
    echo.
    echo 請先安裝 Python：
    echo 1. 前往 https://www.python.org/downloads/
    echo 2. 下載 Python 3.10 或更新版本
    echo 3. 安裝時記得勾選「Add Python to PATH」
    echo 4. 安裝完成後，重新執行此程式
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
for /f "tokens=*" %%i in ('where python') do set PYTHON_PATH=%%i
echo ✅ 找到 Python: %PYTHON_VERSION%
echo    位置: %PYTHON_PATH%
echo.

REM 步驟 2: 安裝依賴套件
echo 步驟 2/4: 安裝必要套件...
echo 這可能需要幾分鐘，請稍候...

REM 先切換到 mcp-server 目錄
pushd mcp-server
if %errorlevel% neq 0 (
    echo ❌ 無法進入 mcp-server 目錄
    pause
    exit /b 1
)

python -m pip install --quiet mcp httpx pydantic

if %errorlevel% neq 0 (
    echo ❌ 套件安裝失敗
    echo 請檢查網路連線，或手動執行：
    echo cd mcp-server ^&^& pip install mcp httpx pydantic
    popd
    pause
    exit /b 1
)

echo ✅ 套件安裝成功
popd
echo.

REM 步驟 3: 創建 Claude Desktop 設定檔
echo 步驟 3/4: 設定 Claude Desktop...

set CLAUDE_CONFIG_DIR=%APPDATA%\Claude
set CLAUDE_CONFIG_FILE=%CLAUDE_CONFIG_DIR%\claude_desktop_config.json

REM 取得當前目錄的完整路徑
for %%I in (.) do set PROJECT_PATH=%%~fI

REM 將反斜線轉換為正斜線（JSON 需要）
set PROJECT_PATH_JSON=%PROJECT_PATH:\=/%

REM 將 Python 路徑的反斜線轉換為正斜線
set PYTHON_PATH_JSON=%PYTHON_PATH:\=/%

REM 創建目錄（如果不存在）
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"

REM 創建設定檔（使用正斜線避免 JSON 跳脫問題）
(
echo {
echo   "mcpServers": {
echo     "sbir-data": {
echo       "command": "%PYTHON_PATH_JSON%",
echo       "args": [
echo         "%PROJECT_PATH_JSON%/mcp-server/server.py"
echo       ]
echo     }
echo   }
echo }
) > "%CLAUDE_CONFIG_FILE%"

if %errorlevel% neq 0 (
    echo ❌ 設定檔創建失敗
    pause
    exit /b 1
)

echo ✅ Claude Desktop 設定完成
echo    設定檔位置: %CLAUDE_CONFIG_FILE%
echo.

REM 步驟 4: 完成
echo 步驟 4/4: 完成安裝
echo.
echo ==========================================
echo    🎉 安裝成功！
echo ==========================================
echo.
echo 下一步：
echo 1. 重新啟動 Claude Desktop
echo    - 完全關閉 Claude（右上角 X）
echo    - 重新開啟 Claude
echo.
echo 2. 測試是否成功：
echo    在 Claude 中輸入：
echo    「請使用 MCP Server 查詢機械產業的市場數據」
echo.
echo 3. 如果看到 Claude 呼叫 MCP Server，就代表成功了！
echo.
echo 4. 查看使用指南：
echo    - FIRST_TIME_USE.md（第一次使用）
echo    - HOW_TO_USE.md（完整使用說明）
echo.
echo ==========================================
pause
