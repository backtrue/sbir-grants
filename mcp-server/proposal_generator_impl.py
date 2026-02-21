"""
計畫書生成器實作
"""

# ============================================
# 核心功能：互動式計畫書生成器
# ============================================

import os
import json
import logging
from pathlib import Path
from datetime import datetime

from mcp.types import TextContent

logger = logging.getLogger(__name__)

# 狀態檔案路徑
STATE_FILE = os.path.expanduser("~/.sbir_proposal_state.json")

# 專案根目錄（此模組所在目錄的上一層）
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def start_proposal_generator(phase: str = "phase1") -> list[TextContent]:
    """
    開始計畫書生成器，載入問題並初始化狀態
    """
    
    # 載入問題
    questions_file = os.path.join(PROJECT_ROOT, "proposal_generator", "questions.json")
    
    try:
        with open(questions_file, 'r', encoding='utf-8') as f:
            questions_data = json.load(f)
        
        # 初始化狀態
        state = {
            "phase": phase,
            "started_at": datetime.now().isoformat(),
            "current_question": 1,
            "total_questions": questions_data["metadata"]["total_questions"],
            "answers": {},
            "completed": False
        }
        
        # 保存狀態
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        
        # 取得第一個問題
        first_question = questions_data["questions"][0]
        
        result = f"""
## 🚀 SBIR {phase.upper()} 計畫書生成器已啟動！

**總共問題數**：{state['total_questions']} 題  
**預估時間**：{questions_data['metadata']['estimated_time']}

---

### 📋 第 1/{state['total_questions']} 題 - {first_question['category']}

**{first_question['question']}**

{f"範例：{first_question['placeholder']}" if 'placeholder' in first_question else ""}

---

💡 **提示**：
- 回答完畢後，我會自動保存並詢問下一題
- 可以隨時說「暫停」中斷，之後繼續
- 可以說「查看進度」了解目前狀態
"""
        
        return [TextContent(type="text", text=result)]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ 啟動失敗：{str(e)}\n\n請確認 proposal_generator/questions.json 檔案存在。"
        )]

async def save_answer(question_id: str, answer: str) -> list[TextContent]:
    """
    保存答案並返回下一個問題
    """
    
    # 讀取狀態
    if not os.path.exists(STATE_FILE):
        return [TextContent(
            type="text",
            text="❌ 請先執行 start_proposal_generator 開始生成器"
        )]
    
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        # 保存答案
        state["answers"][question_id] = answer
        state["current_question"] = len(state["answers"]) + 1
        
        # 載入問題
        questions_file = os.path.join(PROJECT_ROOT, "proposal_generator", "questions.json")
        with open(questions_file, 'r', encoding='utf-8') as f:
            questions_data = json.load(f)
        
        # 檢查是否完成
        if state["current_question"] > state["total_questions"]:
            state["completed"] = True
            state["completed_at"] = datetime.now().isoformat()
            
            with open(STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            
            return [TextContent(
                type="text",
                text=f"""
## 🎉 恭喜！所有問題都已回答完畢！

**已回答**：{len(state['answers'])}/{state['total_questions']} 題

---

### 下一步

執行 `generate_proposal` 工具來生成完整計畫書！

或者您可以：
- 查看進度：`get_progress`
- 修改答案：重新執行 `save_answer`
"""
            )]
        
        # 取得下一個問題
        next_question = questions_data["questions"][state["current_question"] - 1]
        
        # 保存狀態
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        
        # 計算進度
        progress = int((len(state["answers"]) / state["total_questions"]) * 100)
        progress_bar = "█" * (progress // 5) + "░" * (20 - progress // 5)
        
        result = f"""
## ✅ 已保存

**進度**：[{progress_bar}] {len(state['answers'])}/{state['total_questions']} ({progress}%)

---

### 📋 第 {state['current_question']}/{state['total_questions']} 題 - {next_question['category']}

**{next_question['question']}**

{f"範例：{next_question['placeholder']}" if 'placeholder' in next_question else ""}

{f"⚠️ {next_question['validation']['warning']}" if 'validation' in next_question and 'warning' in next_question['validation'] else ""}
"""
        
        return [TextContent(type="text", text=result)]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ 保存失敗：{str(e)}"
        )]

