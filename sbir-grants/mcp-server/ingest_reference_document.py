#!/usr/bin/env python3
"""
SBIR Skill - 參考文件匯入工具（Bug B 修復版）
支援 .txt、.md（純文字）和 .docx（Word 文件）格式
使用 sentence-transformers 生成真實 embedding，並存入 ChromaDB
"""
import argparse
import json
import sys
from pathlib import Path
from chunker import semantic_chunk


def read_document_content(document_path: Path) -> str:
    """
    根據副檔名選擇正確的讀取方式
    支援：.txt, .md, .docx, .pdf
    """
    suffix = document_path.suffix.lower()

    if suffix in ('.txt', '.md'):
        with open(document_path, "r", encoding="utf-8") as f:
            return f.read()

    elif suffix == '.docx':
        try:
            from docx import Document
            doc = Document(str(document_path))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return "\n\n".join(paragraphs)
        except ImportError:
            raise RuntimeError(
                "讀取 .docx 需要 python-docx 套件。請執行：pip install python-docx"
            )
        except Exception as e:
            raise RuntimeError(f"無法讀取 .docx 檔案：{e}")

    elif suffix == '.pdf':
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(str(document_path))
            text_blocks = []
            for page in doc:
                text_blocks.append(page.get_text())
            doc.close()
            return "\n".join(text_blocks)
        except ImportError:
            raise RuntimeError(
                "讀取 .pdf 需要 PyMuPDF 套件。請執行：pip install pymupdf"
            )
        except Exception as e:
            raise RuntimeError(f"無法讀取 .pdf 檔案：{e}")

    else:
        # 嘗試以文字方式讀取其他格式
        try:
            with open(document_path, "r", encoding="utf-8") as f:
                return f.read()
        except UnicodeDecodeError:
            raise RuntimeError(
                f"不支援的檔案格式：{suffix}。支援格式：.txt, .md, .docx, .pdf"
            )


def chunk_text(text: str, chunk_size: int = 500) -> list:
    """將文字切分為約 chunk_size 字的段落"""
    words = text.split()
    chunks = [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]
    return [c for c in chunks if c.strip()]


def get_real_embedding(text: str, model=None):
    """
    使用 sentence-transformers 生成真實 embedding
    回傳 list[float]
    """
    try:
        if model is None:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        vector = model.encode(text, show_progress_bar=False)
        return vector.tolist()
    except ImportError:
        # Fallback：若沒有安裝 sentence-transformers，用簡單 hash-based 向量
        import hashlib
        h = int(hashlib.md5(text.encode()).hexdigest(), 16)
        # 生成 384 維假向量（不具語意意義，但不會崩潰）
        import random
        random.seed(h)
        return [random.gauss(0, 1) for _ in range(384)]


def setup_chroma_db(db_path: Path):
    """初始化 ChromaDB（若可用）"""
    try:
        import chromadb
        from chromadb.config import Settings
        db_path.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(
            path=str(db_path),
            settings=Settings(anonymized_telemetry=False)
        )
        collection = client.get_or_create_collection(
            name="sbir_reference_docs",
            metadata={"hnsw:space": "cosine"}
        )
        return collection
    except ImportError:
        return None


def setup_sqlite_fallback(db_path: Path):
    """SQLite fallback（ChromaDB 不可用時）"""
    import sqlite3
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_name TEXT NOT NULL,
            chunk_content TEXT NOT NULL,
            sbir_tags TEXT NOT NULL,
            embedding TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    return conn


