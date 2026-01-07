"""
SBIR Data MCP Server
專注於經濟部統計處官方 API

功能：
1. 經濟部統計處總體統計資料庫 API
2. 工研院 IEK、資策會 MIC 由 Claude 的 search_web 處理
"""

from mcp.server import Server
from mcp.types import Tool, TextContent
import httpx
import json
from typing import Any, Optional
from datetime import datetime
from pydantic import BaseModel

# Import proposal generator functions
try:
    from mcp_server.proposal_generator_impl import (
        start_proposal_generator,
        save_answer,
        get_progress,
        generate_proposal,
        STATE_FILE
    )
except ImportError:
    # Fallback: functions will be defined later in this file
    pass

# ============================================
# 資料模型
# ============================================

class MOEAStatData(BaseModel):
    """經濟部統計處數據格式"""
    category: str        # 類別
    period: str          # 統計期間
    value: float         # 數值
    unit: str            # 單位
    source_url: str      # 來源網址

# ============================================
# MCP Server 初始化
# ============================================

app = Server("sbir-data-server")

# ============================================
# 工具定義
# ============================================

@app.list_tools()
async def list_tools() -> list[Tool]:
    """定義可用的工具"""
    return [
        Tool(
            name="search_knowledge_base",
            description="搜尋 SBIR 知識庫中的相關文件。可搜尋方法論、FAQ、檢核清單、案例等。",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜尋關鍵字，如：創新、市場分析、經費、資格等"
                    },
                    "category": {
                        "type": "string",
                        "description": "文件類別（可選）",
                        "enum": ["methodology", "faq", "checklist", "case_study", "template", "all"],
                        "default": "all"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="read_document",
            description="讀取 SBIR 知識庫中的特定文件內容",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "文件的相對路徑，如：references/methodology_innovation.md"
                    }
                },
                "required": ["file_path"]
            }
        ),
        Tool(
            name="query_moea_statistics",
            description="查詢經濟部統計處總體統計資料庫（官方 API）。可查詢產業產值、出口、就業等數據。",
            inputSchema={
                "type": "object",
                "properties": {
                    "industry": {
                        "type": "string",
                        "description": "產業別，如：機械、化工、電子、資通訊"
                    },
                    "stat_type": {
                        "type": "string",
                        "description": "統計類型：產值、出口、就業人數",
                        "enum": ["產值", "出口", "就業人數"]
                    },
                    "start_year": {
                        "type": "integer",
                        "description": "起始年份（西元年）",
                        "default": 2020
                    },
                    "end_year": {
                        "type": "integer",
                        "description": "結束年份（西元年）",
                        "default": 2024
                    }
                },
                "required": ["industry", "stat_type"]
            }
        ),
        Tool(
            name="search_moea_website",
            description="搜尋經濟部統計處網站（當 API 無法滿足需求時使用）",
            inputSchema={
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "搜尋關鍵字"
                    }
                },
                "required": ["keyword"]
            }
        ),
        Tool(
            name="start_proposal_generator",
            description="開始互動式計畫書生成器，載入問題並初始化狀態",
            inputSchema={
                "type": "object",
                "properties": {
                    "phase": {
                        "type": "string",
                        "description": "計畫階段",
                        "enum": ["phase1", "phase2"],
                        "default": "phase1"
                    }
                },
                "required": []
            }
        ),
        Tool(
            name="save_answer",
            description="保存問答答案到狀態檔案",
            inputSchema={
                "type": "object",
                "properties": {
                    "question_id": {
                        "type": "string",
                        "description": "問題 ID"
                    },
                    "answer": {
                        "type": "string",
                        "description": "用戶的答案"
                    }
                },
                "required": ["question_id", "answer"]
            }
        ),
        Tool(
            name="get_progress",
            description="取得計畫書生成進度",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="generate_proposal",
            description="根據已回答的問題生成完整計畫書",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="update_knowledge_base",
            description="更新 SBIR 知識庫到最新版本（從 GitHub 拉取更新）",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="check_proposal",
            description="檢核 SBIR 計畫書完整度。這是自我檢查工具，用來確認計畫書是否涵蓋所有必要內容，非評審結果預測。",
            inputSchema={
                "type": "object",
                "properties": {
                    "proposal_content": {
                        "type": "string",
                        "description": "計畫書內容（全文或主要章節）"
                    },
                    "phase": {
                        "type": "string",
                        "description": "計畫階段",
                        "enum": ["phase1", "phase2"],
                        "default": "phase1"
                    }
                },
                "required": ["proposal_content"]
            }
        ),
        Tool(
            name="calculate_budget",
            description="SBIR 經費試算工具。根據計畫階段和總經費，自動建議各項經費分配比例。",
            inputSchema={
                "type": "object",
                "properties": {
                    "phase": {
                        "type": "string",
                        "description": "計畫階段",
                        "enum": ["phase1", "phase2", "phase2plus"],
                        "default": "phase1"
                    },
                    "total_budget": {
                        "type": "number",
                        "description": "計畫總經費（萬元）"
                    },
                    "project_type": {
                        "type": "string",
                        "description": "計畫類型",
                        "enum": ["技術研發", "軟體開發", "硬體開發", "服務創新"],
                        "default": "技術研發"
                    }
                },
                "required": ["total_budget"]
            }
        )
    ]

