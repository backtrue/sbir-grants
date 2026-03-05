#!/bin/bash

# SBIR Skill 自動安裝腳本（Mac 版）- v4 穩定版
# 修復：依賴完整性、驗證步驟、雙擊提示
# 重要：不會覆蓋您現有的 Claude Desktop 設定

set -e  # 遇到錯誤立即停止

echo "=========================================="
echo "   SBIR Skill 自動安裝程式 (Mac)"
echo "=========================================="
echo ""

# 取得腳本所在目錄（處理路徑中的空格）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || exit 1

echo "📁 工作目錄: $SCRIPT_DIR"
echo ""

# 檢查是否在正確的目錄
if [ ! -f "mcp-server/server.py" ]; then
    echo "❌ 錯誤：找不到 mcp-server/server.py"
    echo ""
    echo "請確認："
    echo "1. 您已經下載完整的專案"
    echo "2. 專案資料夾名稱是 sbir-grants"
    echo "3. 資料夾內有 mcp-server 子資料夾"
    echo ""
    echo "目前位置: $SCRIPT_DIR"
    exit 1
fi

echo "✅ 找到專案資料夾"
echo ""

# ============================================
# 步驟 1/5: 檢查 Python
# ============================================
echo "步驟 1/5: 檢查 Python..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ 找到 Python: $PYTHON_VERSION"
else
    echo "❌ 找不到 Python"
    echo ""
    echo "請先安裝 Python："
    echo "  方法 1 (推薦): brew install python3"
    echo "  方法 2: 前往 https://www.python.org/downloads/"
    echo "  下載 Python 3.10 或更新版本"
    echo ""
    echo "安裝完成後，重新執行："
    echo "  bash \"$SCRIPT_DIR/install-mac.sh\""
    exit 1
fi
echo ""

# ============================================
# 步驟 2/5: 建立虛擬環境
# ============================================
echo "步驟 2/5: 建立虛擬環境..."

if [ ! -d "venv" ]; then
    echo "正在建立虛擬環境..."
    if ! python3 -m venv venv; then
        echo "❌ 虛擬環境建立失敗"
        echo "請嘗試: python3 -m pip install --user virtualenv"
        exit 1
    fi
else
    echo "ℹ️  虛擬環境已存在，跳過建立"
fi
echo "✅ 虛擬環境就緒"
echo ""

# ============================================
# 步驟 3/5: 安裝依賴套件（使用 requirements.txt）
# ============================================
echo "步驟 3/5: 安裝依賴套件..."
echo "⏳ 首次安裝可能需要 3-5 分鐘（需下載 AI 模型），請耐心等候..."
echo ""

# 升級 pip
if ! "$SCRIPT_DIR/venv/bin/python" -m pip install --upgrade pip --quiet 2>/dev/null; then
    echo "⚠️  pip 升級失敗，繼續使用現有版本..."
fi

# 使用 requirements.txt 安裝所有套件
if ! "$SCRIPT_DIR/venv/bin/python" -m pip install -r "$SCRIPT_DIR/mcp-server/requirements.txt" --quiet; then
    echo "❌ 套件安裝失敗"
    echo ""
    echo "常見原因："
    echo "  1. 網路連線問題 → 請檢查網路"
    echo "  2. 磁碟空間不足 → 請確保有 1.5 GB 可用空間"
    echo "  3. Python 版本太舊 → 請使用 Python 3.10+"
    exit 1
fi

echo "✅ 所有依賴套件安裝成功"
echo ""

# ============================================
# 步驟 4/5: 設定 Claude Desktop（安全合併，不覆蓋）
# ============================================
echo "步驟 4/5: 設定 Claude Desktop..."

CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
PYTHON_EXE="$SCRIPT_DIR/venv/bin/python"
SERVER_SCRIPT="$SCRIPT_DIR/mcp-server/server.py"

# 創建目錄（如果不存在）
mkdir -p "$CLAUDE_CONFIG_DIR"

# 如果設定檔已存在，先備份
if [ -f "$CLAUDE_CONFIG_FILE" ]; then
    cp "$CLAUDE_CONFIG_FILE" "$CLAUDE_CONFIG_FILE.bak"
    echo "ℹ️  已備份現有設定至 claude_desktop_config.json.bak"
fi

