"""
語意分段器 (Semantic Chunker)

使用 embedding 相似度偵測語意邊界，實現真正的語意分段
"""

import re
import numpy as np
from typing import Optional, Dict, Tuple

# 懶加載的全域變數
_embedding_model = None


def get_embedding_model():
    """懶加載 Embedding 模型"""
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        print("正在載入 Embedding 模型...")
        _embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        print("Embedding 模型載入完成")
    return _embedding_model


def extract_frontmatter(content: str) -> Tuple[Dict, str]:
    """
    提取 YAML frontmatter
    
    Returns:
        (frontmatter_dict, content_without_frontmatter)
    """
    frontmatter = {}
    
    if content.strip().startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            try:
                import yaml
                frontmatter = yaml.safe_load(parts[1]) or {}
            except Exception as e:
                print(f"Warning: Failed to parse frontmatter: {e}")
            content = parts[2].strip()
    
    return frontmatter, content


def split_chinese_sentences(text: str) -> list[str]:
    """
    中文分句
    按句號、問號、驚嘆號、換行進行分句
    """
    # 先處理 Markdown 標題，保持為獨立句子
    text = re.sub(r'^(#{1,6}\s+.+)$', r'\1。', text, flags=re.MULTILINE)
    
    # 按中文/英文標點分句
    pattern = r'[。！？!?\n]+'
    sentences = re.split(pattern, text)
    
    # 清理並過濾
    result = []
    for s in sentences:
        s = s.strip()
        # 過濾太短或只有符號的句子
        if len(s) >= 10:  # 至少 10 個字符
            result.append(s)
    
    return result


def cosine_similarity(v1, v2):
    """計算兩個向量的餘弦相似度"""
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))


def find_semantic_boundaries(embeddings: np.ndarray, threshold_percentile: int = 15) -> list[int]:
    """
    找出語意邊界點
    
    使用百分位數閾值：相似度最低的 N% 作為分段點
    """
    if len(embeddings) <= 1:
        return []
    
    # 計算相鄰句子的相似度
    similarities = []
    for i in range(len(embeddings) - 1):
        sim = cosine_similarity(embeddings[i], embeddings[i + 1])
        similarities.append(sim)
    
    if not similarities:
        return []
    
    # 找出相似度最低的 N% 作為分段點
    threshold = np.percentile(similarities, threshold_percentile)
    
    boundaries = []
    for i, sim in enumerate(similarities):
        if sim < threshold:
            boundaries.append(i + 1)  # 分段點在下一個句子之前
    
    return boundaries


