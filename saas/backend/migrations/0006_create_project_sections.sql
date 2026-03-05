CREATE TABLE project_sections (
  project_id TEXT NOT NULL,
  section_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'empty',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, section_index),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