async def get_progress() -> list[TextContent]:
    """
    取得目前進度
    """
    
    if not os.path.exists(STATE_FILE):
        return [TextContent(
            type="text",
            text="❌ 尚未開始生成器，請先執行 start_proposal_generator"
        )]
    
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        progress = int((len(state["answers"]) / state["total_questions"]) * 100)
        progress_bar = "█" * (progress // 5) + "░" * (20 - progress // 5)
        
        result = f"""
## 📊 計畫書生成進度

**階段**：{state['phase'].upper()}  
**開始時間**：{state['started_at']}  
**進度**：[{progress_bar}] {len(state['answers'])}/{state['total_questions']} ({progress}%)

---

### 已回答的問題

"""
        
        # 載入問題
        questions_file = os.path.join(PROJECT_ROOT, "proposal_generator", "questions.json")
        with open(questions_file, 'r', encoding='utf-8') as f:
            questions_data = json.load(f)
        
        # 顯示已回答的問題
        for q in questions_data["questions"]:
            if q["id"] in state["answers"]:
                answer = state["answers"][q["id"]]
                # 截斷過長的答案
                display_answer = answer[:50] + "..." if len(answer) > 50 else answer
                result += f"- ✅ {q['question']}\n  答案：{display_answer}\n\n"
        
        if state["completed"]:
            result += "\n🎉 **已完成！** 可以執行 generate_proposal 生成計畫書。"
        else:
            result += f"\n⏳ **下一題**：第 {state['current_question']} 題"
        
        return [TextContent(type="text", text=result)]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ 讀取進度失敗：{str(e)}"
        )]

async def generate_proposal() -> list[TextContent]:
    """
    根據答案生成完整計畫書
    """
    
    if not os.path.exists(STATE_FILE):
        return [TextContent(
            type="text",
            text="❌ 尚未開始生成器，請先執行 start_proposal_generator"
        )]
    
    try:
        # 讀取狀態
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        if not state.get("completed", False):
            return [TextContent(
                type="text",
                text=f"❌ 尚未完成所有問題\n\n目前進度：{len(state['answers'])}/{state['total_questions']}\n\n請繼續回答問題。"
            )]
        
        # 讀取範本
        template_file = os.path.join(PROJECT_ROOT, "proposal_generator", f"template_{state['phase']}.md")
        with open(template_file, 'r', encoding='utf-8') as f:
            template = f.read()
        
        # 簡單的變數替換（實際應該使用 Jinja2 或類似模板引擎）
        proposal = template
        for question_id, answer in state["answers"].items():
            proposal = proposal.replace(f"{{{{{question_id}}}}}", answer)
        
        # 處理一些特殊變數
        proposal = proposal.replace("{{project_title}}", f"{state['answers'].get('solution_description', '創新研發計畫')[:30]}...")
        proposal = proposal.replace("{{problem_summary}}", state['answers'].get('problem_description', '')[:50])
        
        result = f"""
## 🎉 計畫書生成成功！

---

{proposal}

---

## 📝 下一步

1. **複製計畫書**：將上方內容複製到 Word
2. **人工優化**：調整語氣、補充數據
3. **使用檢核清單**：確認完整性
4. **送件**：準備相關文件

💡 **建議**：
- 使用 `checklists/writing_checklist_phase1.md` 檢查
- 參考 `examples/case_studies/` 優化內容
- 諮詢專家進行最終審閱
"""
        
        return [TextContent(type="text", text=result)]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"❌ 生成失敗：{str(e)}"
        )]
