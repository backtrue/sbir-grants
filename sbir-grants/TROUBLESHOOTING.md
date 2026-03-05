# 疑難排解

## 常見問題與解決方案

### 1. 資格問題

#### 問題：不確定是否符合中小企業定義

**症狀**：
- 實收資本額接近 1 億
- 員工數接近 200 人

**解決方案**：
1. 查看公司登記證明
2. 確認實收資本額 < 1 億（不含 1 億）
3. 確認員工數 < 200 人（不含 200 人）
4. 兩個條件都要符合

**參考資源**：`faq/faq_eligibility.md`

---

#### 問題：外資持股計算方式不清楚

**症狀**：
- 有外資股東
- 不確定如何計算比例

**解決方案**：
1. 查看公司登記資料
2. 計算外資股東持股總和
3. 確保 < 50%（不含 50%）

---

### 2. 撰寫問題

#### 問題：不知道如何開始撰寫

**症狀**：
- 面對空白頁不知從何下手
- 不確定架構

**解決方案**：
1. 使用 `quick_start/10min_eligibility_check.md` 確認資格
2. 使用 `quick_start/1hour_idea_validation.md` 驗證構想
3. 參考 `templates/phase1_proposal.md` 或 `phase2_proposal.md`
4. 逐章使用方法論（`references/methodology_*.md`）

---

#### 問題：創新點寫不出來

**症狀**：
- 不知道如何描述創新
- 覺得「不夠創新」

**解決方案**：
1. 閱讀 `references/methodology_innovation.md`
2. 使用創新類型矩陣定位
3. 與競品比較，找出差異
4. 量化效益提升
5. 參考 `examples/before_after_innovation.md`

---

#### 問題：市場規模不知道如何估算

**症狀**：
- 不知道 TAM/SAM/SOM 是什麼
- 不知道數據從哪來

**解決方案**：
1. 閱讀 `references/methodology_market_analysis.md`
2. 參考 `examples/market_analysis_data.md`（數據來源）
3. 使用簡化公式：
   - TAM = 產業總產值
   - SAM = TAM × 適用比例（10-30%）
   - SOM = SAM × 市佔率（0.5-2%）

---

### 3. 經費問題

#### 問題：人事費超過 60%

**症狀**：
- 經費編列後發現人事費 > 60%

**解決方案**：
1. 減少人力或降低薪資
2. 增加其他科目（設備使用費、差旅費）
3. 重新檢視人力需求是否合理
4. 參考 `references/methodology_budget_planning.md`

---

#### 問題：不知道如何編列經費

**症狀**：
- 不知道有哪些科目
- 不知道比例限制

**解決方案**：
1. 參考 `templates/budget_template.md`
2. 使用 `checklists/budget_checklist.md` 檢核
3. 確認比例：
   - 人事費 ≤ 60%
   - 委託研究費 ≤ 30%
   - 技術移轉費 ≤ 10%

---

### 4. 審查問題

#### 問題：不知道審查委員會問什麼

**症狀**：
- 擔心簡報時被問倒
- 不知道如何準備

**解決方案**：
1. 閱讀 `faq/faq_review.md`
2. 參考案例研究的審查問答
3. 常見問題：
   - 與競品差異？
   - 市場規模？
   - 技術風險？
   - 團隊能力？
4. 準備具體數據支持

---

#### 問題：評分標準不清楚

**症狀**：
- 不知道如何提高分數
- 不知道會被扣分

**解決方案**：
1. 閱讀 `references/review_criteria/` 下的 4 個評分標準
2. 了解各分數區間的特徵
3. 避免常見扣分原因

---

### 5. 時程問題

#### 問題：時間不夠

**症狀**：
- 距離截止日不到 1 個月
- 還沒開始準備

**解決方案**：
1. 評估是否真的來得及
2. 如果 < 2 週，建議等下次
3. 如果 2-4 週，使用 `quick_start/1week_proposal_sprint.md`
4. 尋求專業協助

---

### 6. MCP Server 問題

#### 問題：MCP Server 無法啟動

**症狀**：
- Claude Desktop 無法連接 MCP Server

**解決方案**：
1. 檢查 `claude_desktop_config.json` 設定
2. 確認路徑正確
3. 確認已安裝依賴：`uv pip install -e .`
4. 查看 MCP Server 日誌

---

#### 問題：數據查詢失敗

**症狀**：
- MCP Server 回傳錯誤

**解決方案**：
1. 改用 Claude 的 `search_web` 工具
2. 手動查詢官方網站
3. 參考 `examples/market_analysis_data.md`

---

## 取得協助

### 線上資源

- SBIR 官網：https://www.sbir.org.tw/
- FAQ 整合版：`FAQ.md`
- 各主題 FAQ：`faq/` 目錄

### 專業協助

- SBIR 服務專線：0800-888-968
- 各地服務中心
- 專業顧問

### 自助工具

- 10 分鐘資格檢查：`quick_start/10min_eligibility_check.md`
- 1 小時構想驗證：`quick_start/1hour_idea_validation.md`
- 申請前檢核：`checklists/pre_application_checklist.md`