# ============================================
# 工具執行
# ============================================

@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """執行工具"""
    if name == "search_knowledge_base":
        return await search_knowledge_base(
            arguments["query"],
            arguments.get("category", "all")
        )
    elif name == "read_document":
        return await read_document(arguments["file_path"])
    elif name == "query_moea_statistics":
        return await query_moea_statistics(
            arguments["industry"],
            arguments["stat_type"],
            arguments.get("start_year", 2020),
            arguments.get("end_year", 2024)
        )
    elif name == "search_moea_website":
        return await search_moea_website(arguments["keyword"])
    elif name == "start_proposal_generator":
        return await start_proposal_generator(arguments.get("phase", "phase1"))
    elif name == "save_answer":
        return await save_answer(arguments["question_id"], arguments["answer"])
    elif name == "get_progress":
        return await get_progress()
    elif name == "generate_proposal":
        return await generate_proposal()
    elif name == "update_knowledge_base":
        return await update_knowledge_base()
    elif name == "check_proposal":
        return await check_proposal(
            arguments["proposal_content"],
            arguments.get("phase", "phase1")
        )
    elif name == "calculate_budget":
        return await calculate_budget(
            arguments["total_budget"],
            arguments.get("phase", "phase1"),
            arguments.get("project_type", "技術研發")
        )
    else:
        raise ValueError(f"Unknown tool: {name}")

# ============================================
# 核心功能：知識庫搜尋與讀取
# ============================================

import os
import glob

# 取得專案根目錄（server.py 的上一層）
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 版本檢查（每天最多檢查一次）
import time
import subprocess
LAST_VERSION_CHECK = 0
VERSION_CHECK_INTERVAL = 86400  # 24 小時

