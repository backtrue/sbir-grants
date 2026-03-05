# SBIR Grants AI Copilot (SaaS & MCP Skill)

A comprehensive AI ecosystem designed to assist SMEs with crafting high-quality, local SBIR (Small Business Innovation Research) proposals. The project is split into two perfectly aligned interfaces: a modern Web SaaS and a local Claude MCP Skill.

## 🚀 Recent Feature Launches (The "Reverse Porting" Initiative)

We have successfully reverse-ported the advanced, deterministic methodology from our local MCP Skill back into the Web SaaS, ensuring 100% parity in generation quality and strict compliance with local SBIR success factors.

### 1. 統一知識基準 (Shared Domain SSOT)
- **Single Source of Truth**: All domain logic is now centrally managed in a newly created `shared_domain/` directory.
- **Config JSONs**: Extracted ROI formulas (`financial_rules.json`), evaluation metrics (`quality_metrics.json`), terminology dictionaries (`query_synonyms.json`), enrichment guidelines (`enrich_criteria.json`), and proposal structures into unified JSON files. 
- **Cross-Platform Loaders**: Both the TypeScript backend and the Python MCP server dynamically ingest these rules.

### 2. 嚴謹的事實查核與單筆追蹤修訂 (AI Draft Auto-Edit)
- **Track Changes UI**: A Word-like review interface in the SaaS that allows users to accept/reject granular LLM edits individually.
- **Ground Truth Enforcement**: Injects the user's original survey answers into the prompt to strictly prevent hallucinated figures or tech concepts.
- **Success Factors Integration**: Automatically scores drafts against "Local SBIR Success Factors" (e.g., local employment, local supply chain) and injects missing requirements as fill-in-the-blank templates.

### 3. 動態聯網與重排序 (Web Search & Re-ranking)
- **Tavily Search API**: Dynamically answers gaps in knowledge, specifically market sizes (TAM/SAM/SOM), with live web data instead of LLM hallucinations.
- **MMR & Reranking**: Boosted Vectorize retrieval from Top 10 to Top 30, pre-filtered with Maximal Marginal Relevance, and post-ranked with Cloudflare Worker AI's Qwen model.

### 4. 財務指標自動規劃 (Deterministic ROAS Calculators)
- Replaced unreliable LLM-generated budget tables with strict, algorithmically determined Phase 1 / Phase 2 ROAS calculations.

### 5. 6 維度即時品質診斷 (Quality Radar)
- Blazingly fast, rule-based quality checkpoints evaluating 6 dimensions of the draft (Innovation, Data Credibility, Commercial Viability, etc.), complete with visual radar charts on the frontend.

## 📂 Project Structure

- **`/saas`**: Cloudflare Pages (React) + Cloudflare Workers / D1 / Vectorize (Hono backend). The primary user interface.
- **`/sbir-grants`**: The interactive CLI & Model Context Protocol (MCP) Server. The sandbox for agentic tool use and advanced document ingestion.
- **`/shared_domain`**: The unified commercial logic and rulebook used by both platforms.

## 🛠 Stability 
This repository undergoes a strict 3-Round System Audit enforcing:
- **TypeScript**: 0 compilation warnings (Frontend & Backend).
- **Python Static Analysis**: Fully typed strict passing standard via `mypy` and `flake8` clean.
