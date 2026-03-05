"""
向量搜尋服務 - RAG 語意搜尋核心模組

使用 ChromaDB + sentence-transformers 實現語意搜尋
"""

import os


# 懶加載的全域變數
_chroma_client = None
_embedding_model = None
_rerank_model = None
_collection = None

# 配置
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'
COLLECTION_NAME = 'sbir_knowledge_base'


def get_embedding_model():
    """懶加載 Embedding 模型"""
    global _embedding_model
    if _embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            print(f"正在載入 Embedding 模型: {MODEL_NAME}")
            _embedding_model = SentenceTransformer(MODEL_NAME)
            print("Embedding 模型載入完成")
        except Exception as e:
            print(f"載入 Embedding 模型失敗: {e}")
            raise
    return _embedding_model


def get_chroma_client(persist_directory: str):
    """懶加載 ChromaDB 客戶端"""
    global _chroma_client
    if _chroma_client is None:
        try:
            import chromadb
            from chromadb.config import Settings

            # 確保目錄存在
            os.makedirs(persist_directory, exist_ok=True)

            _chroma_client = chromadb.PersistentClient(
                path=persist_directory,
                settings=Settings(anonymized_telemetry=False)
            )
            print(f"ChromaDB 客戶端初始化完成: {persist_directory}")
        except Exception as e:
            print(f"初始化 ChromaDB 失敗: {e}")
            raise
    return _chroma_client


def get_collection(persist_directory: str):
    """獲取或創建 collection"""
    global _collection
    if _collection is None:
        client = get_chroma_client(persist_directory)
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )
    return _collection


def index_documents(documents: list, persist_directory: str):
    """
    建立文件索引

    documents: [
        {
            "id": "references/sbir_guidelines.md",
            "content": "文件內容...",
            "metadata": {"category": "guidelines", "filename": "sbir_guidelines.md"}
        },
        ...
    ]
    """
    collection = get_collection(persist_directory)
    model = get_embedding_model()

    # 分批處理，避免記憶體不足
    batch_size = 10
    total = len(documents)

    for i in range(0, total, batch_size):
        batch = documents[i:i + batch_size]

        ids = [doc["id"] for doc in batch]
        contents = [doc["content"] for doc in batch]
        metadatas = [doc.get("metadata", {}) for doc in batch]

        # 生成 embeddings
        embeddings = model.encode(contents, show_progress_bar=False).tolist()

        # 檢查是否已存在，如果存在就更新
        existing_ids = set()
        try:
            existing = collection.get(ids=ids)
            existing_ids = set(existing['ids'])
        except Exception:
            pass

        # 先刪除已存在的
        if existing_ids:
            collection.delete(ids=list(existing_ids))

        # 新增到 collection
        collection.add(
            ids=ids,
            documents=contents,
            embeddings=embeddings,
            metadatas=metadatas
        )

        print(f"已索引 {min(i + batch_size, total)}/{total} 個文件")

    print(f"\n索引建立完成！共 {total} 個文件")


def semantic_search(query: str, persist_directory: str, n_results: int = 10) -> list:
    """
    語意搜尋

    Returns: [
        {
            "id": "file_path",
            "content": "文件內容片段",
            "distance": 0.123,
            "similarity": 0.877,
            "metadata": {...}
        },
        ...
    ]
    """
    collection = get_collection(persist_directory)
    model = get_embedding_model()

    # 檢查是否有索引
    if collection.count() == 0:
        print("警告：索引為空，請先執行 build_index.py")
        return []

    # 生成查詢向量
    query_embedding = model.encode([query], show_progress_bar=False)[0].tolist()

    # 執行搜尋
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        include=["documents", "metadatas", "distances"]
    )

    # 格式化結果
    formatted_results = []
    if results['ids'] and results['ids'][0]:
        for i in range(len(results['ids'][0])):
            distance = results['distances'][0][i] if results['distances'] else 0
            similarity = 1 - distance  # cosine distance 轉為 similarity

            # 過濾掉完全不相關的結果 (閾值 0.25 可根據 embeddings 模型調整)
            if similarity < 0.25:
                continue

            formatted_results.append({
                "id": results['ids'][0][i],
                "content": results['documents'][0][i][:2000] + "..." if results['documents'] else "",
                "distance": distance,
                "similarity": similarity,
                "metadata": results['metadatas'][0][i] if results['metadatas'] else {}
            })

    return formatted_results


def get_index_count(persist_directory: str) -> int:
    """獲取索引文件數量"""
    try:
        collection = get_collection(persist_directory)
        return collection.count()
    except Exception:
        return 0


def needs_reindex(persist_directory: str) -> bool:
    """檢查是否需要重新建立索引"""
    return get_index_count(persist_directory) == 0


def get_rerank_model():
    """懶加載 Re-ranking 模型"""
    global _rerank_model
    if _rerank_model is None:
        try:
            from sentence_transformers import CrossEncoder
            model_name = "cross-encoder/ms-marco-MiniLM-L-6-v2"
            print(f"正在載入 Re-ranking 模型: {model_name}")
            _rerank_model = CrossEncoder(model_name)
            print("Re-ranking 模型載入完成")
        except Exception as e:
            print(f"載入 Re-ranking 模型失敗: {e}")
            return None
    return _rerank_model


def rerank_results(query: str, results: list, top_k: int = 5) -> list:
    """對搜尋結果進行重排序 (Cross-Encoder)"""
    model = get_rerank_model()

    if model is None or not results:
        return results[:top_k]

    try:
        pairs = []
        for r in results:
            content = r.get('content', '')
            pairs.append([query, content[:500]])

        scores = model.predict(pairs)

        for i, score in enumerate(scores):
            results[i]['rerank_score'] = float(score)

        results.sort(key=lambda x: x.get('rerank_score', -999), reverse=True)
        return results[:top_k]

    except Exception as e:
        print(f"Re-ranking 失敗: {e}")
        return results[:top_k]


def mmr_sort(results: list, lambda_param: float = 0.7) -> list:
    """MMR 多樣性排序"""
    if not results:
        return []

    selected: list[dict] = []
    candidates = results.copy()

    while len(selected) < len(results):
        best_score = -float('inf')
        best_idx = -1

        for i, candidate in enumerate(candidates):
            if 'rerank_score' in candidate:
                relevance = candidate['rerank_score']
            elif 'similarity' in candidate:
                relevance = candidate['similarity'] * 10
            else:
                relevance = candidate.get('final_score', 0) * 10

            diversity_penalty = 0
            if selected:
                candidate_path = candidate.get('metadata', {}).get('file_path') or candidate.get('path')
                for sel in selected:
                    sel_path = sel.get('metadata', {}).get('file_path') or sel.get('path')
                    if candidate_path and sel_path and candidate_path == sel_path:
                        diversity_penalty += 1

            mmr_score = relevance - (diversity_penalty * (1 - lambda_param) * 5)

            if mmr_score > best_score:
                best_score = mmr_score
                best_idx = i

        if best_idx != -1:
            selected.append(candidates.pop(best_idx))

    return selected
