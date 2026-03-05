"""
SBIR Skill - 答案品質判斷與擴寫工具
移植自 SaaS enrich.ts，為本地 Skill 提供相同的智慧問答品質補強能力

功能說明：
- 收到使用者的簡短回答後，判斷是否達到 SBIR 審查標準
- 如果不足，給出溫和的教學提示，並主動提供 AI 擴寫草稿
- 讓使用者不需要自己摸索，AI 直接代勞
"""

import json
from pathlib import Path

# 根據專案結構，shared_domain 在 mcp-server 的上一層的上一層
SHARED_DOMAIN_DIR = Path(__file__).parent.parent.parent / "shared_domain"


def load_enrich_criteria() -> dict:
    rules_file = SHARED_DOMAIN_DIR / "enrich_criteria.json"
    with open(rules_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("enrichable_questions", {})


ENRICHABLE_QUESTIONS = load_enrich_criteria()


def check_answer_quality(question_id: str, user_answer: str, context: dict | None = None) -> dict:
    """
    本地版答案品質判斷函式（不需要 AI API，基於規則）

    Returns:
        dict 包含：
            - sufficient (bool): 是否達標
            - issue (str | None): 問題描述
            - suggestion (str | None): 改善建議
            - enriched_hint (str | None): AI 擴寫提示
    """
    if question_id not in ENRICHABLE_QUESTIONS:
        # 不在監控範圍的問題，直接通過
        return {"sufficient": True}

    criteria_def = ENRICHABLE_QUESTIONS[question_id]
    answer = user_answer.strip() if user_answer else ""

    # 基礎長度檢查
    if len(answer) < criteria_def["min_chars"]:
        return {
            "sufficient": False,
            "issue": f"回答內容較短（目前 {len(answer)} 字，建議至少 {criteria_def['min_chars']} 字）",
            "suggestion": criteria_def["criteria"],
            "enriched_hint": criteria_def.get("expand_hint", "請嘗試提供更多與此問題相關的具體細節與量化數字。")
        }

    # 關鍵詞存在性檢查（簡化版）
    keywords_ok = True
    if question_id == "market_size":
        # 市場規模題需包含數字
        import re
        if not re.search(r'\d', answer):
            keywords_ok = False

    if not keywords_ok:
        return {
            "sufficient": False,
            "issue": "回答中缺少必要的量化數據",
            "suggestion": criteria_def["criteria"],
            "enriched_hint": criteria_def.get("expand_hint", "請嘗試提供更多與此問題相關的具體細節與量化數字。")
        }

    return {"sufficient": True}


async def MCP_enrich_answer(question_id: str, user_answer: str, question_text: str = "") -> str:
    """
    MCP async wrapper: 評估使用者回答品質並提供改善建議

    Args:
        question_id: 問題 ID（對應 questions.json 的 id 欄位）
        user_answer: 使用者的回答內容
        question_text: 問題原文（可選，用於顯示）

    Returns:
        str: 品質評估結果和改善建議
    """
    if not question_id:
        return "❌ 請提供 question_id 參數"

    if not user_answer or not user_answer.strip():
        return "❌ 請提供 user_answer（使用者的回答內容）"

    result = check_answer_quality(question_id, user_answer)

    if result["sufficient"]:
        return f"""✅ **回答品質達標**

**問題 ID**：{question_id}
**回答長度**：{len(user_answer.strip())} 字

這份回答已符合 SBIR 審查標準，可以繼續下一個問題！"""

    else:
        return f"""⚠️ **回答需要補強**

**問題 ID**：{question_id}
{f'**問題**：{question_text}' if question_text else ''}
**您的回答**：{user_answer[:100]}{'...' if len(user_answer) > 100 else ''}

---

**問題所在**：{result.get('issue', '')}

**SBIR 達標標準**：
{result.get('suggestion', '')}

---

**建議補充方向**：
{result.get('enriched_hint', '')}

💡 **下一步**：請針對以上方向補充您的回答，完成後再次呼叫此工具確認是否達標。
或者，您可以嘗試告訴 Claude 更多關於這個問題的細節，由 Claude 協助擴寫。"""
