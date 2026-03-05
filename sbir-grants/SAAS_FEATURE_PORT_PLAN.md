# SaaS vs Skill 領先功能比對與移植建議

目前 SaaS 平台（專屬 Web 應用）與 Claude Desktop Skill（MCP Server）的架構與功能重點各有不同。以下為詳細的比對，以及推薦從 SaaS 移植回 Skill（MCP）的潛力功能。

## 1. 架構與技術棧差異

| 比較項目 | SaaS (Web 應用) | Skill (MCP Server) |
| :--- | :--- | :--- |
| **介面形式** | 專屬 React Frontend (視覺化、互動式表單、進度條) | Claude 聊天視窗 (純文字指引與工具呼叫) |
| **後端架構** | Cloudflare Workers (Hono) | 本機 Python MCP Server |
| **數據儲存** | Cloudflare D1 (關聯式 DB), R2 (儲存) | 本機 SQLite (狀態暫存) |
| **AI 模型** | Cloudflare Workers AI (Qwen3-30b等)、BYOK (OpenAI/Claude/Gemini) | 依賴 Claude Desktop 內建模型 |
| **向量庫/搜尋**| Cloudflare Vectorize (預期整合) | 本機 ChromaDB (搭配 Cross-Encoder Reranking 與 MMR) |

## 2. SaaS 目前領先 Skill 的進階功能

SaaS 平台在**「結構化流程」**與**「資料持久化」**上大幅領先純文字的 Skill：

### A. 多專案管理與資料持久化 (Multi-Project & Persistence)
*   **SaaS**: 使用 Cloudflare D1 建立完整的關聯式資料庫，能同時管理多個專案 (`Project` table)，每個專案都能儲存特定狀態、特定使用者的獨立作答紀錄 (`project_answers`)。
*   **Skill**: 目前 MCP server 只有單一的本機 `session_state.json`，難以同時管理多份不同公司的計畫書，也缺乏長期的雲端備份。

### B. 結構化的 AI 內容萃取引擎 (Extraction Pipeline)
*   **SaaS**: 實作了專門的 `extractApp` API，能從使用者的非結構化語音或對話中，自動萃取出特定題目 (`question_id`) 的正式段落答案，並具有防止幻覺 (Hallucination) 的過濾機制。
*   **Skill**: Skill 依賴 Claude 的上下文記憶，雖然能呼叫 `save_answer`，但缺乏背後強大的自動「擴寫與正規化擷取」引擎。

### C. 分段式 / 串流式內容生成 (Streaming Section Generation)
*   **SaaS**: 將計畫書拆分為多個 Chunks (`PHASE1_CHUNKS`)，針對每一個小標題獨立進行 Context 注入與 Prompt 調整 (例如：限定字數、套用不同 Persona)，並透過 Server-Sent Events (SSE) 實時串流到前端。
*   **Skill**: Skill 的 `generate_proposal` 工具傾向於一次性輸出整份或大段落的 Markdown，難以像 SaaS 那樣針對單一章節進行精細的字數控制與流暢的 UI 渲染。

### D. 彈性的 BYOK / 模型切換機制 (Bring Your Own Key)
*   **SaaS**: 後端架構允許使用者在 DB 中儲存自己的 API Keys (Claude/OpenAI/Gemini)，並動態建立對應的 SDK 實例進行推論，甚至在無 Key 時 Fallback 到 Cloudflare AI。
*   **Skill**: 完全受限於使用者目前訂閱的 Claude 方案（通常是 Claude 3.5 Sonnet 模型）。

## 3. 確定移植回 Skill 的功能規劃 (Action Items)

根據您的回饋，針對單機版的 Claude Desktop (Skill)，我們不需考慮多專案及 BYOK，而是專注於打造極致的「單機撰寫體驗」。

以下是如何將 SaaS 的核心優勢 (B 與 C) 巧妙實作到 Skill 上的初步 Idea，請您 Review：

### 決定實作：強化版的「智慧萃取器」(Smart Extraction Pipeline)

**挑戰**：SaaS 是在背景偷偷發送額外的 API 請求來進行資料萃取，但 Skill 只能依賴 Claude 本身的對話能力。
**Skill 上的實作構想**：
1. **新增 `save_extracted_answers` 工具**：取代現有的 `save_answer`，改為接受 JSON Array 批次寫入。
2. **在工具描述 (Tool Description) 中下達精確 Prompt**：強制要求 Claude 在呼叫此工具**前**，必須先在內心中（或對話中）把使用者隨意說的話，擴寫成「語意完整、專業順暢的正式段落」，並嚴格對應題目 ID，過濾掉無法推斷的內容。
3. **效果**：讓 Claude 自己兼任「萃取引擎」，確保存入 `session_state.json` 的資料不再是破碎的短句，而是高品質的半成品段落。

### 決定實作：分段式 / 章節級別的生成機制 (Section-level Chunk Generation) 與 8 大專家 Prompt

**挑戰**：
1. SaaS 可以背景迴圈跑完整份計畫書再組裝，但如果叫 Claude 一次寫完，會受限於輸出 Token 上限，導致每一段都很簡略 (沒深度)。
2. **關鍵落差**：SaaS 中內建了針對各章節量身定做的 **「8 大超級專家 Persona (如 CTO、CFO、PMP 大師等)」**，但目前 Skill 端完全沒有這些頂級人設 Prompt，只依賴 Claude 自己自由發揮。

**Skill 上的實作構想**：
1. **建立章節提詞庫 (Chunk Prompt Database)**：在 MCP Server 內放入類似 SaaS 的 `PHASE1_CHUNKS` 定義檔，包含每個小節的 `expert_persona_prompt` (8 大專家)、目標字數與寫作骨架。
2. **新增 `get_section_generation_prompt(section_id)` 工具**：當使用者要求「開始寫計畫書」時，Claude 不會自己盲寫。它會先呼叫此工具，取得「第 1 章節的頂級顧問人設（例如：你是首席營運長 COO...）、必填的素材、以及 500 字的要求」。
3. **工作流改造 (Workflow)**：
   * Claude 向使用者宣告：「我將分段為您撰寫，並分飾 8 大專家為您操刀。現在請『首席營運長』從第一章開始...」
   * Claude 呼叫工具拿取該段的專屬最高規格 Prompt，在畫面上串流輸出最高品質的內容。
   * (可選) 寫完後呼叫 `save_generated_section` 暫存在本機。我們就可以讓 Claude 一段一段高品質地帶著使用者把整份報告組裝起來，最後再出 Word。

---
> **下一步**：您覺得這兩個在 Skill 上的實作 Idea (架構) 如何？如果覺得方向正確，我們再來安排何時開始動手實作這部分！