def check_for_updates() -> str | None:
    """
    檢查是否有新版本可用
    返回更新提醒訊息，如果已是最新則返回 None
    """
    global LAST_VERSION_CHECK
    
    current_time = time.time()
    
    # 每 24 小時只檢查一次
    if current_time - LAST_VERSION_CHECK < VERSION_CHECK_INTERVAL:
        return None
    
    LAST_VERSION_CHECK = current_time
    
    try:
        # 取得本地最新 commit
        local_result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=5
        )
        if local_result.returncode != 0:
            return None
        local_commit = local_result.stdout.strip()[:7]
        
        # 取得遠端最新 commit
        subprocess.run(
            ["git", "fetch", "--quiet"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            timeout=10
        )
        
        remote_result = subprocess.run(
            ["git", "rev-parse", "origin/main"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=5
        )
        if remote_result.returncode != 0:
            return None
        remote_commit = remote_result.stdout.strip()[:7]
        
        # 比較版本
        if local_commit != remote_commit:
            return f"\n\n---\n💡 **有新版本可用！** 您的版本：`{local_commit}`，最新版本：`{remote_commit}`\n請說「**更新知識庫**」來獲得最新內容。"
        
        return None
        
    except Exception:
        # 任何錯誤都靜默忽略
        return None


async def search_knowledge_base(query: str, category: str = "all") -> list[TextContent]:
    """
    搜尋 SBIR 知識庫中的相關文件
    """
    
    # 定義搜尋目錄
    search_dirs = {
        "methodology": "references/methodology_*.md",
        "faq": "faq/*.md",
        "checklist": "checklists/*.md",
        "case_study": "examples/case_studies/*.md",
        "template": "templates/*.md",
        "all": "**/*.md"
    }
    
    pattern = search_dirs.get(category, "**/*.md")
    search_path = os.path.join(PROJECT_ROOT, pattern)
    
    # 搜尋檔案
    files = glob.glob(search_path, recursive=True)
    
    # 過濾相關檔案（簡單的關鍵字匹配）
    query_lower = query.lower()
    relevant_files = []
    
    for file_path in files:
        # 檢查檔名
        file_name = os.path.basename(file_path).lower()
        relative_path = os.path.relpath(file_path, PROJECT_ROOT)
        
        # 讀取檔案內容的前幾行來判斷相關性
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read(500)  # 只讀前 500 字元
                if query_lower in file_name or query_lower in content.lower():
                    relevant_files.append({
                        "path": relative_path,
                        "name": os.path.basename(file_path),
                        "category": get_category_from_path(relative_path)
                    })
        except Exception:
            continue
    
    # 格式化結果
    if not relevant_files:
        result = f"""
## 搜尋結果

找不到與「{query}」相關的文件。

**建議**：
- 試試其他關鍵字
- 查看完整文件列表：README.md
"""
    else:
        result = f"""
## 搜尋結果：找到 {len(relevant_files)} 個相關文件

**搜尋關鍵字**：{query}

"""
        for i, file_info in enumerate(relevant_files[:10], 1):  # 最多顯示 10 個
            result += f"{i}. **{file_info['name']}**\n"
            result += f"   - 類別：{file_info['category']}\n"
            result += f"   - 路徑：`{file_info['path']}`\n"
            result += f"   - 使用 `read_document` 工具讀取此文件\n\n"
        
        if len(relevant_files) > 10:
            result += f"\n（還有 {len(relevant_files) - 10} 個相關文件未顯示）\n"
    
    # 檢查是否有新版本（每天一次）
    update_notice = check_for_updates()
    if update_notice:
        result += update_notice
    
    return [TextContent(type="text", text=result)]

async def read_document(file_path: str) -> list[TextContent]:
    """
    讀取指定的文件內容
    """
    
    full_path = os.path.join(PROJECT_ROOT, file_path)
    
    # 安全檢查：確保路徑在專案目錄內
    if not os.path.abspath(full_path).startswith(PROJECT_ROOT):
        return [TextContent(
            type="text",
            text=f"❌ 錯誤：無法讀取專案目錄外的檔案"
        )]
    
    # 檢查檔案是否存在
    if not os.path.exists(full_path):
        return [TextContent(
            type="text",
            text=f"❌ 錯誤：找不到檔案 `{file_path}`\n\n請使用 `search_knowledge_base` 工具搜尋正確的檔案路徑。"
        )]
    
    # 讀取檔案
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        result = f"""
## 📄 {os.path.basename(file_path)}

**路徑**：`{file_path}`

---

{content}
"""
        return [TextContent(type="text", text=result)]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ 讀取檔案失敗：{str(e)}"
        )]

def get_category_from_path(path: str) -> str:
    """根據路徑判斷文件類別"""
    if "methodology" in path:
        return "方法論"
    elif "faq" in path:
        return "常見問題"
    elif "checklist" in path:
        return "檢核清單"
    elif "case_studies" in path:
        return "案例研究"
    elif "template" in path:
        return "範本"
    elif "quick_start" in path:
        return "快速啟動"
    else:
        return "其他"

# ============================================
# 核心功能：查詢經濟部統計處 API
# ============================================

