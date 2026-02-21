"""
查詢擴展模組 - 同義詞處理

使用 SBIR 領域同義詞擴展查詢，提升搜尋召回率
支援雙向同義詞：搜尋任一詞都能展開到整個同義詞組
"""

import logging

logger = logging.getLogger(__name__)

# SBIR 領域同義詞字典（每個 key 是一組同義詞，所有詞互為同義詞）
# 格式：列表中的任意詞搜尋時，都會展開到同一組的所有詞
_SYNONYM_GROUPS: list[list[str]] = [
    # 補助相關
    ["補助", "補助金額", "經費", "資金", "款項", "補貼", "補助費"],
    ["申請", "送件", "提案", "投標", "報名", "申報"],

    # 階段相關
    ["Phase 1", "第一階段", "先期研究", "創新技術", "Phase1", "phase 1", "一階"],
    ["Phase 2", "第二階段", "研究開發", "Phase2", "phase 2", "二階"],
    ["Phase 2+", "第三階段", "加值應用", "Phase2+", "phase 2+", "2+"],

    # 創新相關
    ["創新", "創新性", "創意", "突破", "新穎", "創新點"],
    ["技術", "技術創新", "科技", "研發技術", "技術研發"],
    ["可行性", "技術可行性", "執行可行性", "feasibility"],

    # 市場相關
    ["市場", "市場分析", "市場規模", "目標市場", "市場潛力"],
    ["商業化", "產業化", "市場化", "商品化"],

    # 團隊相關
    ["團隊", "研發團隊", "執行團隊", "人力", "人員"],
    ["主持人", "計畫主持人", "負責人", "PI"],

    # 文件類型
    ["範例", "案例", "樣本", "示範", "參考", "example"],
    ["方法", "方法論", "做法", "步驟", "流程", "methodology"],
    ["檢核", "檢核清單", "清單", "查核", "檢查", "checklist"],
    ["指南", "指引", "說明", "guide", "教學"],

    # 經費相關
    ["經費", "預算", "費用", "成本", "支出"],
    ["編列", "編制", "規劃", "安排"],

    # 審查相關
    ["審查", "評審", "評分", "review"],
    ["評分", "評分標準", "評分項目", "分數"],

    # 產業相關
    ["機械", "機械產業", "機械業", "機械製造"],
    ["生技", "生物技術", "生技產業", "biotechnology"],
    ["ICT", "資通訊", "資訊", "通訊"],
]

# 建立雙向查詢字典：每個詞 → 它所在的同義詞群組
_WORD_TO_GROUP: dict[str, list[str]] = {}
for group in _SYNONYM_GROUPS:
    for word in group:
        _WORD_TO_GROUP[word.lower()] = [w for w in group if w != word]


def expand_query(query: str) -> list[str]:
    """
    擴展查詢，加入同義詞（雙向：搜尋任一詞都能展開到整個同義詞群組）

    Args:
        query: 原始查詢字串

    Returns:
        擴展後的查詢列表（包含原始查詢）

    Example:
        >>> expand_query("預算")          # "預算" 現在也會展開到 "補助" / "經費" 等
        ["預算", "補助預算", "費用預算", ...]
        >>> expand_query("補助金額")
        ["補助金額", "預算金額", "費用金額", ...]
    """
    expanded = [query]
    query_lower = query.lower()

    # 對每個詞，檢查它是否存在於某個同義詞群組中
    for word_lower, synonyms in _WORD_TO_GROUP.items():
        if word_lower in query_lower:
            # 找到匹配的原始詞（保持原始大小寫）
            original_case = None
            for group in _SYNONYM_GROUPS:
                for w in group:
                    if w.lower() == word_lower:
                        original_case = w
                        break
                if original_case:
                    break

            for syn in synonyms:
                # 嘗試用原始大小寫替換，否則用小寫
                if original_case and original_case in query:
                    new_query = query.replace(original_case, syn)
                else:
                    new_query = query_lower.replace(word_lower, syn)

                if new_query not in expanded:
                    expanded.append(new_query)

    return expanded


def get_expanded_keywords(query: str) -> list[str]:
    """
    獲取擴展後的關鍵字列表（去重）

    Args:
        query: 原始查詢字串

    Returns:
        擴展後的關鍵字列表

    Example:
        >>> get_expanded_keywords("Phase 1 申請")
        ["phase", "1", "申請", "第一階段", "先期研究", "送件", "提案", ...]
    """
    expanded_queries = expand_query(query)
    keywords: list[str] = []

    for q in expanded_queries:
        words = [kw.strip().lower() for kw in q.split() if kw.strip()]
        keywords.extend(words)

    # 去重但保持順序（Python 3.7+ dict 保證插入順序）
    return list(dict.fromkeys(keywords))


if __name__ == "__main__":
    # 測試
    test_queries = [
        "補助金額",
        "預算",          # 反向：應能展開到「補助」「經費」
        "Phase 1 申請資格",
        "創新性方法",
        "市場分析範例",
    ]

    print("同義詞擴展測試（含雙向展開）\n" + "=" * 50)
    for q in test_queries:
        expanded = expand_query(q)
        print(f"\n原始查詢: {q}")
        print(f"擴展數量: {len(expanded)}")
        print(f"擴展結果（前5）: {expanded[:5]}")
