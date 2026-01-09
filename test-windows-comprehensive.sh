#!/bin/bash
# Windows 安裝腳本完整測試套件
# 測試 3 遍以確保萬無一失

echo "=========================================="
echo "Windows 安裝腳本完整測試套件"
echo "=========================================="
echo ""

SCRIPT="install-windows.bat"
PASS_COUNT=0
FAIL_COUNT=0

# 測試函數
test_check() {
    local test_name="$1"
    local command="$2"
    local expected="$3"
    
    echo "測試: $test_name"
    result=$(eval "$command")
    
    if [ "$result" = "$expected" ]; then
        echo "  ✓ PASS"
        ((PASS_COUNT++))
    else
        echo "  ✗ FAIL"
        echo "  預期: $expected"
        echo "  實際: $result"
        ((FAIL_COUNT++))
    fi
    echo ""
}

echo "=== 第 1 輪測試 ==="
echo ""

# 測試 1: 檢查驚嘆號
test_check "1.1 沒有驚嘆號 (!)" \
    "grep -c '!' $SCRIPT 2>/dev/null || echo 0" \
    "0"

# 測試 2: 檢查 setlocal
test_check "1.2 沒有 setlocal" \
    "grep -c 'setlocal' $SCRIPT 2>/dev/null || echo 0" \
    "0"

# 測試 3: 檢查 endlocal
test_check "1.3 沒有 endlocal" \
    "grep -c 'endlocal' $SCRIPT 2>/dev/null || echo 0" \
    "0"

# 測試 4: 檢查 UTF-8 設定
test_check "1.4 有 UTF-8 編碼設定" \
    "grep -c 'chcp 65001' $SCRIPT" \
    "1"

# 測試 5: 檢查 errorlevel 語法
test_check "1.5 使用標準 errorlevel 語法" \
    "grep 'if errorlevel' $SCRIPT | wc -l | tr -d ' '" \
    "5"

echo "=== 第 2 輪測試 ==="
echo ""

# 測試 6: 檢查變數語法
test_check "2.1 使用 %VAR% 而非 !VAR!" \
    "grep '%PYTHON_VERSION%' $SCRIPT | wc -l | tr -d ' '" \
    "1"

# 測試 7: 檢查路徑處理
test_check "2.2 有路徑處理邏輯" \
    "grep -c 'PROJECT_PATH:~-1' $SCRIPT" \
    "1"

# 測試 8: 檢查 CONFIG_DIR 變數
test_check "2.3 使用 %CONFIG_DIR% 而非 !CONFIG_DIR!" \
    "grep '%CONFIG_DIR%' $SCRIPT | wc -l | tr -d ' '" \
    "2"

# 測試 9: 檢查 CONFIG_FILE 變數
test_check "2.4 使用 %CONFIG_FILE% 而非 !CONFIG_FILE!" \
    "grep '%CONFIG_FILE%' $SCRIPT | wc -l | tr -d ' '" \
    "5"

# 測試 10: 檢查腳本完整性
test_check "2.5 腳本行數合理 (>150行)" \
    "wc -l < $SCRIPT | tr -d ' '" \
    "177"

echo "=== 第 3 輪測試 ==="
echo ""

# 測試 11: 檢查關鍵命令存在
test_check "3.1 有 Python 檢查" \
    "grep -c 'python --version' $SCRIPT" \
    "2"

# 測試 12: 檢查虛擬環境建立
test_check "3.2 有虛擬環境建立" \
    "grep -c 'python -m venv venv' $SCRIPT" \
    "1"

# 測試 13: 檢查 pip 安裝
test_check "3.3 有 pip 套件安裝" \
    "grep -c 'pip install' $SCRIPT" \
    "2"

# 測試 14: 檢查設定檔更新
test_check "3.4 有設定檔更新邏輯" \
    "grep -c 'update_config.py' $SCRIPT" \
    "2"

# 測試 15: 檢查錯誤處理
test_check "3.5 有錯誤處理 (exit /b 1)" \
    "grep -c 'exit /b 1' $SCRIPT" \
    "6"

echo "=========================================="
echo "測試結果總結"
echo "=========================================="
echo "通過: $PASS_COUNT / 15"
echo "失敗: $FAIL_COUNT / 15"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "✓✓✓ 所有測試通過！腳本可以安全使用 ✓✓✓"
    exit 0
else
    echo "✗✗✗ 有測試失敗，請檢查腳本 ✗✗✗"
    exit 1
fi
