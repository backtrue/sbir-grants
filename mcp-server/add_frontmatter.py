#!/usr/bin/env python3
"""
批次為知識庫文件加入 frontmatter
"""

import os
import glob

# Frontmatter 模板
FRONTMATTER_TEMPLATE = """---
source_url: https://www.sbir.org.tw/
source_title: {title}
source_date: 2026-01-01
---

"""

def add_frontmatter(file_path):
    """為單個文件加入 frontmatter"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 檢查是否已有 frontmatter
        if content.strip().startswith('---'):
            print(f"⏭️  跳過（已有 frontmatter）: {os.path.basename(file_path)}")
            return False
        
        # 提取第一行作為標題
        first_line = content.split('\n')[0]
        if first_line.startswith('# '):
            title = first_line[2:].strip()
        else:
            title = os.path.basename(file_path).replace('.md', '').replace('_', ' ')
        
        # 加入 frontmatter
        new_content = FRONTMATTER_TEMPLATE.format(title=f"SBIR {title}") + content
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print(f"✅ 已加入: {os.path.basename(file_path)}")
        return True
        
    except Exception as e:
        print(f"❌ 錯誤 {os.path.basename(file_path)}: {e}")
        return False

def main():
    """主函數"""
    print("=" * 60)
    print("批次加入 Frontmatter")
    print("=" * 60)
    print()
    
    # 處理 references 目錄
    references_dir = os.path.join(os.path.dirname(__file__), '..', 'references')
    md_files = glob.glob(os.path.join(references_dir, '*.md'))
    
    # 也處理子目錄
    md_files.extend(glob.glob(os.path.join(references_dir, '**', '*.md'), recursive=True))
    
    total = len(md_files)
    added = 0
    skipped = 0
    
    for file_path in sorted(md_files):
        if add_frontmatter(file_path):
            added += 1
        else:
            skipped += 1
    
    print()
    print("=" * 60)
    print(f"完成！")
    print(f"  總計: {total} 個文件")
    print(f"  已加入: {added} 個")
    print(f"  跳過: {skipped} 個")
    print("=" * 60)

if __name__ == "__main__":
    main()
