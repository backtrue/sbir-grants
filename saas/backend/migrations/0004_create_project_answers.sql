-- Create normalized project_answers table for decoupled semantic chunking
CREATE TABLE project_answers (
    project_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    chunking_status TEXT DEFAULT 'pending', -- 'pending', 'syncing', 'completed', 'failed'
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, question_id)
);

-- Index the status to quickly find unchunked answers in background workers
CREATE INDEX idx_project_answers_status ON project_answers(chunking_status);
