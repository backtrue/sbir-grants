"""
搜尋建議模組

基於查詢關鍵字和結果內容，提供後續查詢建議
"""

# 關鍵字規則建議庫
SUGGESTION_TEMPLATES = {
    "經費": [
        "Phase 1 經費編列原則是什麼？",
        "人事費有上限嗎？",
        "會計科目編列注意事項"
    ],
    "補助": [
        "Phase 1 補助上限是多少？",
        "Phase 2 補助金額限制",
        "自籌款比例要求"
    ],
    "申請": [
        "申請資格限制有哪些？",
        "申請流程圖",
        "應備文件清單"
    ],
    "Phase 1": [
        "Phase 1 計畫書撰寫重點",
        "Phase 1 創新性如何呈現？",
        "Phase 1 結案條件"
    ],
    "Phase 2": [
        "Phase 2 商業化規劃",
        "Phase 2 產出效益要求",
        "從 Phase 1 到 Phase 2 的銜接"
    ],
    "創新": [
        "如何論述技術創新性？",
        "服務創新範例",
        "創新性評分標準"
    ],
    "市場": [
        "市場分析怎麼寫？",
        "如何估算市場規模 (TAM/SAM/SOM)？",
        "目標客群分析範例"
    ],
    "團隊": [
        "計畫主持人資格要求",
        "顧問可以列入團隊嗎？",
        "研發人員薪資編列"
    ],
    "失敗": [
        "常見失敗原因分析",
        "如何避免資格不符？",
        "退件補正流程"
    ]
}

# 類別基礎建議
CATEGORY_SUGGESTIONS = {
    "methodology": ["查看相關成功案例", "下載申請表格範本"],
    "checklist": ["閱讀申請須知細節", "查看經費編列手冊"],
    "case_study": ["分析此案例的成功關鍵", "比較不同產業的案例"],
    "faq": ["回到申請流程總覽", "查看審查常見問題"]
}


def generate_suggestions(query: str, results: list, max_count: int = 3) -> list[str]:
    """
    生成搜尋建議

    Args:
        query: 查詢字串
        results: 搜尋結果列表
        max_count: 最大建議數量

    Returns:
        建議問題列表
    """
    suggestions = set()
    query_lower = query.lower()

    # 1. 關鍵字匹配建議 (Rule-based)
    for key, templates in SUGGESTION_TEMPLATES.items():
        if key.lower() in query_lower:
            # 隨機選一個，或全部加入後續篩選
            for tmpl in templates:
                suggestions.add(tmpl)

    # 2. 上下文建議 (Context-based)
    # 根據找到的文件類型推薦
    if results:
        # 統計前 3 名結果的類別
        categories = [r.get('category', 'unknown') for r in results[:3]]

        for cat in categories:
            if cat in CATEGORY_SUGGESTIONS:
                for sugg in CATEGORY_SUGGESTIONS[cat]:
                    suggestions.add(sugg)

    # 3. 預設建議（如果太少）
    if len(suggestions) < 2:
        suggestions.add("SBIR 申請資格")
        suggestions.add("Phase 1 vs Phase 2 差異")
        suggestions.add("計畫書撰寫技巧")

    # 轉換為列表並限制數量
    # 簡單去重：如果建議已經包含在查詢中，則排除
    final_suggestions = []
    for s in suggestions:
        if s.lower() not in query_lower:  # 避免推薦類似「經費」(查詢「經費」時)
            final_suggestions.append(s)

    # 排序：優先顯示與查詢關鍵字重疊度低的（假設是為了擴展知識）
    # 這裡簡單取前 N 個
    return sorted(list(final_suggestions))[:max_count]


if __name__ == "__main__":
    # 測試
    test_queries = [
        ("經費編列", [{"category": "checklist"}]),
        ("創新性", [{"category": "methodology"}]),
        ("SBIR", [])
    ]

    print("搜尋建議測試\n" + "="*50)
    for q, res in test_queries:
        suggs = generate_suggestions(q, res)
        print(f"\n查詢: {q}")
        print(f"建議: {suggs}")
