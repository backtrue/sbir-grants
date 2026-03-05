-- Migration: Add project_answer_vectors table for tracking Vectorize vector IDs
-- This enables proper deletion of old vectors before re-sync (Bug D fix in chunking.ts)

CREATE TABLE IF NOT EXISTS project_answer_vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    vector_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, vector_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_answer_vectors_project_id
    ON project_answer_vectors(project_id);
