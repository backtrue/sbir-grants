#!/usr/bin/env python3
import argparse
import json
import sqlite3
import sys
from pathlib import Path


def setup_database(db_path: Path):
    """Ensure the database and the table for extracted answers exist."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS extracted_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            section_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, section_id)
        )
    ''')
    conn.commit()
    return conn


def save_answers(conn, project_id: str, section_id: str, answers: list):
    """Upsert the JSON array of answers into the database."""
    cursor = conn.cursor()
    content_json = json.dumps(answers, ensure_ascii=False)

    # UPSERT: 若 (project_id, section_id) 已存在則覆寫，避免重複堆積
    cursor.execute('''
        INSERT INTO extracted_answers (project_id, section_id, content, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id, section_id)
        DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
    ''', (project_id, section_id, content_json))

    conn.commit()


async def MCP_save_extracted_answers(project_id: str, section_id: str, answers: list, db_path: str = "local_skill.db") -> str:
    """Async wrapper for MCP Server."""
    try:
        db_file = Path(db_path)
        conn = setup_database(db_file)
        try:
            save_answers(conn, project_id, section_id, answers)
        finally:
            conn.close()
        return f"Successfully saved {len(answers)} extracted answers for project '{project_id}', section '{section_id}'."
    except Exception as e:
        return f"Failed to save answers: {e}"


def main():
    parser = argparse.ArgumentParser(description="Save extracted AI answers to SQLite database.")
    parser.add_argument("--project-id", required=True, help="The ID of the project.")
    parser.add_argument("--section-id", required=True, help="The ID of the section.")
    parser.add_argument("--db-path", default="local_skill.db", help="Path to the SQLite database.")
    parser.add_argument("--input", help="JSON string containing the answers array. If omitted, reads from stdin.")

    args = parser.parse_args()

    # Read Jewish from input arg or stdin
    if args.input:
        input_data = args.input
    else:
        input_data = sys.stdin.read()

    if not input_data.strip():
        print("Error: No input data provided.", file=sys.stderr)
        sys.exit(1)

    try:
        answers = json.loads(input_data)
        if not isinstance(answers, list):
            raise ValueError("Input must be a JSON array of answers.")
    except Exception as e:
        print(f"Error parsing JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    db_path = Path(args.db_path)
    conn = setup_database(db_path)

    try:
        save_answers(conn, args.project_id, args.section_id, answers)
        print(
            f"Successfully saved {len(answers)} extracted answers for project '{args.project_id}', section '{args.section_id}'.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
