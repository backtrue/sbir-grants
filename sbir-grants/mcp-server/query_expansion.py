"""
查詢擴展模組 - 同義詞處理

使用 SBIR 領域同義詞擴展查詢，提升搜尋召回率
支援雙向同義詞：搜尋任一詞都能展開到整個同義詞組
"""

from pathlib import Path
import json
import logging

logger = logging.getLogger(__name__)


# 根據專案結構，shared_domain 在 mcp-server 的上一層的上一層
SHARED_DOMAIN_DIR = Path(__file__).parent.parent.parent / "shared_domain"


def load_synonyms() -> list[list[str]]:
    rules_file = SHARED_DOMAIN_DIR / "query_synonyms.json"
    with open(rules_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("synonym_groups", [])


_SYNONYM_GROUPS: list[list[str]] = load_synonyms()

# 建立雙向查詢字典：每個詞 → 它所在的同義詞群組
_WORD_TO_GROUP: dict[str, list[str]] = {}
for group in _SYNONYM_GROUPS:
    for word in group:
        _WORD_TO_GROUP[word.lower()] = [w for w in group if w != word]


def expand_query(query: str) -> list[str]:
    """
    擴展查詢，加入同義詞（雙向：搜尋任一詞都能展開到整個同義詞群組）

    一個詞只用第一個匹配到的同義詞群組（避免詞在多群組造成爆炸式展開）。
    """
    expanded = [query]
    query_lower = query.lower()
    seen_words: set[str] = set()  # 防止同一個 word 在多群組重複展開

    import re

    for word_lower, synonyms in _WORD_TO_GROUP.items():
        if word_lower in seen_words:
            continue

        # Check word boundary for English/ASCII words to prevent "ict" matching "picture"
        is_english = bool(re.match(r'^[a-zA-Z0-9_+\-\s]+$', word_lower))
        if is_english:
            pattern = r'\b' + re.escape(word_lower) + r'\b'
            if not re.search(pattern, query_lower):
                continue
        elif word_lower not in query_lower:
            continue

        seen_words.add(word_lower)

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
            if is_english:
                # Safe regex replace for english terms
                if original_case and re.search(r'\b' + re.escape(original_case) + r'\b', query):
                    new_query = re.sub(r'\b' + re.escape(original_case) + r'\b', syn, query)
                else:
                    new_query = re.sub(r'\b' + re.escape(word_lower) + r'\b', syn, query_lower)
            else:
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