async def query_moea_statistics(
    industry: str,
    stat_type: str,
    start_year: int,
    end_year: int
) -> list[TextContent]:
    """
    查詢經濟部統計處總體統計資料庫 API
    
    API 文件：https://nstatdb.dgbas.gov.tw/dgbasAll/webMain.aspx?sys=100&funid=API
    """
    
    # 產業代碼對應表（需要根據實際 API 文件調整）
    industry_codes = {
        "機械": "C29",
        "化工": "C20",
        "電子": "C26",
        "資通訊": "C26",
        "生技": "C21",
        "服務業": "G-S"
    }
    
    # 統計類型對應表
    stat_type_codes = {
        "產值": "production",
        "出口": "export",
        "就業人數": "employment"
    }
    
    industry_code = industry_codes.get(industry)
    if not industry_code:
        return [TextContent(
            type="text",
            text=f"❌ 不支援的產業別：{industry}\n\n支援的產業：{', '.join(industry_codes.keys())}"
        )]
    
    try:
        # 實際 API 呼叫
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 這裡需要根據實際 API 文件調整
            # 目前先回傳說明訊息
            
            result = f"""
## 經濟部統計處查詢結果

**產業別**：{industry}  
**統計類型**：{stat_type}  
**查詢期間**：{start_year} - {end_year}

---

⚠️ **API 實作說明**：

經濟部統計處提供總體統計資料庫 API，但需要：
1. 查詢「功能代碼」（每個統計表有唯一代碼）
2. 功能代碼列表：https://nstatdb.dgbas.gov.tw/

**建議替代方案**：
由於功能代碼查詢複雜，建議使用 Claude 的 `search_web` 工具：

```
search_web("{industry} {stat_type} site:dgbas.gov.tw OR site:moea.gov.tw")
```

**API 查詢範例**（需要功能代碼）：
```
https://nstatdb.dgbas.gov.tw/dgbasAll/webMain.aspx?sys=100&funid=API
  ?function=[功能代碼]
  &startTime={start_year}-01
  &endTime={end_year}-12
```

---

**來源**：
- 經濟部統計處：https://www.moea.gov.tw/Mns/dos/
- 總體統計資料庫：https://nstatdb.dgbas.gov.tw/
"""
            
            return [TextContent(type="text", text=result)]
            
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ 查詢失敗：{str(e)}\n\n建議使用 Claude 的 search_web 工具作為替代方案。"
        )]

# ============================================
# 輔助功能：搜尋經濟部網站
# ============================================

async def search_moea_website(keyword: str) -> list[TextContent]:
    """提供搜尋建議（實際搜尋由 Claude 的 search_web 執行）"""
    
    result = f"""
## 經濟部統計處搜尋建議

**搜尋關鍵字**：{keyword}

---

**建議使用 Claude 的 `search_web` 工具**：

```
search_web("{keyword} site:dgbas.gov.tw OR site:moea.gov.tw")
```

**推薦查詢網站**：
- 經濟部統計處：https://www.moea.gov.tw/Mns/dos/
- 總體統計資料庫：https://nstatdb.dgbas.gov.tw/
- 產業統計：https://www.moea.gov.tw/Mns/dos/content/SubMenu.aspx?menu_id=6730

**查詢技巧**：
- 加上年份：`{keyword} 2024`
- 指定統計類型：`{keyword} 產值` 或 `{keyword} 出口`
"""
    
    return [TextContent(type="text", text=result)]

# ============================================
# Server 啟動
# ============================================
# 知識庫更新功能
# ============================================

import subprocess

async def update_knowledge_base() -> list[TextContent]:
    """
    從 GitHub 拉取最新版本的知識庫
    """
    try:
        # 執行 git pull
        result = subprocess.run(
            ["git", "pull"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            output = result.stdout.strip()
            if "Already up to date" in output or "已經是最新" in output:
                return [TextContent(
                    type="text",
                    text="✅ **知識庫已是最新版本！**\n\n您的 SBIR Skill 知識庫已經是最新的了，無需更新。"
                )]
            else:
                return [TextContent(
                    type="text",
                    text=f"✅ **知識庫更新成功！**\n\n已從 GitHub 拉取最新版本。\n\n更新內容：\n```\n{output}\n```\n\n請重新啟動 Claude Desktop 以載入新內容。"
                )]
        else:
            error_msg = result.stderr.strip() or result.stdout.strip()
            return [TextContent(
                type="text",
                text=f"❌ **更新失敗**\n\n錯誤訊息：\n```\n{error_msg}\n```\n\n可能的原因：\n1. 沒有網路連線\n2. 專案目錄不是用 git clone 下載的\n3. 有未提交的本地修改\n\n您可以手動執行：\n```bash\ncd {PROJECT_ROOT} && git pull\n```"
            )]
            
    except subprocess.TimeoutExpired:
        return [TextContent(
            type="text",
            text="❌ **更新超時**\n\n網路連線可能太慢，請稍後再試或手動執行：\n```bash\ngit pull\n```"
        )]
    except FileNotFoundError:
        return [TextContent(
            type="text",
            text="❌ **找不到 Git**\n\n您的系統可能沒有安裝 Git，或 Git 不在系統路徑中。\n\n請手動下載最新版本：\nhttps://github.com/backtrue/sbir-grants/archive/refs/heads/main.zip"
        )]
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ **更新失敗**\n\n發生未預期的錯誤：{str(e)}\n\n請手動執行：\n```bash\ncd {PROJECT_ROOT} && git pull\n```"
        )]

