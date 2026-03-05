-- Migration: 0007 — Document Processing Pipeline
-- Adds extraction status tracking to documents table
-- Creates document_chunks table for extracted + classified text segments

ALTER TABLE documents ADD COLUMN extraction_status TEXT DEFAULT 'pending';
-- 'pending' | 'processing' | 'done' | 'failed'

ALTER TABLE documents ADD COLUMN extraction_error TEXT;

-- Stores semantically-chunked text extracted from uploaded documents.
-- Independent from project_answers — AI generation reads from both.
CREATE TABLE document_chunks (
    id           TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    chunk_index  INTEGER NOT NULL,
    chunk_text   TEXT NOT NULL,
    section_tags TEXT NOT NULL DEFAULT '[]',  -- JSON array of section indices, e.g. [1, 3]
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX idx_doc_chunks_project  ON document_chunks(project_id);
CREATE INDEX idx_doc_chunks_document ON document_chunks(document_id);