def semantic_chunk(
    content: str,
    filename: str,
    file_path: str,
    min_chunk_size: int = 50,      # 降低最小大小
    max_chunk_size: int = 800,      # 降低最大大小，確保每個 chunk 較小
    threshold_percentile: int = 25  # 提高閾值百分比，產生更多分段點
) -> list[dict]:
    """
    真正的語意分段 - 確保每個 chunk 能獨立回答問題
    
    Args:
        content: 文件內容
        filename: 文件名
        file_path: 文件相對路徑
        min_chunk_size: 最小 chunk 大小（字符）
        max_chunk_size: 最大 chunk 大小（字符）
        threshold_percentile: 語意邊界閾值（百分位數，越高 = 越多 chunks）
    
    Returns:
        list of chunks with metadata
    """
    # 0. 提取 frontmatter
    frontmatter, content = extract_frontmatter(content)
    
    # 1. 分句
    sentences = split_chinese_sentences(content)
    
    if len(sentences) <= 1:
        # 太短的文件直接作為一個 chunk
        return [{
            "id": f"{file_path}::0",
            "content": content.strip(),
            "metadata": {
                "file": filename,
                "file_path": file_path,
                "chunk_index": 0,
                "total_chunks": 1,
                "source_url": frontmatter.get("source_url"),
                "source_title": frontmatter.get("source_title"),
                "source_date": frontmatter.get("source_date")
            }
        }]
    
    # 2. 計算 embeddings
    model = get_embedding_model()
    embeddings = model.encode(sentences, show_progress_bar=False)
    
    # 3. 找語意邊界
    boundaries = find_semantic_boundaries(embeddings, threshold_percentile)
    
    # 4. 建立 chunks
    chunk_starts = [0] + boundaries
    chunk_ends = boundaries + [len(sentences)]
    
    raw_chunks = []
    for start, end in zip(chunk_starts, chunk_ends):
        chunk_text = '\n'.join(sentences[start:end])
        raw_chunks.append(chunk_text)
    
    # 5. 合併太小的 chunks
    merged_chunks = []
    buffer = ""
    
    for chunk_text in raw_chunks:
        if len(buffer) + len(chunk_text) < min_chunk_size:
            # 合併到 buffer
            buffer = buffer + "\n" + chunk_text if buffer else chunk_text
        else:
            # 先處理 buffer
            if buffer:
                if len(buffer) >= min_chunk_size:
                    merged_chunks.append(buffer)
                else:
                    # buffer 太小，合併到當前 chunk
                    chunk_text = buffer + "\n" + chunk_text
                buffer = ""
            
            # 處理當前 chunk
            if len(chunk_text) > max_chunk_size:
                # 太大，強制分割（按句子）
                current = ""
                for sentence in chunk_text.split('\n'):
                    if len(current) + len(sentence) > max_chunk_size:
                        if current:
                            merged_chunks.append(current)
                        current = sentence
                    else:
                        current = current + "\n" + sentence if current else sentence
                if current:
                    merged_chunks.append(current)
            else:
                merged_chunks.append(chunk_text)
    
    # 處理最後的 buffer
    if buffer:
        if merged_chunks and len(buffer) < min_chunk_size:
            merged_chunks[-1] = merged_chunks[-1] + "\n" + buffer
        else:
            merged_chunks.append(buffer)
    
    # 6. 格式化輸出
    result = []
    total_chunks = len(merged_chunks)
    
    for i, chunk_text in enumerate(merged_chunks):
        # 提取首行作為摘要（通常是標題）
        first_line = chunk_text.split('\n')[0][:50]
        
        result.append({
            "id": f"{file_path}::chunk_{i}",
            "content": chunk_text.strip(),
            "metadata": {
                "file": filename,
                "file_path": file_path,
                "chunk_index": i,
                "total_chunks": total_chunks,
                "preview": first_line,
                "source_url": frontmatter.get("source_url"),
                "source_title": frontmatter.get("source_title"),
                "source_date": frontmatter.get("source_date")
            }
        })
    
    return result


def chunk_all_documents(documents: list[dict]) -> list[dict]:
    """
    對所有文件進行語意分段
    
    Args:
        documents: [{"id": "path", "content": "...", "metadata": {...}}, ...]
    
    Returns:
        chunked documents
    """
    all_chunks = []
    
    for i, doc in enumerate(documents):
        file_path = doc["id"]
        filename = doc["metadata"].get("filename", file_path.split("/")[-1])
        content = doc["content"]
        
        print(f"  分段中 ({i+1}/{len(documents)}): {filename}")
        
        chunks = semantic_chunk(
            content=content,
            filename=filename,
            file_path=file_path
        )
        
        all_chunks.extend(chunks)
    
    return all_chunks


if __name__ == "__main__":
    # 測試
    test_text = """
# SBIR 申請資格

## 基本條件

SBIR 計畫要求申請企業必須符合中小企業認定標準。
具體來說，實收資本額必須在新台幣 1 億元以下。
或者經常僱用員工數未滿 200 人。

## 排除條件

以下情況不得申請 SBIR：
陸資企業不得申請。
外商分公司不得申請。
近 5 年內有政府計畫重大違約紀錄者不得申請。

## 申請流程

首先需要確認資格。
然後準備計畫書。
最後提交線上申請。
"""
    
    chunks = semantic_chunk(
        content=test_text,
        filename="test.md",
        file_path="test/test.md"
    )
    
    print(f"\n分段結果：{len(chunks)} 個 chunks")
    for i, chunk in enumerate(chunks):
        print(f"\n--- Chunk {i} ---")
        print(f"ID: {chunk['id']}")
        print(f"Preview: {chunk['metadata']['preview']}")
        print(f"Content ({len(chunk['content'])} chars):")
        print(chunk['content'][:200] + "..." if len(chunk['content']) > 200 else chunk['content'])
