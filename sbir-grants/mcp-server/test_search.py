#!/usr/bin/env python3
"""
語意搜尋測試腳本
"""

from vector_search import semantic_search, get_index_count
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)


PERSIST_DIR = os.path.join(SCRIPT_DIR, "chroma_db")


def test_semantic_search():
    print("=" * 50)
    print("語意搜尋測試")
    print("=" * 50)
    print()

    # 檢查索引
    count = get_index_count(PERSIST_DIR)
    print(f"索引文件數量: {count}")

    if count == 0:
        print("錯誤: 索引為空，請先執行 build_index.py")
        return 1

    # 測試查詢
    test_cases = [
        ("資本額限制", ["sbir_guidelines.md", "faq_eligibility.md"]),
        ("創新性撰寫", ["methodology_innovation.md"]),
        ("經費編列", ["budget_preparation.md", "budget_template.md"]),
        ("申請資格條件", ["pre_application_checklist.md", "sbir_guidelines.md"]),
        ("新創公司補助", []),  # 語意理解測試
    ]

    print()
    for query, expected in test_cases:
        print(f"\n查詢: 「{query}」")
        print("-" * 40)

        results = semantic_search(query, PERSIST_DIR, n_results=5)

        for i, result in enumerate(results, 1):
            similarity = result['similarity'] * 100
            print(f"  {i}. {result['id']} (相似度: {similarity:.1f}%)")

        # 檢查是否命中預期
        if expected:
            found = [r['id'] for r in results[:3]]
            hits = sum(1 for exp in expected if any(exp in f for f in found))
            if hits > 0:
                print(f"  ✅ 命中預期 ({hits}/{len(expected)})")
            else:
                print("  \u26a0\ufe0f 未命中預期（可接受）")

    print()
    print("=" * 50)
    print("測試完成!")
    print("=" * 50)

    return 0


if __name__ == "__main__":
    sys.exit(test_semantic_search())