# 使用 Python 進行 JSON 合併（不依賴 jq）
echo "正在更新設定檔..."

"$SCRIPT_DIR/venv/bin/python" <<PYEOF
import json
import os
import sys

config_file = '''$CLAUDE_CONFIG_FILE'''
python_exe = '''$PYTHON_EXE'''
server_script = '''$SERVER_SCRIPT'''

try:
    # 讀取現有設定（如果存在）
    config = {}
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    config = json.loads(content)
        except (json.JSONDecodeError, IOError) as e:
            print(f"警告：無法讀取現有設定，將創建新設定：{e}")
            config = {}

    # 確保 mcpServers 存在
    if 'mcpServers' not in config or config['mcpServers'] is None:
        config['mcpServers'] = {}

    # 添加或更新 sbir-ai-copilot (統一入口)
    config['mcpServers']['sbir-ai-copilot'] = {
        'command': python_exe,
        'args': [server_script]
    }

    # 寫入設定檔
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print("設定檔已更新")
    sys.exit(0)

except Exception as e:
    print(f"錯誤：{e}")
    sys.exit(1)
PYEOF

if [ $? -eq 0 ]; then
    echo "✅ Claude Desktop 設定已安全更新"
    echo "   設定檔位置: $CLAUDE_CONFIG_FILE"
    echo "   已保留其他 MCP Server 設定"
else
    echo "❌ 設定檔更新失敗"
    exit 1
fi
echo ""

# ============================================
# 步驟 5/5: 安裝後自動驗證
# ============================================
echo "步驟 5/5: 驗證安裝..."

VERIFY_RESULT=$("$SCRIPT_DIR/venv/bin/python" -c "
import sys
errors = []
try:
    import mcp
except ImportError:
    errors.append('mcp')
try:
    import pydantic
except ImportError:
    errors.append('pydantic')
try:
    import httpx
except ImportError:
    errors.append('httpx')
try:
    import yaml
except ImportError:
    errors.append('pyyaml')
try:
    import docx
except ImportError:
    errors.append('python-docx')

if errors:
    print('FAIL:' + ','.join(errors))
    sys.exit(1)
else:
    print('OK')
    sys.exit(0)
" 2>&1)

if [ $? -eq 0 ]; then
    echo "✅ 核心模組驗證通過"
else
    echo "⚠️  部分模組驗證失敗: $VERIFY_RESULT"
    echo "   Server 仍可運作，但部分功能可能受限"
fi

# 驗證 chromadb（可選，不影響核心功能）
CHROMA_RESULT=$("$SCRIPT_DIR/venv/bin/python" -c "
try:
    import chromadb
    print('OK')
except ImportError:
    print('SKIP')
" 2>&1)

if [ "$CHROMA_RESULT" = "OK" ]; then
    echo "✅ AI 語意搜尋模組驗證通過"
else
    echo "ℹ️  AI 語意搜尋模組未安裝（不影響核心功能）"
    echo "   如需啟用，請執行："
    echo "   $SCRIPT_DIR/venv/bin/python -m pip install chromadb sentence-transformers"
fi
echo ""

# ============================================
# 完成
# ============================================
echo "=========================================="
echo "   🎉 安裝成功！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 重新啟動 Claude Desktop"
echo "   - 完全關閉 Claude（Command + Q）"
echo "   - 重新開啟 Claude"
echo ""
echo "2. 測試是否成功："
echo "   在 Claude 中輸入："
echo "   「請使用 MCP Server 查詢機械產業的市場數據」"
echo ""
echo "3. 如果看到 Claude 呼叫 MCP Server，就代表成功了！"
echo ""
echo "4. 查看使用指南："
echo "   - FIRST_TIME_USE.md（第一次使用）"
echo "   - HOW_TO_USE.md（完整使用說明）"
echo ""
echo "注意事項："
echo "   - 已使用虛擬環境隔離依賴套件"
echo "   - 已保留您原有的 Claude Desktop 設定"
echo "   - 備份檔案：claude_desktop_config.json.bak"
echo ""
echo "💡 如果從 Finder 雙擊本檔案會用文字編輯器開啟，"
echo "   請改用終端機執行："
echo "   bash \"$SCRIPT_DIR/install-mac.sh\""
echo ""
echo "=========================================="
