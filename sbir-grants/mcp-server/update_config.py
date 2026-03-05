"""
SBIR Skill - Claude Desktop 設定檔更新工具
用於安全地合併 MCP Server 設定，不會覆蓋現有設定
"""

import json
import os
import sys


def update_config(config_file: str, python_exe: str, server_script: str) -> bool:
    """
    更新 Claude Desktop 設定檔，添加 sbir-ai-copilot MCP Server

    Args:
        config_file: 設定檔路徑
        python_exe: Python 執行檔路徑
        server_script: server.py 路徑

    Returns:
        True if successful, False otherwise
    """
    try:
        # 讀取現有設定
        config = {}
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:
                        config = json.loads(content)
            except (json.JSONDecodeError, IOError) as e:
                print(f"Warning: Could not read existing config: {e}")
                config = {}

        # 確保 mcpServers 存在
        if 'mcpServers' not in config or config['mcpServers'] is None:
            config['mcpServers'] = {}

        # 添加或更新 sbir-ai-copilot（不影響其他 MCP Server）
        config['mcpServers']['sbir-ai-copilot'] = {
            'command': python_exe,
            'args': [server_script]
        }

        # 寫入設定檔
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

        return True

    except Exception as e:
        print(f"Error: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python update_config.py <config_file> <python_exe> <server_script>")
        sys.exit(1)

    config_file = sys.argv[1]
    python_exe = sys.argv[2]
    server_script = sys.argv[3]

    if update_config(config_file, python_exe, server_script):
        print("Config updated successfully")
        sys.exit(0)
    else:
        sys.exit(1)