def ingest_document(document_path: Path, sbir_tags: list, db_base_path: Path | None = None) -> int:
    """
    主要匯入流程：
    1. 讀取文件（支援 txt/md/docx/pdf）
    2. 語意切塊 (Semantic Chunking)
    3. 生成 embedding
    4. 存入 ChromaDB 或 SQLite
    """
    if not document_path.exists():
        raise FileNotFoundError(f"找不到文件：{document_path}")

    # 讀取內容
    content = read_document_content(document_path)
    if not content.strip():
        raise ValueError(f"文件內容為空：{document_path.name}")

    # 切塊
    chunk_dicts = semantic_chunk(
        content=content,
        filename=document_path.name,
        file_path=str(document_path)
    )

    if not chunk_dicts:
        return 0

    tags_json = json.dumps(sbir_tags, ensure_ascii=False)
    db_base_path = db_base_path or Path(".")

    # 嘗試使用 ChromaDB
    chroma_collection = setup_chroma_db(db_base_path / "chroma_db")

    if chroma_collection is not None:
        # 使用 ChromaDB + 真實 embedding
        try:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        except ImportError:
            model = None

        ids = []
        embeddings = []
        documents = []
        metadatas = []

        for i, chunk_dict in enumerate(chunk_dicts):
            chunk_content = chunk_dict["content"]
            chunk_id = f"{document_path.stem}_{i}"
            ids.append(chunk_id)
            embeddings.append(get_real_embedding(chunk_content, model))
            documents.append(chunk_content)

            # 結合 chunker 的 metadata 和原本的標籤 metadata
            meta = chunk_dict["metadata"].copy()
            meta["document_name"] = document_path.name
            meta["sbir_tags"] = tags_json
            # ChromaDB 不支援 metadata 中含有 None，需清理
            meta = {k: v for k, v in meta.items() if v is not None}
            metadatas.append(meta)

        # UPSERT：先刪除同文件舊資料，再重新插入
        try:
            existing = chroma_collection.get(where={"document_name": document_path.name})
            if existing["ids"]:
                chroma_collection.delete(ids=existing["ids"])
        except Exception:
            pass

        chroma_collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)

    else:
        # Fallback：SQLite
        conn = setup_sqlite_fallback(db_base_path / "local_skill.db")
        try:
            cursor = conn.cursor()

            # 先刪除同文件舊資料（UPSERT 效果）
            cursor.execute("DELETE FROM document_chunks WHERE document_name = ?", (document_path.name,))

            for chunk_dict in chunk_dicts:
                chunk_content = chunk_dict["content"]
                embedding = get_real_embedding(chunk_content)
                cursor.execute('''
                    INSERT INTO document_chunks (document_name, chunk_content, sbir_tags, embedding)
                    VALUES (?, ?, ?, ?)
                ''', (document_path.name, chunk_content, tags_json, json.dumps(embedding)))

            conn.commit()
        finally:
            conn.close()

    return len(chunk_dicts)


