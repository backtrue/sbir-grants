#!/usr/bin/env python3
"""
建立向量索引腳本（語意分段版）

此腳本會掃描所有 Markdown 文件，進行語意分段，並建立搜尋索引
"""

from chunker import chunk_all_documents
from vector_search import index_documents, get_index_count
import os
import sys
import glob

# 設定專案根目錄
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# 將 mcp-server 加入 path
sys.path.insert(0, SCRIPT_DIR)


# ChromaDB 持久化目錄
PERSIST_DIR = os.path.join(SCRIPT_DIR, "chroma_db")


def get_category_from_path(path: str) -> str:
    """根據路徑判斷文件類別"""
    path_lower = path.lower()
    if "methodology" in path_lower:
        return "方法論"
    elif "faq" in path_lower:
        return "常見問題"
    elif "checklist" in path_lower:
        return "檢核清單"
    elif "case_studies" in path_lower or "examples" in path_lower:
        return "案例研究"
    elif "template" in path_lower:
        return "範本"
    elif "references" in path_lower:
        return "參考資料"
    elif "quick_start" in path_lower:
        return "快速指南"
    else:
        return "其他"


def load_all_documents() -> list:
    """載入所有 Markdown 文件"""
    pattern = os.path.join(PROJECT_ROOT, "**/*.md")
    files = glob.glob(pattern, recursive=True)

    documents = []

    # 排除的目錄
    exclude_patterns = ['.git', 'node_modules', 'venv', '.venv', 'chroma_db', '__pycache__']

    for file_path in files:
        # 跳過不需要索引的目錄
        if any(skip in file_path for skip in exclude_patterns):
            continue

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 跳過空文件
            if not content.strip():
                continue

            relative_path = os.path.relpath(file_path, PROJECT_ROOT)
            filename = os.path.basename(file_path)

            documents.append({
                "id": relative_path,
                "content": content,
                "metadata": {
                    "category": get_category_from_path(relative_path),
                    "filename": filename,
                    "path": relative_path
                }
            })
        except Exception as e:
            print(f"讀取檔案失敗 {file_path}: {e}")

    return documents


def main():
    print("=" * 50)
    print("SBIR 知識庫向量索引建立工具")
    print("（語意分段版 v2.0）")
    print("=" * 50)
    print()

    # 檢查現有索引
    existing_count = get_index_count(PERSIST_DIR)
    if existing_count > 0:
        print(f"發現現有索引，包含 {existing_count} 個 chunks")
        response = input("是否重新建立索引？(y/N): ").strip().lower()
        if response != 'y':
            print("取消操作")
            return
        print()

        # 清除現有索引
        import shutil
        if os.path.exists(PERSIST_DIR):
            shutil.rmtree(PERSIST_DIR)
            print("已清除現有索引")
            print()

    # 載入文件
    print("步驟 1/3: 載入知識庫文件...")
    documents = load_all_documents()
    print(f"  找到 {len(documents)} 個 Markdown 文件")

    # 顯示文件分類統計
    categories = {}
    for doc in documents:
        cat = doc['metadata']['category']
        categories[cat] = categories.get(cat, 0) + 1

    print("\n  文件分類統計:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"    {cat}: {count} 個")
    print()

    # 語意分段
    print("步驟 2/3: 語意分段（首次執行需下載模型，約 500MB）...")
    print()

    try:
        chunks = chunk_all_documents(documents)
        print(f"\n  分段完成！{len(documents)} 個文件 → {len(chunks)} 個語意 chunks")
        print(f"  平均每文件 {len(chunks) / len(documents):.1f} 個 chunks")
    except Exception as e:
        print(f"\n語意分段失敗: {e}")
        import traceback
        traceback.print_exc()
        return 1

    print()

    # 建立索引
    print("步驟 3/3: 建立向量索引...")
    print()

    try:
        index_documents(chunks, PERSIST_DIR)
    except Exception as e:
        print(f"\n建立索引失敗: {e}")
        import traceback
        traceback.print_exc()
        return 1

    print()
    print("=" * 50)
    print("✅ 索引建立完成！")
    print(f"   索引位置: {PERSIST_DIR}")
    print(f"   原始文件: {len(documents)} 個")
    print(f"   語意 chunks: {len(chunks)} 個")
    print("=" * 50)

    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