# ============================================
# 經費試算功能
# ============================================

async def calculate_budget(total_budget: float, phase: str = "phase1", project_type: str = "技術研發") -> list[TextContent]:
    """
    根據計畫階段和類型，建議經費分配比例
    """
    
    # 驗證經費範圍
    phase_limits = {
        "phase1": {"max": 150, "subsidy_max": 150, "name": "Phase 1"},
        "phase2": {"max": 2400, "subsidy_max": 1200, "name": "Phase 2"},
        "phase2plus": {"max": 1200, "subsidy_max": 600, "name": "Phase 2+"}
    }
    
    limit = phase_limits.get(phase, phase_limits["phase1"])
    
    if total_budget > limit["max"]:
        return [TextContent(
            type="text",
            text=f"⚠️ **經費超過上限**\n\n{limit['name']} 計畫總經費上限為 {limit['max']} 萬元，您輸入的是 {total_budget} 萬元\n\n（補助上限：{limit['subsidy_max']} 萬元）"
        )]
    
    # 根據計畫類型調整比例
    allocation_templates = {
        "技術研發": {
            "人事費": {"ratio": 0.40, "desc": "研發人員薪資"},
            "消耗性器材": {"ratio": 0.20, "desc": "材料、試劑、零組件"},
            "設備費": {"ratio": 0.15, "desc": "研發設備採購或租用"},
            "委託研究費": {"ratio": 0.10, "desc": "委外測試、認證"},
            "差旅費": {"ratio": 0.05, "desc": "技術交流、客戶訪談"},
            "專利費": {"ratio": 0.03, "desc": "專利申請與維護"},
            "管理費": {"ratio": 0.07, "desc": "行政管理費用"}
        },
        "軟體開發": {
            "人事費": {"ratio": 0.55, "desc": "工程師薪資"},
            "消耗性器材": {"ratio": 0.05, "desc": "開發工具"},
            "雲端服務費": {"ratio": 0.15, "desc": "雲端主機、API 費用"},
            "委託研究費": {"ratio": 0.10, "desc": "委外設計、測試"},
            "差旅費": {"ratio": 0.05, "desc": "客戶訪談、技術交流"},
            "專利費": {"ratio": 0.03, "desc": "軟體著作權"},
            "管理費": {"ratio": 0.07, "desc": "行政管理費用"}
        },
        "硬體開發": {
            "人事費": {"ratio": 0.35, "desc": "研發人員薪資"},
            "消耗性器材": {"ratio": 0.25, "desc": "電子零件、材料"},
            "設備費": {"ratio": 0.20, "desc": "量測設備、打樣"},
            "委託研究費": {"ratio": 0.08, "desc": "委外測試、認證"},
            "差旅費": {"ratio": 0.04, "desc": "供應商拜訪"},
            "專利費": {"ratio": 0.03, "desc": "專利申請"},
            "管理費": {"ratio": 0.05, "desc": "行政管理費用"}
        },
        "服務創新": {
            "人事費": {"ratio": 0.50, "desc": "服務開發人員"},
            "消耗性器材": {"ratio": 0.08, "desc": "服務所需材料"},
            "場地費": {"ratio": 0.12, "desc": "服務場域租用"},
            "委託研究費": {"ratio": 0.12, "desc": "市場調查、顧問"},
            "差旅費": {"ratio": 0.08, "desc": "客戶訪談"},
            "行銷費": {"ratio": 0.05, "desc": "推廣活動"},
            "管理費": {"ratio": 0.05, "desc": "行政管理費用"}
        }
    }
    
    template = allocation_templates.get(project_type, allocation_templates["技術研發"])
    
    # 計算補助金額
    subsidy = min(total_budget * 0.5, limit["subsidy_max"])
    self_fund = total_budget - subsidy
    
    # 生成經費分配表
    output = f"""# 💰 SBIR 經費試算結果

## 基本資訊

| 項目 | 金額（萬元） |
|------|-------------|
| 計畫總經費 | **{total_budget:,.0f}** |
| 補助款（50%） | **{subsidy:,.0f}** |
| 自籌款（50%） | **{self_fund:,.0f}** |

> 計畫階段：{limit['name']}
> 計畫類型：{project_type}

---

## 建議經費分配

| 項目 | 比例 | 金額（萬元） | 說明 |
|------|------|-------------|------|
"""
    
    for item_name, item_data in template.items():
        amount = total_budget * item_data["ratio"]
        output += f"| {item_name} | {int(item_data['ratio']*100)}% | {amount:,.0f} | {item_data['desc']} |\n"
    
    output += f"""
---

## ⚠️ 注意事項

1. **人事費上限**：原則上不超過總經費 50%
2. **管理費上限**：不超過總經費 10%
3. **設備費限制**：Phase 1 盡量避免大型設備採購

## 📋 經費編列建議

"""
    
    # 根據計畫類型給予建議
    if project_type == "硬體開發":
        output += """- 設備費需說明必要性，優先考慮租用
- 打樣費用納入「消耗性器材」
- 認證測試列入「委託研究費」
"""
    elif project_type == "軟體開發":
        output += """- 雲端服務費需提供估算依據
- 軟體授權費可納入「消耗性器材」
- 人事費比例較高是正常的
"""
    elif project_type == "服務創新":
        output += """- 場地費需與服務內容相關
- 市場調查可列入「委託研究費」
- 可編列少量行銷推廣費用
"""
    else:
        output += """- 各項費用需附採購規劃說明
- 委外項目需說明必要性
- 差旅費需列明目的地和目的
"""
    
    output += """
---

> ⚠️ 此為建議分配，實際編列請依計畫需求調整
> 📖 詳細說明請參考：經費編列指南
"""
    
    return [TextContent(type="text", text=output)]

