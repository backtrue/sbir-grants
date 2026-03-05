#!/usr/bin/env python3
"""
提取 .doc 文件內容的腳本
"""

import sys
import os

# 嘗試使用 python-docx (只支援 .docx)
# 如果是舊的 .doc 格式，需要其他方法

file_path = "references/real/臺北市產業發展研發補助計畫書_大規模文創有限公司.doc"

# 方法1: 嘗試用 antiword (如果有安裝)
import subprocess

try:
    result = subprocess.run(
        ["antiword", file_path],
        capture_output=True,
        text=True,
        timeout=10
    )
    
    if result.returncode == 0:
        print(result.stdout[:10000])  # 前 10000 字符
    else:
        print("antiword 失敗，嘗試其他方法...")
        
        # 方法2: 嘗試用 catdoc
        result2 = subprocess.run(
            ["catdoc", file_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result2.returncode == 0:
            print(result2.stdout[:10000])
        else:
            print("無法讀取 .doc 文件")
            print("請手動轉換為 .docx 或 .txt 格式")
            
except FileNotFoundError as e:
    print(f"工具未安裝: {e}")
    print("建議: brew install antiword 或 brew install catdoc")
except Exception as e:
    print(f"錯誤: {e}")
