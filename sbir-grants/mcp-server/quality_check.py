"""
SBIR Skill - 計畫書品質審查工具
移植自 SaaS ai.ts quality-check 端點
對完成的計畫書草稿進行 6 維度 AI 審查評分
"""

import os
import json
from pathlib import Path

# 狀態檔案路徑（與 proposal_generator_impl.py 共用）
STATE_FILE = os.path.expanduser("~/.sbir_proposal_state.json")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# 根據專案結構，shared_domain 在 mcp-server 的上一層的上一層
SHARED_DOMAIN_DIR = Path(__file__).parent.parent.parent / "shared_domain"


def load_quality_metrics() -> dict:
    rules_file = SHARED_DOMAIN_DIR / "quality_metrics.json"
    with open(rules_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("quality_dimensions", {})


# 6 個審查維度定義（從共用 JSON 載入）
QUALITY_DIMENSIONS = load_quality_metrics()


def _keyword_check(text: str, keywords: list, min_count: int) -> bool:
    """簡單的關鍵詞存在性檢查"""
    count = sum(1 for kw in keywords if kw.lower() in text.lower())
    return count >= min_count


def evaluate_proposal_quality(full_text: str) -> dict:
    """
    對計畫書全文進行 6 維度規則式評分
    （不需要雲端 AI，本地即時執行）
    """
    results = {}
    reasons = {}

    for dim_id, dim in QUALITY_DIMENSIONS.items():
        if dim_id == "ch_12":
            # 語氣維度：用總字數判斷
            passed = len(full_text) >= dim["min_chars_total"]
            results[dim_id] = passed
            reasons[dim_id] = (
                f"計畫書總長度 {len(full_text)} 字，{'通過' if passed else '建議擴充至 1000 字以上'}。"
            )
        else:
            keywords = dim.get("keywords", [])
            min_count = dim.get("min_related_keywords", 1)
            passed = _keyword_check(full_text, keywords, min_count)
            results[dim_id] = passed

            found = [kw for kw in keywords if kw.lower() in full_text.lower()]
            if passed:
                reasons[dim_id] = f"包含必要關鍵詞：{', '.join(found[:3])}"
            else:
                missing = [kw for kw in keywords if kw.lower() not in full_text.lower()][:3]
                reasons[dim_id] = f"缺少關鍵要素，建議補充：{', '.join(missing)}"

    return {"results": results, "reasons": reasons}


async def MCP_check_proposal_quality(proposal_text: str = "") -> str:
    """
    MCP async wrapper: 對計畫書草稿進行 6 維度品質審查

    Args:
        proposal_text: 計畫書全文（如果留空，嘗試從生成器狀態讀取）

    Returns:
        str: 6 維度審查結果報告
    """
    # 如果沒有傳入全文，嘗試從狀態檔案讀取
    if not proposal_text:
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, 'r', encoding='utf-8') as f:
                    state = json.load(f)
                answers = state.get("answers", {})
                if answers:
                    proposal_text = " ".join(str(v) for v in answers.values())
            except Exception:
                pass

    if not proposal_text or len(proposal_text.strip()) < 50:
        return (
            "❌ 找不到可審查的計畫書內容\n\n"
            "請：\n"
            "1. 先使用 `start_proposal_generator` 開始填寫計畫書\n"
            "2. 或直接傳入計畫書全文作為 `proposal_text` 參數"
        )

    evaluation = evaluate_proposal_quality(proposal_text)
    results = evaluation["results"]
    reasons = evaluation["reasons"]

    passed_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    score_pct = int(passed_count / total_count * 100)

    # 生成報告
    score_emoji = "🎉" if score_pct >= 80 else "⚠️" if score_pct >= 60 else "🔴"
    report = f"""## {score_emoji} 計畫書品質審查報告

**整體得分**：{passed_count}/{total_count} 項通過 （{score_pct}%）

---

| 維度 | 項目 | 結果 | 說明 |
|------|------|------|------|
"""
    for dim_id, dim in QUALITY_DIMENSIONS.items():
        status = "✅ 通過" if results.get(dim_id) else "❌ 未達標"
        reason = reasons.get(dim_id, "")
        report += f"| {dim['label']} | {dim['question'][:20]}... | {status} | {reason} |\n"

    report += "\n---\n\n"

    # 改善建議
    failed_dims = [
        (dim_id, QUALITY_DIMENSIONS[dim_id])
        for dim_id, passed in results.items()
        if not passed
    ]

    if failed_dims:
        report += "### 📝 需要改善的項目\n\n"
        for dim_id, dim in failed_dims:
            report += f"**{dim['label']}**：{reasons.get(dim_id, '')}\n\n"
    else:
        report += "### 🎊 計畫書已達到所有品質標準！\n\n可以執行 `generate_proposal` 輸出完整計畫書。\n"

    return report