# ============================================
# 計畫書完整度檢核功能
# ============================================

async def check_proposal(proposal_content: str, phase: str = "phase1") -> list[TextContent]:
    """
    檢核 SBIR 計畫書完整度
    這是「自我檢查工具」，不是「評審結果預測」
    """
    
    # 定義 Phase 1 檢核項目
    phase1_checks = [
        {
            "category": "基本資訊",
            "items": [
                {"name": "公司名稱", "keywords": ["公司", "股份有限", "有限公司"]},
                {"name": "計畫名稱", "keywords": ["計畫名稱", "計畫題目"]},
                {"name": "計畫期程", "keywords": ["期程", "月", "年"]},
            ]
        },
        {
            "category": "問題陳述",
            "items": [
                {"name": "產業痛點描述", "keywords": ["痛點", "問題", "挑戰", "困難", "需求"]},
                {"name": "現況說明", "keywords": ["現況", "目前", "現有", "傳統"]},
                {"name": "問題量化數據", "keywords": ["億", "萬", "%", "比例", "統計"]},
            ]
        },
        {
            "category": "創新內容",
            "items": [
                {"name": "創新點描述", "keywords": ["創新", "突破", "獨創", "首創", "原創"]},
                {"name": "與現有技術差異", "keywords": ["差異", "不同", "優於", "相較", "比較"]},
                {"name": "技術優勢說明", "keywords": ["優勢", "優點", "特色", "領先"]},
            ]
        },
        {
            "category": "市場分析",
            "items": [
                {"name": "目標市場描述", "keywords": ["目標市場", "客戶", "TA", "使用者"]},
                {"name": "市場規模（TAM/SAM/SOM）", "keywords": ["TAM", "SAM", "SOM", "市場規模", "產值"]},
                {"name": "商業模式", "keywords": ["商業模式", "獲利", "營收", "收費"]},
            ]
        },
        {
            "category": "技術可行性",
            "items": [
                {"name": "技術方案說明", "keywords": ["技術", "方法", "架構", "系統"]},
                {"name": "前期驗證成果", "keywords": ["驗證", "測試", "實驗", "前期", "雛型"]},
                {"name": "風險評估", "keywords": ["風險", "挑戰", "困難"]},
            ]
        },
        {
            "category": "團隊介紹",
            "items": [
                {"name": "團隊成員", "keywords": ["團隊", "成員", "人員"]},
                {"name": "相關經驗", "keywords": ["經驗", "經歷", "背景", "專長"]},
                {"name": "分工規劃", "keywords": ["分工", "負責", "職責"]},
            ]
        },
        {
            "category": "執行計畫",
            "items": [
                {"name": "工作項目", "keywords": ["工作", "項目", "任務"]},
                {"name": "時程規劃", "keywords": ["時程", "進度", "甘特", "月"]},
                {"name": "查核點", "keywords": ["查核", "里程碑", "KPI", "指標"]},
            ]
        },
        {
            "category": "經費規劃",
            "items": [
                {"name": "人事費", "keywords": ["人事費", "薪資", "人力"]},
                {"name": "材料費/設備費", "keywords": ["材料", "設備", "器材", "耗材"]},
                {"name": "其他費用", "keywords": ["委託", "差旅", "管理費"]},
            ]
        },
    ]
    
    # 執行檢核
    content_lower = proposal_content.lower()
    results = []
    total_items = 0
    passed_items = 0
    
    for category in phase1_checks:
        category_results = {
            "name": category["category"],
            "items": []
        }
        
        for item in category["items"]:
            total_items += 1
            # 檢查是否包含關鍵字
            found = any(keyword in proposal_content for keyword in item["keywords"])
            if found:
                passed_items += 1
                status = "✅"
            else:
                status = "❌"
            
            category_results["items"].append({
                "name": item["name"],
                "status": status,
                "found": found
            })
        
        results.append(category_results)
    
    # 格式化輸出
    output = f"""# 📋 SBIR 計畫書完整度檢核

> ⚠️ **重要提醒**：這是「自我檢查工具」，用來確認計畫書是否涵蓋必要內容。  
> 檢核結果 **不代表審查結果預測**，最終通過與否取決於審查委員評估。

---

## 檢核結果摘要

**完整度**：{passed_items}/{total_items} 項目已涵蓋（{int(passed_items/total_items*100)}%）

"""
    
    for category in results:
        category_passed = sum(1 for item in category["items"] if item["found"])
        category_total = len(category["items"])
        
        if category_passed == category_total:
            category_status = "✅"
        elif category_passed == 0:
            category_status = "❌"
        else:
            category_status = "⚠️"
        
        output += f"### {category_status} {category['name']} ({category_passed}/{category_total})\n\n"
        
        for item in category["items"]:
            output += f"- {item['status']} {item['name']}\n"
        
        output += "\n"
    
    # 添加建議
    missing_items = [
        f"- {item['name']}"
        for category in results
        for item in category["items"]
        if not item["found"]
    ]
    
    if missing_items:
        output += f"""---

## 💡 建議補強項目

以下項目可能需要補充或加強：

"""
        for item in missing_items[:10]:  # 最多顯示 10 項
            output += f"{item}\n"
        
        if len(missing_items) > 10:
            output += f"\n（還有 {len(missing_items) - 10} 項未列出）\n"
    else:
        output += """---

## 🎉 恭喜！

您的計畫書涵蓋了所有必要項目。建議進一步優化：
- 確認各項內容的深度和具體性
- 補充量化數據和佐證資料
- 請他人審閱並給予回饋
"""
    
    output += """
---

📖 需要更多指引？請說「搜尋 [關鍵字]」查詢知識庫
"""
    
    return [TextContent(type="text", text=output)]

# ============================================
# 主程式入口
# ============================================

async def main():
    """啟動 MCP Server"""
    from mcp.server.stdio import stdio_server
    
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())

