# ✅ 如何確認安裝成功

> 安裝完成後，如何確認 SBIR Skill 已經正常運作？

---

## 🔍 方法 1：檢查 MCP Server 狀態（最簡單）

### 步驟

1. **打開 Claude Desktop**

2. **點擊左下角的「📎」圖示**（迴紋針）

3. **點擊「Connectors」**

4. **看是否有 `sbir-data`**
   - ✅ 如果有，且右邊的開關是**藍色**（已啟用）→ **成功！**
   - ❌ 如果沒有 → 請重新執行安裝程式

### 截圖範例

應該會看到：
```
Connectors
  s  sbir-data  [藍色開關]
     Manage connectors
```

---

## 🗣️ 方法 2：問 Claude 測試問題

### 測試 1：知識庫搜尋

**問 Claude**：
```
SBIR Phase 1 的補助金額上限是多少？
```

**預期回答**：
- ✅ 「最高 100 萬元，全額補助」→ **成功！**
- ❌ 「我不確定」或很模糊的回答 → MCP Server 可能沒啟用

---

### 測試 2：市場數據查詢

**問 Claude**：
```
請使用 MCP Server 查詢機械產業的市場數據
```

**預期結果**：
- ✅ 會跳出「Allow once」或「Always allow」的提示 → **成功！**
- ❌ 沒有任何提示 → MCP Server 沒啟用

---

### 測試 3：方法論查詢

**問 Claude**：
```
我要寫創新構想，該怎麼寫？
```

**預期回答**：
- ✅ 提供詳細的架構（核心問題、解決方案、可行性、預期效益）→ **成功！**
- ❌ 只給一般性建議 → 知識庫可能沒有被使用

---

## 🆘 如果沒有啟用

### 問題 1：Connectors 中沒有 sbir-data

**解決方法**：
1. 確認設定檔是否正確：
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. 重新執行安裝程式：
   - Mac: 雙擊 `install-mac.sh`
   - Windows: 雙擊 `install-windows.bat`

3. 完全重啟 Claude Desktop（Command+Q 或關閉視窗）

---

### 問題 2：sbir-data 存在但開關是灰色

**解決方法**：
1. 點擊開關，啟用它
2. 重新載入對話

---

### 問題 3：Claude 沒有使用知識庫

**可能原因**：
- 問題太模糊

**解決方法**：
問得更具體一點，例如：
```
請搜尋 SBIR 知識庫，找到關於創新構想的方法論
```

---

## ✅ 確認成功的標誌

### 1. Connectors 中有 sbir-data（藍色開關）

### 2. Claude 的回答很詳細
- 引用具體的方法論
- 提供結構化的建議
- 包含檢核清單

### 3. 可以查詢市場數據
- 會跳出工具使用提示
- 提供數據來源

---

## 🎉 安裝成功！

如果以上測試都通過，恭喜您！SBIR Skill 已經成功安裝並運作了！

**下一步**：
- 👉 閱讀 [`HOW_TO_USE.md`](HOW_TO_USE.md) 學習如何使用
- 👉 或直接開始問 Claude 問題！

---

<div align="center">

**有問題？** 查看 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)

</div>
