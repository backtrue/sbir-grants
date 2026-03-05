-- Migration number: 0003
-- Adds a chunking_status column to track the background semantic chunking process
ALTER TABLE projects ADD COLUMN chunking_status TEXT DEFAULT 'pending';
