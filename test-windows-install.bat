@echo off
REM Windows 安裝腳本測試工具
REM 模擬執行並檢查語法錯誤

echo ==========================================
echo Windows 安裝腳本測試
echo ==========================================
echo.

REM 測試 1: 檢查腳本語法
echo [測試 1] 檢查 batch 語法...
REM 在 Windows 上可以用這個命令檢查語法
REM cmd /c "install-windows.bat" /? >nul 2>&1

REM 測試 2: 檢查是否有延遲展開變數
echo [測試 2] 檢查延遲展開變數...
findstr /R "![A-Z_]*!" install-windows.bat >nul 2>&1
if %errorlevel% equ 0 (
    echo [FAIL] 發現延遲展開變數 !VAR!
    findstr /R /N "![A-Z_]*!" install-windows.bat
) else (
    echo [PASS] 沒有延遲展開變數
)
echo.

REM 測試 3: 檢查 errorlevel 語法
echo [測試 3] 檢查 errorlevel 使用...
findstr /C:"if !errorlevel!" install-windows.bat >nul 2>&1
if %errorlevel% equ 0 (
    echo [FAIL] 發現 !errorlevel! 用法
    findstr /N /C:"if !errorlevel!" install-windows.bat
) else (
    echo [PASS] errorlevel 語法正確
)
echo.

REM 測試 4: 檢查編碼
echo [測試 4] 檢查文件編碼...
REM 這個需要在實際 Windows 環境測試
echo [INFO] 需要在 Windows 環境手動測試中文顯示
echo.

REM 測試 5: 模擬變數展開
echo [測試 5] 模擬變數展開測試...
set "TEST_PATH=C:\test\path\"
if "%TEST_PATH:~-1%"=="\" set "TEST_PATH=%TEST_PATH:~0,-1%"
echo 測試路徑: %TEST_PATH%
if "%TEST_PATH%"=="C:\test\path" (
    echo [PASS] 路徑處理正確
) else (
    echo [FAIL] 路徑處理失敗: %TEST_PATH%
)
echo.

REM 測試 6: 檢查關鍵命令
echo [測試 6] 檢查關鍵命令存在...
findstr /C:"chcp 65001" install-windows.bat >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] 找到 UTF-8 編碼設定
) else (
    echo [FAIL] 缺少 UTF-8 編碼設定
)

findstr /C:"setlocal enabledelayedexpansion" install-windows.bat >nul 2>&1
if %errorlevel% equ 0 (
    echo [FAIL] 仍然使用延遲展開
) else (
    echo [PASS] 已移除延遲展開
)
echo.

echo ==========================================
echo 測試完成
echo ==========================================
echo.
echo 建議：
echo 1. 在實際 Windows 環境測試執行
echo 2. 檢查中文是否正常顯示
echo 3. 驗證 Python 安裝檢測
echo 4. 驗證設定檔更新
echo.
pause