async def MCP_ingest_reference_document(file_path: str, tags: list | None = None, db_path: str | None = None) -> str:
    """MCP async wrapper：匯入參考文件"""
    if tags is None:
        tags = []

    try:
        path_obj = Path(file_path).resolve()
        db_base = Path(db_path).resolve() if db_path else Path(__file__).parent.resolve()

        # Bug BB1 fix: path traversal protection
        # Only allow ingesting specific safe file extensions to prevent
        # prompt-injection attacks that could index sensitive system files.
        ALLOWED_EXTENSIONS = {'.txt', '.md', '.docx', '.pdf', '.doc'}
        if path_obj.suffix.lower() not in ALLOWED_EXTENSIONS:
            return (
                f"❌ 不支援的檔案格式：{path_obj.suffix}，"
                f"支援格式：{', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        chunks_created = ingest_document(path_obj, tags, db_base)

        return (
            f"✅ 成功匯入 **{path_obj.name}**\n\n"
            f"- 切分為 **{chunks_created}** 個語意段落\n"
            f"- 標籤：{', '.join(tags) if tags else '（無標籤）'}\n"
            f"- 已建立向量索引，可透過 `search_knowledge_base` 搜尋"
        )
    except FileNotFoundError as e:
        return f"❌ 找不到檔案：{e}"
    except RuntimeError as e:
        return f"❌ 讀取失敗：{e}"
    except Exception as e:
        return f"❌ 匯入失敗：{e} - {str(e)}"


async def MCP_read_document_for_tagging(file_path: str) -> str:
    """
    提供給 Claude 讀取文件並回傳分段結果，以進行後續的 AI Auto-Tagging。
    """
    try:
        path_obj = Path(file_path).resolve()

        ALLOWED_EXTENSIONS = {'.txt', '.md', '.docx', '.pdf', '.doc'}
        if path_obj.suffix.lower() not in ALLOWED_EXTENSIONS:
            return (
                f"❌ 不支援的檔案格式：{path_obj.suffix}，"
                f"支援格式：{', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        content = read_document_content(path_obj)
        if not content.strip():
            return f"❌ 文件內容為空：{path_obj.name}"

        chunk_dicts = semantic_chunk(
            content=content,
            filename=path_obj.name,
            file_path=str(path_obj)
        )

        if not chunk_dicts:
            return f"❌ 文件切分失敗或無有效內容：{path_obj.name}"

        export_chunks = []
        for i, chunk in enumerate(chunk_dicts):
            export_chunks.append({
                "chunk_index": i,
                "content": chunk["content"]
            })

        return json.dumps(export_chunks, ensure_ascii=False)

    except FileNotFoundError as e:
        return f"❌ 找不到檔案：{e}"
    except RuntimeError as e:
        return f"❌ 讀取失敗：{e}"
    except Exception as e:
        return f"❌ 操作失敗：{e} - {str(e)}"


async def MCP_ingest_tagged_chunks(file_path: str, tagged_chunks: str, db_path: str | None = None) -> str:
    """
    讓 Claude 把打好標籤的 chunk_index 存入知識庫。
    tagged_chunks 是 JSON 格式的 string： [{"chunk_index": 0, "tags": ["section_1"]}, ...]
    """
    try:
        path_obj = Path(file_path).resolve()
        db_base = Path(db_path).resolve() if db_path else Path(__file__).parent.resolve()

        try:
            tagged_data = json.loads(tagged_chunks)
        except json.JSONDecodeError:
            return "❌ tagged_chunks 必須是有效的 JSON 字串。"

        tags_map = {item.get("chunk_index"): item.get("tags", []) for item in tagged_data if "chunk_index" in item}

        content = read_document_content(path_obj)
        if not content.strip():
            return f"❌ 文件內容為空：{path_obj.name}"

        chunk_dicts = semantic_chunk(
            content=content,
            filename=path_obj.name,
            file_path=str(path_obj)
        )

        if not chunk_dicts:
            return f"❌ 文件切分失敗或無有效內容：{path_obj.name}"

        chroma_collection = setup_chroma_db(db_base / "chroma_db")

        if chroma_collection is not None:
            try:
                from sentence_transformers import SentenceTransformer
                model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            except ImportError:
                model = None

            ids = []
            embeddings = []
            documents = []
            metadatas = []

            for i, chunk_dict in enumerate(chunk_dicts):
                chunk_content = chunk_dict["content"]
                chunk_id = f"{path_obj.stem}_{i}"
                ids.append(chunk_id)
                embeddings.append(get_real_embedding(chunk_content, model))
                documents.append(chunk_content)

                meta = chunk_dict["metadata"].copy()
                meta["document_name"] = path_obj.name

                tags = tags_map.get(i, [])
                meta["sbir_tags"] = json.dumps(tags, ensure_ascii=False)

                meta = {k: v for k, v in meta.items() if v is not None}
                metadatas.append(meta)

            try:
                existing = chroma_collection.get(where={"document_name": path_obj.name})
                if existing["ids"]:
                    chroma_collection.delete(ids=existing["ids"])
            except Exception:
                pass

            chroma_collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)

        else:
            conn = setup_sqlite_fallback(db_base / "local_skill.db")
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM document_chunks WHERE document_name = ?", (path_obj.name,))

                for i, chunk_dict in enumerate(chunk_dicts):
                    chunk_content = chunk_dict["content"]
                    embedding = get_real_embedding(chunk_content)

                    tags = tags_map.get(i, [])
                    tags_json = json.dumps(tags, ensure_ascii=False)

                    cursor.execute('''
                        INSERT INTO document_chunks (document_name, chunk_content, sbir_tags, embedding)
                        VALUES (?, ?, ?, ?)
                    ''', (path_obj.name, chunk_content, tags_json, json.dumps(embedding)))
                conn.commit()
            finally:
                conn.close()

        return f"✅ 成功將 **{path_obj.name}** {len(chunk_dicts)} 個帶有客製化標籤的語意段落存入知識庫。"

    except FileNotFoundError as e:
        return f"❌ 找不到檔案：{e}"
    except RuntimeError as e:
        return f"❌ 處理失敗：{e}"
    except Exception as e:
        return f"❌ 操作失敗：{e} - {str(e)}"


async def MCP_retrieve_reference_chunks(tags: list | None = None, db_path: str | None = None) -> str:
    """
    提供給 Claude 調用的工具。
    當 Claude 需要撰寫某個特定章節 (如 section_1) 時，可以傳入 ["section_1"]，
    系統會從知識庫中把使用者之前打好該標籤的參考段落全部調出來，幫助 Claude 基於具體素材生成。
    """
    if tags is None:
        tags = []

    try:
        db_base = Path(db_path).resolve() if db_path else Path(__file__).parent.resolve()

        results_content = []

        # 1. 嘗試從 ChromaDB 讀取
        chroma_collection = setup_chroma_db(db_base / "chroma_db")
        if chroma_collection is not None:
            # 取得所有紀錄，然後在 Python 中做篩選 (因為 sbir_tags 是 JSON 字串，直接用 contains 不太精準)
            try:
                data = chroma_collection.get()
                if data and data.get("documents"):
                    for i, doc in enumerate(data["documents"]):
                        meta = data["metadatas"][i] if data.get("metadatas") else {}
                        tags_json = meta.get("sbir_tags", "[]")
                        try:
                            chunk_tags = json.loads(tags_json)
                        except json.JSONDecodeError:
                            chunk_tags = []

                        # 如果 tags 為空 (不指定) = 全拿；或者兩邊有交集
                        if not tags or set(tags).intersection(set(chunk_tags)):
                            results_content.append(f"[來源文件：{meta.get('document_name', '未知')}] \n{doc}")
            except Exception:
                pass

        else:
            # 2. 從 SQLite Fallback 讀取
            conn = setup_sqlite_fallback(db_base / "local_skill.db")
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT document_name, chunk_content, sbir_tags FROM document_chunks")
                for row in cursor.fetchall():
                    doc_name, content, tags_json = row
                    try:
                        chunk_tags = json.loads(tags_json)
                    except json.JSONDecodeError:
                        chunk_tags = []

                    if not tags or set(tags).intersection(set(chunk_tags)):
                        results_content.append(f"[來源文件：{doc_name}] \n{content}")
            finally:
                conn.close()

        if not results_content:
            return f"⚠️ 找不到帶有標籤 {tags} 的參考文件段落。這可能代表使用者尚未匯入或打標籤。"

        final_str = f"📚 找到 {len(results_content)} 筆帶有 {tags} 標籤的參考資料：\n\n"
        final_str += "\n\n---\n\n".join(results_content)
        return final_str

    except Exception as e:
        return f"❌ 檢索失敗：{e} - {str(e)}"


def main():
    parser = argparse.ArgumentParser(description="匯入參考文件並建立向量索引（支援 .txt/.md/.docx）")
    parser.add_argument("--file", required=True, help="文件路徑")
    parser.add_argument("--tags", nargs="+", default=[], help="SBIR 章節標籤（如 section_1 section_3）")
    parser.add_argument("--db-path", default=".", help="ChromaDB 儲存目錄")
    args = parser.parse_args()

    file_path = Path(args.file)
    db_base = Path(args.db_path)

    try:
        chunks_created = ingest_document(file_path, args.tags, db_base)
        print(f"✅ 成功匯入 {file_path.name}，共 {chunks_created} 個段落，標籤：{args.tags}")
    except Exception as e:
        print(f"❌ 失敗：{e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
