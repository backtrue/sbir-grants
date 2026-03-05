import asyncio
import sys
import os

# Ensure the mcp-server directory is in the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import ai_draft_review

# Mock load_state
def mock_load_state():
    return {
        "answers": {
            "q1": "公司的核心技術為邊緣運算",
            "q2": "營收去年達 5000 萬元",
        },
        "generated_sections": {
            "1": {
                "title": "公司簡介",
                "content": "本公司具備邊緣運算與量子科技能力，將會投資10億元在本地研發。"
            }
        }
    }

ai_draft_review.load_state = mock_load_state

async def main():
    print("Testing get_ai_draft_review_prompt MCP Tool with mock state...")
    prompt = await ai_draft_review.MCP_get_ai_draft_review_prompt(0)
    print("\n--- Generated Prompt ---")
    print(prompt)
    print("------------------------")
    
    if "FactCheckWarnings" in prompt and "Edits" in prompt and "Strengths" in prompt:
        print("✅ Prompt contains expected JSON schema structure.")
    else:
        print("❌ Prompt missing expected JSON schema.")
        
    if "邊緣運算" in prompt and "量子科技" in prompt:
         print("✅ Prompt injected Ground Truth and Section Content correctly.")
    else:
         print("❌ Prompt missing injected variables.")

if __name__ == "__main__":
    asyncio.run(main())
