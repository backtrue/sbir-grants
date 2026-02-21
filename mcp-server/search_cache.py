"""
搜尋快取模組 - LRU 快取機制（使用 OrderedDict 實現 O(1) 操作）

提升常見查詢的回應速度
"""

import hashlib
import logging
from collections import OrderedDict
from typing import Optional

logger = logging.getLogger(__name__)


class SearchCache:
    """搜尋結果快取（LRU 策略，使用 OrderedDict 實現 O(1) 操作）"""

    def __init__(self, max_size: int = 100):
        """
        初始化快取

        Args:
            max_size: 最大快取數量
        """
        self.cache: OrderedDict[str, str] = OrderedDict()
        self.max_size = max_size
        self._hits = 0
        self._misses = 0

    def _hash_query(self, query: str, category: str) -> str:
        """
        生成查詢的雜湊值（SHA-256，比 MD5 更安全）

        Args:
            query: 查詢字串
            category: 分類

        Returns:
            SHA-256 雜湊值（前 16 字元）
        """
        key = f"{query}:{category}"
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    def get(self, query: str, category: str = "all") -> Optional[str]:
        """
        獲取快取結果。命中時將項目移至尾端（最近使用）。

        Args:
            query: 查詢字串
            category: 分類

        Returns:
            快取的結果，如果不存在則返回 None
        """
        key = self._hash_query(query, category)

        if key in self.cache:
            self.cache.move_to_end(key)  # O(1) — 移至最近使用端
            self._hits += 1
            return self.cache[key]

        self._misses += 1
        return None

    def set(self, query: str, category: str, results: str) -> None:
        """
        設定快取。若已存在則更新並移至尾端；若超過容量則淘汰最舊項目。

        Args:
            query: 查詢字串
            category: 分類
            results: 搜尋結果
        """
        key = self._hash_query(query, category)

        if key in self.cache:
            self.cache.move_to_end(key)  # O(1)
        elif len(self.cache) >= self.max_size:
            self.cache.popitem(last=False)  # O(1) — 移除最舊項目（最少使用端）

        self.cache[key] = results

    def clear(self) -> None:
        """清空快取"""
        self.cache.clear()
        self._hits = 0
        self._misses = 0

    def stats(self) -> dict:
        """
        獲取快取統計資訊

        Returns:
            統計資訊字典
        """
        total = self._hits + self._misses
        hit_rate = self._hits / total if total > 0 else 0.0
        return {
            "size": len(self.cache),
            "max_size": self.max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{hit_rate:.1%}",
        }


# 全域快取實例
_search_cache = SearchCache(max_size=100)


def get_cache() -> SearchCache:
    """獲取全域快取實例"""
    return _search_cache


if __name__ == "__main__":
    # 測試
    cache = SearchCache(max_size=3)

    print("快取測試\n" + "=" * 50)

    cache.set("Phase 1", "all", "結果1")
    cache.set("Phase 2", "all", "結果2")
    cache.set("補助金額", "all", "結果3")

    print(f"快取大小: {cache.stats()['size']}/3")
    print(f"獲取 'Phase 1': {cache.get('Phase 1', 'all')}")

    # 測試 LRU 淘汰
    cache.set("創新性", "all", "結果4")  # 應該淘汰最舊的 Phase 2
    print(f"\n加入新項目後快取大小: {cache.stats()['size']}/3")
    print(f"獲取 'Phase 2' (應該被淘汰): {cache.get('Phase 2', 'all')}")
    print(f"獲取 '補助金額' (應該還在): {cache.get('補助金額', 'all')}")

    print(f"\n快取統計: {cache.stats()}")
