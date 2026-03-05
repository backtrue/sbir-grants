"""
SBIR Skill - AI 草稿審閱與單筆修訂提示詞生成工具
移植自 SaaS ai.ts 的 Auto-Edit (Track Changes) 功能
為 MCP Client (如 Claude) 提供完整的審閱上架提示詞與事實基準
"""

import os
import json
from pathlib import Path

# 狀態檔案路徑（與 proposal_generator_impl.py 共用）
STATE_FILE = os.path.expanduser("~/.sbir_proposal_state.json")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_success_factors() -> str:
    """載入地方型 SBIR 成功關鍵要素"""
    factors_file = Path(PROJECT_ROOT) / "references" / "local_sbir_success_factors.md"
    try:
        with open(factors_file, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"無法載入過件關鍵：{e}"


def load_state() -> dict:
    """載入本地計畫書狀態與原始訪談紀錄"""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


async def MCP_get_ai_draft_review_prompt(section_index: int) -> str:
    """生成針對特定草稿章節的 AI 審閱 (Track Changes) 提示詞"""
    state = load_state()
    answers = state.get("answers", {})
    sections = state.get("generated_sections", {})
    
    # Check if section exists
    # The section_index in SaaS is 0-indexed, but in local state it is 1-indexed string keys usually
    # Let's handle both string or integer lookups
    section_key = str(section_index + 1)
    
    if section_key not in sections:
        return f"❌ 找不到章節 {section_index + 1} 的草稿內容。請先確定該章節已生成並儲存 (使用 save_generated_section)。"
        
    section_title = sections[section_key].get("title", f"第 {section_key} 章")
    section_content = sections[section_key].get("content", "")
    
    # Formatting Ground Truth
    ground_truth = "無原始資料"
    if answers:
        # 只取有回答到的問題，過濾空值
        valid_answers = {k: v for k, v in answers.items() if v}
        if valid_answers:
             ground_truth = json.dumps(valid_answers, ensure_ascii=False, indent=2)
             
    success_factors = load_success_factors()

    prompt = f"""你現在的任務是針對使用者生成的計畫書段落，進行「事實查核 (Fact Check)」與「過件關鍵強化 (Success Factors)」，並給出「單筆追蹤修訂 (Track Changes)」的修改建議。

【絕對事實基準 (Ground Truth)】
這份計畫書的原始訪談資料如下，所有草稿中的「營收數字」、「技術名詞」、「公司實績」、「員工人數」都必須與此基準核對。
如果草稿中出現了這些基準資料中沒有的豐功偉業，極高機率是 AI 幻覺造假，請直接在修訂中刪除該造假內容或改寫為客觀陳述，並在 reasons 中註明【事實查核警告】。
---
{ground_truth}
---

【地方型 SBIR 成功過件要素清單】
---
{success_factors}
---

【審查與編修任務】
正在審閱的章節：{section_title}
【原稿內容如下】
---
{section_content}
---

【審查要求】
1. 若草稿缺乏具體的「在地就業人數」、「在地商業鏈連結」或「在地經濟貢獻」，請直接產生擴寫修訂，包含明確的待填括號（例如：[預計新增 O 名在地研發人員]），強迫補齊過件關鍵。並在 reasons 中註明【過件關鍵補強】。
2. 針對語句不通順或口吻不夠專業的地方進行潤飾。

【輸出格式要求】
你必須回傳一個嚴格符合以下結構的 JSON 格式（純粹輸出 JSON，不要包在 Markdown code block 中）：
{{
  "FactCheckWarnings": ["如果沒有事實錯誤，回傳空陣列", "否則列出你抓到的具體幻覺造假"],
  "Strengths": ["列出原稿符合過件要素的優點"],
  "Weaknesses": ["列出原稿不足或空泛的地方"],
  "Edits": [
    {{
      "original_text": "要被修改的原句（必須在原文中找得到）",
      "revised_text": "你建議改寫後的新句",
      "reason": "你的修改理由（如果是幻覺請寫【事實查核】；如果是擴寫請寫【過件關鍵】）"
    }}
  ]
}}
"""
    return prompt
