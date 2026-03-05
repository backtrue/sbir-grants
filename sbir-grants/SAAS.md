# 🌐 SBIR SaaS — 網頁平台技術文件

> **SBIR SaaS** 是 SBIR Skill（Claude Desktop MCP 工具）的雲端延伸版本，提供完整的 Web UI 讓使用者無需安裝任何本地軟體即可使用所有 SBIR 輔助功能。
>
> 🔗 **正式上線網址**：[https://sbir.thinkwithblack.com](https://sbir.thinkwithblack.com)

---

## 🏗️ 系統架構

```
┌─────────────────────────────────────────────────────┐
│             使用者瀏覽器 (React + Vite)              │
│          https://sbir.thinkwithblack.com            │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS API
┌────────────────────────▼────────────────────────────┐
│        Cloudflare Workers — Hono.js Backend         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  auth.ts │  │projects.t│  │     ai.ts (AI 生成) │ │
│  │  JWT/PAT │  │ CRUD 專案│  │  流式輸出 / 9 章節 │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │storage.ts│  │ enrich.ts│  │    quality.ts       │ │
│  │ 文件上傳 │  │ 市場數據 │  │  6 維度品質評分     │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │extract.ts│  │regen..ts │  │     queue.ts        │ │
│  │ 問題萃取 │  │ 段落重生 │  │  非同步文件處理     │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
└──────┬──────────┬──────────┬───────────┬────────────┘
       │          │          │           │
   ┌───▼──┐ ┌───▼──┐ ┌─────▼──┐ ┌──────▼──┐
   │  D1  │ │  R2  │ │   AI   │ │Vectorize│
   │（DB）│ │（物件│ │（LLM） │ │（向量庫）│
   └──────┘ └──────┘ └────────┘ └─────────┘
                        ↑
               Cloudflare Queues
               （文件非同步處理）
```

---

## 🚀 核心功能

### 1. 📂 專案管理

- **多專案工作區**：每位用戶可建立多個 SBIR 申請專案（Phase 1 / Phase 2 / Phase 2+）
- **完整 CRUD**：建立、讀取、更新、刪除專案
- **即時進度**：每個章節顯示生成狀態（`pending / generating / completed / failed`）

### 2. 🤖 AI 章節生成（ai.ts）

基於 Cloudflare AI（Claude / Gemini）**流式生成** 9 大計畫書章節：

| # | 章節名稱 | AI 策略 |
|---|---------|---------|
| 1 | 計畫摘要 | 整合所有問卷答案 |
| 2 | 問題陳述 | 市場調查 + 痛點描述 |
| 3 | 創新構想 | 技術差異化分析 |
| 4 | 市場分析 | 自動計算 TAM/SAM/SOM + ROI |
| 5 | 技術可行性 | TRL 評估框架 |
| 6 | 團隊組成 | 人員 + 顧問結構 |
| 7 | 執行計畫 | Gantt-style 里程碑 |
| 8 | 經費計畫 | **確定性計算**（不依賴 LLM 數學） |
| 9 | 預期效益 | 產值/就業/技術外溢量化 |

**特色技術**：
- 🔁 **Streaming 流式回覆**：Server-Sent Events，每個 token 即時到達前端
- 🎯 **確定性財務計算**：經費分配使用本地規則引擎（`calculators.ts`）確保數字正確
- 📚 **RAG 知識擴充**：每個章節注入相關文件 chunks（Vectorize 語意搜尋）
- 🌐 **網路搜尋整合**：`enrich.ts` 對市場規模資料進行即時網頁擷取

### 3. 🔍 混合式 RAG 搜尋

```
用戶查詢 → 同義詞擴展 → Vectorize 語意搜尋 → MMR 多樣性排序 → Re-ranking → 注入 AI
```

- **同義詞擴展** (`query_expansion.ts`)：「經費」→「補助、預算、核定」，擴大召回
- **Vectorize 索引**：所有知識庫文件 + 用戶上傳文件的向量橋接
- **MMR 演算法** (`mmr.ts`)：避免搜尋結果重複，確保多元來源
- **LLM Re-ranking**：對前 20 名結果做精確語意重排序

### 4. 📄 文件上傳與處理（storage.ts + queue.ts）

```
用戶上傳 PDF/DOCX → R2 儲存 → Queue 非同步處理 → AI.toMarkdown 解析
→ 語意切塊 → AI 分類標記 → Vectorize 索引 → 即可在 AI 生成中引用
```

- 支援 **PDF、DOCX、TXT、MD** 格式
- 非同步處理（不阻塞 UI），上傳後即顯示 `processing` 狀態
- 每個 chunk 可**手動標記章節**（哪個 chunk 對應哪個計畫書章節）
- 文件 chunks 會自動注入到對應章節的 AI 生成 context

### 5. 📊 品質評估雷達圖（quality.ts）

對完整計畫書進行 **6 維度評分**：

| 維度 | 評分內容 |
|------|---------|
| 創新性 | 技術差異化描述完整度 |
| 市場性 | TAM/SAM/SOM 量化 + 客戶驗證 |
| 技術可行性 | TRL + 技術挑戰分析 |
| 財務合理性 | 預算合規 + ROI / ROAS 達標 |
| 團隊完整性 | 核心成員 + 顧問 + 分工 |
| 執行力 | 里程碑清晰度 + 時程合理性 |

前端以 **Recharts 雷達圖**可視化，一眼看出弱點章節。

### 6. 💡 市場數據擴寫（enrich.ts）

- 自動識別市場規模相關問題（TAM、SAM、客戶數）
- 透過 **Cloudflare Browser / 網頁搜尋** 抓取 IEK、MIC 等即時產業數據
- 對答案不足的段落提出 AI 建議補充方向

### 7. 🔄 段落重新生成（regenerate.ts）

- 可對任何單一章節觸發重新生成（不影響其他章節）
- 支援使用者提供額外指示（例如「加強技術說明」）
- 同樣走完整 RAG + Re-ranking pipeline

### 8. 🔑 BYOK 金鑰管理

用戶可使用自己的 AI API 金鑰（Bring Your Own Key）：
- ✅ Claude API Key
- ✅ OpenAI API Key  
- ✅ Gemini API Key

系統僅儲存加密後結果，絕不顯示原始金鑰。

---

## 🏛️ 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| **前端** | React 18 + TypeScript + Vite | SPA 架構 |
| **UI 組件** | Tailwind CSS + Recharts | 樣式 + 圖表 |
| **後端** | Cloudflare Workers + Hono.js | Serverless Edge Runtime |
| **資料庫** | Cloudflare D1 (SQLite) | 用戶、專案、文件元資料 |
| **物件儲存** | Cloudflare R2 | 上傳文件原始檔 |
| **AI 模型** | Cloudflare AI Gateway | 多模型代理 |
| **向量搜尋** | Cloudflare Vectorize | 語意 embedding + 搜尋 |
| **非同步佇列** | Cloudflare Queues | 文件處理 pipeline |
| **身份驗證** | JWT (HS256) | 無狀態驗證 |
| **型別語言** | TypeScript (strict mode) | 全棧型別安全 |

---

## 🗄️ 資料庫結構（Cloudflare D1）

```sql
users               -- 用戶帳號 + AI 金鑰（加密）
projects            -- SBIR 申請專案（phase, status, answers）
project_sections    -- 9 大章節內容 + 生成狀態
storage_files       -- 上傳文件元資料（R2 key, status）
document_chunks     -- 文件語意切塊 + 章節標記
```

完整 migration 腳本在 `saas/backend/migrations/` 目錄。

---

## 📡 API 端點

| Method | 路徑 | 功能 |
|--------|------|------|
| `POST` | `/auth/register` | 用戶註冊 |
| `POST` | `/auth/login` | 用戶登入，返回 JWT |
| `GET` | `/api/projects` | 列出所有專案 |
| `POST` | `/api/projects` | 建立新專案 |
| `GET` | `/api/projects/:id` | 取得專案詳情（含所有章節） |
| `DELETE` | `/api/projects/:id` | 刪除專案 |
| `POST` | `/api/ai/generate/:projectId` | 觸發 AI 生成（全部章節） |
| `POST` | `/api/regenerate/:projectId/:sectionId` | 重新生成單一章節（SSE） |
| `POST` | `/api/storage/upload` | 上傳參考文件 |
| `GET` | `/api/storage/:projectId` | 列出已上傳文件 |
| `GET` | `/api/storage/status/:fileId` | 查詢文件處理狀態 |
| `GET` | `/api/storage/chunks/:fileId` | 查看文件 chunks + 標記 |
| `PATCH` | `/api/storage/chunk/:chunkId/sections` | 更新 chunk 章節標記 |
| `POST` | `/api/enrich` | 市場數據擴寫 |
| `POST` | `/api/extract` | 從文件萃取問答 |
| `GET` | `/api/quality/:projectId` | 取得品質評分 |
| `GET` | `/api/me/keys` | 查詢 BYOK 金鑰狀態 |
| `PUT` | `/api/me/keys` | 更新 BYOK 金鑰 |

---

## ⚙️ 部署指南

### 前置需求

- Node.js >= 18
- Wrangler CLI：`npm install -g wrangler`
- Cloudflare 帳號（需開通 AI、D1、R2、Vectorize、Queues）

### Step 1 — 設置 Cloudflare 資源

```bash
# 建立 D1 資料庫
wrangler d1 create sbir-saas-db

# 建立 R2 儲存桶
wrangler r2 bucket create sbir-saas-bucket

# 建立 Vectorize 索引（768 維，預設 embedding model）
wrangler vectorize create sbir_chunks --dimensions=768 --metric=cosine

# 建立 Queue
wrangler queues create sbir-doc-processing
```

### Step 2 — 更新 wrangler.jsonc

複製 `saas/backend/wrangler.jsonc`，填入您的 D1 `database_id`。

### Step 3 — 執行 D1 Migration

```bash
cd saas/backend
wrangler d1 migrations apply sbir-saas-db --local   # 本地測試
wrangler d1 migrations apply sbir-saas-db            # 正式部署
```

### Step 4 — 設定環境變數

```bash
# 產生 JWT 簽名金鑰
openssl rand -base64 32

# 設定 Secret
wrangler secret put JWT_SECRET
wrangler secret put FRONTEND_URL   # e.g. https://your-domain.com
```

### Step 5 — 部署後端 Worker

```bash
cd saas/backend
npm install
wrangler deploy
```

### Step 6 — 部署前端

```bash
cd saas/frontend
npm install
npm run build
wrangler pages deploy dist --project-name sbir-saas
```

或使用 Cloudflare Pages 的 GitHub 自動部署。

---

## 🔧 本地開發

```bash
# 後端（Wrangler dev，支援 D1/R2/AI 本地模擬）
cd saas/backend
npm install
wrangler dev

# 前端（Vite dev server）
cd saas/frontend
npm install
npm run dev
```

> ⚠️ Vectorize 和 AI 需要聯網，無法完全離線模擬。本地開發時 AI 功能使用 Cloudflare 的 Remote Binding。

---

## 🔗 共享領域層（Shared Domain）

SaaS 後端與 MCP Skill 共享同一套業務規則，存放在 `shared_domain/`：

| 檔案 | 說明 |
|------|------|
| `financial_rules.json` | SBIR 各階段經費上限、補助比例、分配模板 |
| `query_synonyms.json` | RAG 查詢同義詞擴展組 |
| `quality_metrics.json` | 6 維度品質評分定義 |
| `enrich_criteria.json` | 各問題的擴寫標準與最低字數 |
| `proposal_structure.json` | 9 章節結構、專家人格設定、提示詞 |

任何規則修改只需更新 JSON，SaaS 和 Skill 兩端**同步生效**。

---

## 🧪 代碼品質

通過連續 6 輪（2 批 × 3 輪）零錯誤審計：

```
✅ TypeScript tsc --noEmit   → 0 errors (backend + frontend)
✅ Python flake8              → CLEAN
✅ Python mypy (strict)       → 0 issues in 21 source files
```

---

## 📝 授權

MIT License - 詳見 [LICENSE](LICENSE)
