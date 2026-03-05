# 📦 安裝指南（超級簡單版）

> 這份指南是寫給「完全不懂電腦」的人看的。只要照著做，一定能成功！

---

## 🎯 開始之前

**您需要**：
- ✅ 一台電腦（Mac 或 Windows）
- ✅ 已經安裝 Claude Desktop（如果還沒有，請先[下載安裝](https://claude.ai/download)）
- ✅ 網路連線

**不需要**：
- ❌ 不需要懂程式
- ❌ 不需要懂終端機
- ❌ 不需要任何技術背景

---

## � 步驟 1：下載專案

### 方法 A：使用瀏覽器下載（推薦給新手）

1. **打開網頁**  
   前往：https://github.com/backtrue/sbir-grants

2. **點擊綠色按鈕**  
   找到頁面上的綠色按鈕，上面寫著「Code」，點擊它

3. **選擇下載 ZIP**  
   在彈出的選單中，點擊「Download ZIP」

4. **解壓縮檔案**  
   - 下載完成後，找到下載的檔案（通常在「下載」資料夾）
   - 雙擊 ZIP 檔案，會自動解壓縮
   - 您會看到一個名為「sbir-grants-main」的資料夾

5. **移動到合適的位置**  
   - 把這個資料夾移動到「文件」資料夾
   - 重新命名為「sbir-grants」（去掉 -main）

✅ **完成！** 您現在有一個資料夾在：
- Mac: `/Users/您的名字/Documents/sbir-grants`
- Windows: `C:\Users\您的名字\Documents\sbir-grants`

---

## 🚀 步驟 2：自動安裝（最簡單的方法）

### Mac 用戶

> ⚠️ 首次安裝需要約 **1.5 GB** 磁碟空間（AI 語意搜尋模型）

1. **打開終端機**  
   在「應用程式」→「工具程式」中找到「終端機」，雙擊打開

2. **執行安裝指令**  
   複製貼上以下指令並按 Enter：
   ```
   cd ~/Documents/sbir-grants && bash install-mac.sh
   ```
   > 如果您的資料夾不在 Documents，請改成正確路徑

3. **等待安裝完成**  
   - 程式會自動安裝所有需要的東西
   - 看到「🎉 安裝成功！」及「核心模組驗證通過」就代表完成了
   - 可以關閉終端機視窗

### Windows 用戶

1. **打開資料夾**  
   找到剛才下載的「sbir-grants」資料夾，雙擊打開

2. **找到安裝程式**  
   在資料夾中找到一個檔案叫「install-windows.bat」

3. **雙擊執行**  
   - 直接雙擊「install-windows.bat」
   - 如果出現安全警告，點擊「仍要執行」或「更多資訊」→「仍要執行」

4. **等待安裝完成**  
   - 會跳出一個黑色視窗
   - 程式會自動安裝所有需要的東西
   - 看到「🎉 安裝成功！」就代表完成了
   - 按任意鍵關閉視窗

---

## ⚠️ 如果自動安裝失敗

### 問題 1：找不到 Python

**症狀**：安裝程式說「找不到 Python」

**解決方法**：

1. **下載 Python**  
   前往：https://www.python.org/downloads/

2. **安裝 Python**  
   - 下載完成後，雙擊安裝檔
   - **重要**：安裝時勾選「Add Python to PATH」（Windows）
   - 一直點「下一步」直到安裝完成

3. **重新執行安裝程式**  
   回到步驟 2，重新執行 install-mac.sh 或 install-windows.bat

### 問題 2：Mac 雙擊 .sh 檔案會用文字編輯器打開

**解決方法**：
請直接使用終端機執行（這是正確做法）：
1. 打開「終端機」（在「應用程式」→「工具程式」中）
2. 複製貼上以下指令：
   ```
   cd ~/Documents/sbir-grants && bash install-mac.sh
   ```
3. 按 Enter 鍵執行

### 問題 3：Windows 說「Windows 已保護您的電腦」

**解決方法**：
1. 點擊「更多資訊」
2. 點擊「仍要執行」

---

## ✅ 步驟 3：重啟 Claude Desktop

1. **完全關閉 Claude**  
   - Mac: 按 Command + Q
   - Windows: 點擊右上角的 X

2. **重新開啟 Claude**  
   從應用程式列表中重新打開 Claude Desktop

---

## � 步驟 4：測試是否成功

1. **在 Claude 中輸入**：
   ```
   請使用 MCP Server 查詢機械產業的市場數據
   ```

2. **看結果**：
   - ✅ 如果 Claude 開始查詢，並且沒有紅色錯誤訊息 → **成功！**
   - ❌ 如果出現「Server disconnected」錯誤 → 請看下方疑難排解

---

## 🆘 疑難排解

### 問題：Claude 說「Server disconnected」

**可能原因 1：沒有重啟 Claude**
- 解決：完全關閉 Claude（Command+Q 或關閉視窗），然後重新開啟

**可能原因 2：Python 路徑不對**
- 解決：重新執行安裝程式

**可能原因 3：設定檔位置錯誤**
- 解決：
  1. 找到設定檔：
     - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
     - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  2. 刪除這個檔案
  3. 重新執行安裝程式

### 還是不行？

**聯絡我們**：
- 📧 Email: [您的聯絡方式]
- 📞 SBIR 服務專線：0800-888-968

---

## � 安裝完成後

**恭喜！您已經成功安裝 SBIR Skill！**

**下一步**：
1. 閱讀 [`GETTING_STARTED.md`](GETTING_STARTED.md) 學習如何使用
2. 或直接開始問 Claude 關於 SBIR 的問題！

**常見問題**：
- 「我可以問 Claude 什麼問題？」→ 看 [`GETTING_STARTED.md`](GETTING_STARTED.md)
- 「如何寫 SBIR 計畫書？」→ 看 [`GETTING_STARTED.md`](GETTING_STARTED.md)
- 「遇到問題怎麼辦？」→ 看 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)

---

<div align="center">

**🎉 開始使用 SBIR Skill，讓 AI 協助您申請 SBIR 補助！**

</div>
