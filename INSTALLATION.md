# 📦 安裝指南

> 如何安裝和配置 SBIR Skill，讓 Claude 成為您的 SBIR 申請助手

---

## 📋 系統需求

### 必要條件

- ✅ **Claude Desktop**（最新版本）
- ✅ **macOS** / Windows / Linux
- ✅ **Python 3.10+**（用於 MCP Server）
- ✅ **uv** 或 **pip**（Python 套件管理工具）

### 可選條件

- 🔧 **Git**（如果要從 GitHub clone）

---

## 🚀 安裝步驟

### 方法 A：從 GitHub 安裝（推薦）

#### Step 1: Clone 專案

```bash
cd ~/Documents
git clone https://github.com/backtrue/sbir-grants.git
cd sbir-grants
```

#### Step 2: 安裝 MCP Server 依賴

```bash
cd mcp-server

# 使用 uv（推薦）
uv pip install -e .

# 或使用 pip
pip install -e .
```

#### Step 3: 配置 Claude Desktop

編輯 Claude Desktop 設定檔：

**macOS**: 
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows**:
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux**:
```
~/.config/Claude/claude_desktop_config.json
```

**加入以下設定**（請修改路徑為您的實際路徑）：

```json
{
  "mcpServers": {
    "sbir-data": {
      "command": "uv",
      "args": [
        "--directory",
        "/Users/YOUR_USERNAME/Documents/sbir-grants/mcp-server",
        "run",
        "server.py"
      ]
    }
  }
}
```

⚠️ **重要**：請將 `/Users/YOUR_USERNAME/Documents/sbir-grants` 改成您的實際路徑！

#### Step 4: 重啟 Claude Desktop

完全關閉並重新開啟 Claude Desktop。

---

### 方法 B：直接下載（不使用 Git）

#### Step 1: 下載專案

1. 前往 https://github.com/backtrue/sbir-grants
2. 點擊綠色的 "Code" 按鈕
3. 選擇 "Download ZIP"
4. 解壓縮到您想要的位置（例如 `~/Documents/sbir-grants`）

#### Step 2-4: 同方法 A

---

## ✅ 驗證安裝

### 檢查 MCP Server 是否正常運作

在 Claude Desktop 中輸入：

```
請使用 MCP Server 查詢機械產業的市場數據
```

**預期結果**：
- Claude 會呼叫 MCP Server
- 回傳經濟部統計處的查詢建議
- 或使用 search_web 查詢相關數據

### 檢查 Skill 知識庫是否可用

在 Claude Desktop 中輸入：

```
SBIR Phase 1 和 Phase 2 有什麼差別？
```

**預期結果**：
- Claude 會參考 `SKILL.md` 回答
- 提供詳細的階段比較

---

## 🎯 開始使用

### 第一次使用：快速測試

#### 測試 1: 資格確認

```
我的公司實收資本額 5000 萬，員工 50 人，可以申請 SBIR 嗎？
```

**Claude 會**：
- 檢查資格條件
- 告訴您是否符合
- 建議下一步

#### 測試 2: 構想驗證

```
我想做一個 AI 客服系統給中小企業用，這個構想適合申請 SBIR 嗎？
```

**Claude 會**：
- 評估創新性
- 建議使用構想驗證指南
- 提供改進建議

#### 測試 3: 市場數據查詢

```
請幫我找機械產業的市場數據，我要寫問題陳述
```

**Claude 會**：
- 呼叫 MCP Server
- 使用 search_web 查詢 IEK、MIC
- 整合多個來源的數據

---

## 📖 使用情境與範例

### 情境 1: 我想知道能不能申請

**您問**：
```
我想申請 SBIR，但不知道從何開始
```

**Claude 會**：
- 引導您使用 10 分鐘資格檢查
- 提供 `quick_start/10min_eligibility_check.md` 連結
- 解釋基本條件

---

### 情境 2: 我要寫計畫書的某個章節

**您問**：
```
我要寫創新構想這個章節，該怎麼寫？
```

**Claude 會**：
- 提供 `methodology_innovation.md` 方法論
- 說明創新點拆解框架
- 提供範例和檢核清單

---

### 情境 3: 我需要市場數據

**您問**：
```
我要寫資通訊產業的市場分析，需要 TAM/SAM/SOM 數據
```

**Claude 會**：
- 使用 MCP Server 查詢經濟部數據
- 使用 search_web 查詢資策會 MIC
- 提供計算方法和數據來源
- 參考 `methodology_market_analysis.md`

---

### 情境 4: 我寫完了，要檢查

**您問**：
```
我寫完 Phase 1 計畫書了，幫我檢查是否完整
```

**Claude 會**：
- 使用 `writing_checklist_phase1.md` 檢核
- 逐項確認是否完整
- 指出缺少的部分

---

### 情境 5: 我遇到具體問題

**您問**：
```
人事費可以超過 60% 嗎？
```

**Claude 會**：
- 查詢 `faq/faq_budget.md`
- 回答：不可以，≤ 60%
- 提供解決方案

---

## 🎨 進階使用

### 完整工作流程

```
1. 資格確認
   「幫我確認 SBIR 申請資格」
   
2. 構想驗證
   「我想做 [您的構想]，幫我驗證可行性」
   
3. 逐章撰寫
   「我要寫問題陳述，請提供方法論」
   「我要寫創新構想，請提供方法論」
   ...
   
4. 數據查詢
   「幫我找 [產業] 的市場數據」
   
5. 品質檢查
   「幫我檢查計畫書是否完整」
   
6. 送件準備
   「送件前需要準備什麼文件？」
```

### 自訂提示詞

您也可以更具體地要求：

```
請使用 methodology_innovation.md 的框架，
幫我分析我的創新點，並與競品比較
```

---

## 🔧 疑難排解

### 問題 1: MCP Server 無法啟動

**症狀**：Claude 說找不到 MCP Server

**解決方案**：
1. 檢查 `claude_desktop_config.json` 路徑是否正確
2. 確認已安裝依賴：`cd mcp-server && uv pip install -e .`
3. 重啟 Claude Desktop

### 問題 2: Claude 沒有使用知識庫

**症狀**：Claude 的回答很一般，沒有參考專案文件

**解決方案**：
- 明確要求：「請參考 SBIR Skill 的知識庫回答」
- 或直接指定文件：「請參考 methodology_innovation.md」

### 問題 3: 找不到某個文件

**症狀**：Claude 說找不到某個方法論或 FAQ

**解決方案**：
- 查看 `README.md` 的專案結構
- 使用正確的檔案路徑
- 或直接問：「有哪些方法論可用？」

---

## 📚 下一步

### 安裝完成後

1. **閱讀** [`GETTING_STARTED.md`](GETTING_STARTED.md) - 新手使用指南
2. **瀏覽** [`README.md`](README.md) - 完整專案說明
3. **開始使用** - 問 Claude 您的第一個 SBIR 問題！

### 推薦閱讀順序

```
1. INSTALLATION.md（本文件）← 您在這裡
2. GETTING_STARTED.md（如何使用）
3. SKILL.md（了解 SBIR）
4. README.md（完整功能）
```

---

## 🆘 需要協助？

### 安裝問題

- 📖 查看 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- 📞 SBIR 服務專線：0800-888-968

### 使用問題

- ❓ 查看 [`FAQ.md`](FAQ.md)（81 個常見問題）
- 📚 查看 [`GETTING_STARTED.md`](GETTING_STARTED.md)

---

<div align="center">

**🎉 安裝完成！開始使用 SBIR Skill 吧！**

</div>
