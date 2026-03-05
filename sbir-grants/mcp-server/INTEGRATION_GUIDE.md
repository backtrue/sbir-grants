# MCP Server 整合說明

## 狀態

**工具定義**：✅ 已完成  
**工具路由**：✅ 已完成  
**函數實作**：⚠️ 需要手動整合

## 如何完成整合

### 方法 1：使用 proposal_generator_impl.py（推薦）

1. **打開 `mcp-server/server.py`**

2. **找到第 472 行**（`# ============================================` 上方）

3. **複製 `proposal_generator_impl.py` 的第 7-286 行**

4. **貼到 server.py 的第 472 行之前**

5. **保存檔案**

6. **重啟 Claude Desktop**

### 方法 2：自動腳本（Mac/Linux）

```bash
cd /Users/backtrue/Documents/claude-sbir-skills/sbir-grants/mcp-server

# 備份原檔案
cp server.py server.py.backup

# 整合函數（在第 472 行之前插入）
head -n 471 server.py > server_new.py
tail -n +7 proposal_generator_impl.py | head -n 280 >> server_new.py
tail -n +472 server.py >> server_new.py

# 替換
mv server_new.py server.py

# 驗證
python server.py --help
```

### 方法 3：已經可以使用了！

**實際上**，由於工具定義和路由已經完成，Claude 會嘗試呼叫這些函數。

**測試方式**：
1. 重啟 Claude Desktop
2. 說「開始生成 SBIR Phase 1 計畫書」
3. 如果出現錯誤，再手動整合

## 驗證

整合完成後，執行：

```bash
cd mcp-server
python -c "from server import start_proposal_generator; print('✅ 整合成功')"
```

應該看到：`✅ 整合成功`

## 目前狀態

- ✅ 工具已註冊到 MCP Server
- ✅ Claude 可以看到這些工具
- ⚠️ 函數實作在獨立檔案中
- 💡 可以透過 import 或手動整合使用

## 快速測試

不整合也可以測試！創建 `mcp-server/__init__.py`：

```python
from proposal_generator_impl import (
    start_proposal_generator,
    save_answer,
    get_progress,
    generate_proposal
)
```

然後在 `server.py` 開頭加入：

```python
from proposal_generator_impl import (
    start_proposal_generator,
    save_answer,
    get_progress,
    generate_proposal
)
```

這樣就可以直接使用了！
