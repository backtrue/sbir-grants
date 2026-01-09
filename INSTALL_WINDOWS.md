# Windows 安裝指南

## 系統需求

- Windows 10/11
- Python 3.8 或以上
- Claude Desktop for Windows

---

## 安裝步驟

### 1. 安裝 Python

1. 前往 [Python 官網](https://www.python.org/downloads/)
2. 下載並安裝 Python（記得勾選 "Add Python to PATH"）
3. 驗證安裝：
   ```cmd
   python --version
   ```

### 2. 下載專案

```cmd
git clone https://github.com/backtrue/sbir-grants.git
cd sbir-grants
```

### 3. 建立虛擬環境

```cmd
python -m venv venv
venv\Scripts\activate
```

### 4. 安裝依賴

```cmd
pip install -r mcp-server\requirements.txt
```

### 5. 建立向量索引

```cmd
python mcp-server\build_index.py
```

按 `y` 確認建立索引（首次執行需下載約 500MB 的模型）

### 6. 設定 Claude Desktop

1. 找到 Claude Desktop 的設定檔：
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. 編輯設定檔，加入以下內容：

```json
{
  "mcpServers": {
    "sbir-grants": {
      "command": "python",
      "args": [
        "C:\\path\\to\\sbir-grants\\mcp-server\\server.py"
      ],
      "cwd": "C:\\path\\to\\sbir-grants"
    }
  }
}
```

**重要**：將 `C:\\path\\to\\sbir-grants` 替換為您的實際路徑（使用雙反斜線 `\\`）

### 7. 重啟 Claude Desktop

關閉並重新開啟 Claude Desktop

---

## 驗證安裝

在 Claude Desktop 中輸入：
```
請搜尋 SBIR 申請資格
```

如果看到搜尋結果，表示安裝成功！

---

## 常見問題

### Q: 找不到 Python

**解決方案**：
1. 重新安裝 Python，確保勾選 "Add Python to PATH"
2. 或手動將 Python 加入環境變數

### Q: pip 安裝失敗

**解決方案**：
```cmd
python -m pip install --upgrade pip
pip install -r mcp-server\requirements.txt
```

### Q: Claude Desktop 找不到 MCP Server

**解決方案**：
1. 檢查設定檔路徑是否正確（使用雙反斜線 `\\`）
2. 確認 Python 路徑正確
3. 查看 Claude Desktop 的錯誤日誌

### Q: 向量索引建立失敗

**解決方案**：
```cmd
# 確保有足夠的磁碟空間（至少 1GB）
# 重新執行
python mcp-server\build_index.py
```

---

## 手動測試

如果遇到問題，可以手動測試 MCP Server：

```cmd
cd sbir-grants
venv\Scripts\activate
python mcp-server\server.py
```

應該會看到 MCP Server 啟動的訊息。

---

## 需要協助？

請到 GitHub Issues 回報問題：
https://github.com/backtrue/sbir-grants/issues
