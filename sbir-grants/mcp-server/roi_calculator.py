"""
ROI 計算器模組

提供 ROI/ROAS 計算與驗證功能
"""

from typing import Dict
import json
from pathlib import Path

# 根據專案結構，shared_domain 在 mcp-server 的上一層的上一層
SHARED_DOMAIN_DIR = Path(__file__).parent.parent.parent / "shared_domain"


def load_financial_rules() -> Dict:
    rules_file = SHARED_DOMAIN_DIR / "financial_rules.json"
    with open(rules_file, "r", encoding="utf-8") as f:
        return json.load(f)


# 載入共用的產業 ROAS 基準
_financial_rules = load_financial_rules()
INDUSTRY_ROAS_BENCHMARKS = _financial_rules.get("industry_roas_benchmarks", {})


def calculate_roi(
    subsidy_amount: float,
    phase: str = "phase1",
    industry: str = "製造業",
    project_duration: int = 12,
    company_revenue: float = 0,
) -> Dict:
    """
    計算建議的產值目標

    Args:
        subsidy_amount: 補助金額（萬元）
        phase: Phase 1 or Phase 2
        industry: 產業別
        project_duration: 計畫期程（月）
        company_revenue: 公司年營收（萬元，可選）

    Returns:
        包含建議產值、ROAS、分年預估等資訊的字典
    """

    # 取得產業基準
    benchmark = INDUSTRY_ROAS_BENCHMARKS.get(
        industry,
        INDUSTRY_ROAS_BENCHMARKS["製造業"]
    )

    # 基本計算
    min_revenue = subsidy_amount * benchmark["min"]
    recommended_revenue = subsidy_amount * benchmark["recommended"]
    excellent_revenue = subsidy_amount * benchmark["excellent"]

    # 根據補助金額調整（大金額可接受較低倍數）
    if subsidy_amount >= 600:
        adjustment_factor = 0.8  # 降低 20%
    elif subsidy_amount >= 300:
        adjustment_factor = 0.9  # 降低 10%
    else:
        adjustment_factor = 1.0  # 不調整

    min_revenue *= adjustment_factor
    recommended_revenue *= adjustment_factor
    excellent_revenue *= adjustment_factor

    # 計算分年預估（簡化版）
    if phase == "phase1":
        # Phase 1: 計畫後 3 年
        year_distribution = [0.25, 0.35, 0.40]  # 第1年25%, 第2年35%, 第3年40%
    else:
        # Phase 2: 計畫後 3-5 年
        year_distribution = [0.15, 0.20, 0.25, 0.20, 0.20]

    # 生成分年預估表
    yearly_breakdown = []
    for i, ratio in enumerate(year_distribution, 1):
        yearly_breakdown.append({
            "year": i,
            "min": round(min_revenue * ratio, 1),
            "recommended": round(recommended_revenue * ratio, 1),
            "excellent": round(excellent_revenue * ratio, 1),
        })

    # 組合結果
    result = {
        "subsidy_amount": subsidy_amount,
        "industry": industry,
        "phase": phase,
        "benchmark": benchmark,
        "targets": {
            "min": {
                "total_revenue": round(min_revenue, 1),
                "roas": round(benchmark["min"] * adjustment_factor, 2),
                "status": "最低標準",
                "description": "即使在保守情況下也應達到此標準"
            },
            "recommended": {
                "total_revenue": round(recommended_revenue, 1),
                "roas": round(benchmark["recommended"] * adjustment_factor, 2),
                "status": "建議目標",
                "description": "這是合理且有競爭力的目標"
            },
            "excellent": {
                "total_revenue": round(excellent_revenue, 1),
                "roas": round(benchmark["excellent"] * adjustment_factor, 2),
                "status": "優秀水準",
                "description": "達到此標準將大幅提升通過率"
            }
        },
        "yearly_breakdown": yearly_breakdown,
        "adjustment_note": _get_adjustment_note(subsidy_amount, company_revenue, industry)
    }

    return result


def validate_roi(
    subsidy_amount: float,
    expected_revenue_3years: float,
    industry: str = "製造業",
    phase: str = "phase1"
) -> Dict:
    """
    驗證產值是否合理

    Args:
        subsidy_amount: 補助金額（萬元）
        expected_revenue_3years: 預期 3 年累積產值（萬元）
        industry: 產業別
        phase: Phase 1 or Phase 2

    Returns:
        驗證結果，包含評分、建議等
    """

    # 計算實際 ROAS
    actual_roas = expected_revenue_3years / subsidy_amount if subsidy_amount > 0 else 0

    # 取得產業基準
    benchmark = INDUSTRY_ROAS_BENCHMARKS.get(
        industry,
        INDUSTRY_ROAS_BENCHMARKS["製造業"]
    )

    # 根據補助金額調整基準
    if subsidy_amount >= 600:
        adjustment_factor = 0.8
    elif subsidy_amount >= 300:
        adjustment_factor = 0.9
    else:
        adjustment_factor = 1.0

    adjusted_min = benchmark["min"] * adjustment_factor
    adjusted_recommended = benchmark["recommended"] * adjustment_factor
    adjusted_excellent = benchmark["excellent"] * adjustment_factor

    # 評估等級
    if actual_roas < adjusted_min:
        level = "不足"
        status = "❌"
        color = "red"
        advice = f"產值過低！建議至少提高到 {subsidy_amount * adjusted_min:.0f} 萬（{adjusted_min:.1f} 倍）"
    elif actual_roas < adjusted_recommended:
        level = "及格"
        status = "⚠️"
        color = "yellow"
        advice = f"勉強及格，建議提高到 {subsidy_amount * adjusted_recommended:.0f} 萬（{adjusted_recommended:.1f} 倍）以提升競爭力"
    elif actual_roas < adjusted_excellent:
        level = "良好"
        status = "✅"
        color = "green"
        advice = "產值合理，有競爭力"
    else:
        level = "優秀"
        status = "⭐"
        color = "green"
        advice = "產值優秀，通過機率高"

    result = {
        "subsidy_amount": subsidy_amount,
        "expected_revenue": expected_revenue_3years,
        "actual_roas": round(actual_roas, 2),
        "industry": industry,
        "benchmark": {
            "min": round(adjusted_min, 2),
            "recommended": round(adjusted_recommended, 2),
            "excellent": round(adjusted_excellent, 2)
        },
        "evaluation": {
            "level": level,
            "status": status,
            "color": color,
            "advice": advice
        },
        "comparison": {
            "vs_min": f"{((actual_roas / adjusted_min - 1) * 100):+.1f}%",
            "vs_recommended": f"{((actual_roas / adjusted_recommended - 1) * 100):+.1f}%",
            "vs_excellent": f"{((actual_roas / adjusted_excellent - 1) * 100):+.1f}%"
        }
    }

    return result


def _get_adjustment_note(subsidy_amount: float, company_revenue: float, industry: str) -> str:
    """生成調整說明"""
    notes = []

    # 補助金額調整
    if subsidy_amount >= 600:
        notes.append("💡 大型計畫（≥600萬），ROAS 基準已下調 20%")
    elif subsidy_amount >= 300:
        notes.append("💡 中型計畫（300-600萬），ROAS 基準已下調 10%")

    # 產業特性
    if industry in ["資通訊", "軟體", "數位服務"]:
        notes.append("💡 軟體/數位產業，期待較高 ROAS（5-10 倍）")
    elif industry in ["生技/醫療"]:
        notes.append("💡 生技產業，考慮研發風險，可接受較低 ROAS")

    # 公司規模
    if company_revenue > 0:
        if company_revenue < 1000:
            notes.append("💡 新創公司，可適度降低 ROAS 要求")
        elif company_revenue > 20000:
            notes.append("💡 大型公司，應展現較高 ROAS")

    return "\n".join(notes) if notes else "無特殊調整"


def format_roi_report(calculation_result: Dict) -> str:
    """
    格式化 ROI 計算結果為易讀的報告

    Args:
        calculation_result: calculate_roi() 的返回結果

    Returns:
        格式化的文字報告
    """
    r = calculation_result

    report = f"""
# 💰 ROI 試算結果

## 基本資訊
- 補助金額：**{r['subsidy_amount']:.0f} 萬元**
- 產業別：**{r['industry']}**
- 計畫階段：**{r['phase'].upper()}**

---

## 建議產值目標

| 等級 | 3年累積產值 | ROAS | 說明 |
|------|------------|------|------|
| {r['targets']['min']['status']} | {r['targets']['min']['total_revenue']:.0f} 萬 | {r['targets']['min']['roas']:.1f} 倍 | {r['targets']['min']['description']} |
| {r['targets']['recommended']['status']} | {r['targets']['recommended']['total_revenue']:.0f} 萬 | {r['targets']['recommended']['roas']:.1f} 倍 | {r['targets']['recommended']['description']} |
| {r['targets']['excellent']['status']} | {r['targets']['excellent']['total_revenue']:.0f} 萬 | {r['targets']['excellent']['roas']:.1f} 倍 | {r['targets']['excellent']['description']} |

---

## 分年營收預估（建議目標）

| 年度 | 最低標準 | 建議目標 | 優秀水準 |
|------|---------|---------|---------|
"""

    for year_data in r['yearly_breakdown']:
        report += f"| 第 {year_data['year']} 年 | {year_data['min']:.0f} 萬 | {year_data['recommended']:.0f} 萬 | {year_data['excellent']:.0f} 萬 |\n"

    report += """
---

## 調整說明

{r['adjustment_note']}

---

## 💡 使用建議

1. **以「建議目標」為基準**：{r['targets']['recommended']['total_revenue']:.0f} 萬（{r['targets']['recommended']['roas']:.1f} 倍）
2. **提供計算依據**：市場規模 x 目標市佔率
3. **用保守估計**：理論值 x 20-50%
4. **附上佐證資料**：客戶意向書、試用數據、市場報告

記住：**有依據的 {r['targets']['min']['roas']:.1f} 倍 > 沒依據的 10 倍**
"""

    return report


def format_validation_report(validation_result: Dict) -> str:
    """
    格式化驗證結果為易讀的報告

    Args:
        validation_result: validate_roi() 的返回結果

    Returns:
        格式化的文字報告
    """
    r = validation_result

    report = f"""
# 📊 ROI 驗證結果

## 您的計畫

- 補助金額：**{r['subsidy_amount']:.0f} 萬元**
- 預期 3 年產值：**{r['expected_revenue']:.0f} 萬元**
- 實際 ROAS：**{r['actual_roas']:.2f} 倍**

---

## 評估結果

{r['evaluation']['status']} **等級：{r['evaluation']['level']}**

{r['evaluation']['advice']}

---

## 與產業基準比較

| 基準 | 倍數 | 您的表現 |
|------|------|---------|
| 最低標準 | {r['benchmark']['min']:.1f} 倍 | {r['comparison']['vs_min']} |
| 建議目標 | {r['benchmark']['recommended']:.1f} 倍 | {r['comparison']['vs_recommended']} |
| 優秀水準 | {r['benchmark']['excellent']:.1f} 倍 | {r['comparison']['vs_excellent']} |

---

## 💡 建議

"""

    if r['evaluation']['level'] == "不足":
        report += f"""
⚠️ **產值過低，需要調整！**

建議行動：
1. 重新評估市場規模與目標市佔率
2. 考慮增加間接產值（成本節省、效率提升）
3. 延長計算期間（如從 3 年改為 5 年）
4. 如果實在無法提高，考慮降低補助金額申請

最低目標：{r['subsidy_amount'] * r['benchmark']['min']:.0f} 萬（{r['benchmark']['min']:.1f} 倍）
"""
    elif r['evaluation']['level'] == "及格":
        report += f"""
⚠️ **勉強及格，建議提升競爭力**

建議行動：
1. 檢視是否有遺漏的產值來源
2. 適度調高市場預估（但要有依據）
3. 加強客戶驗證，提高可信度

建議目標：{r['subsidy_amount'] * r['benchmark']['recommended']:.0f} 萬（{r['benchmark']['recommended']:.1f} 倍）
"""
    else:
        report += """
✅ **產值合理，繼續保持！**

下一步：
1. 確保每個數字都有明確依據
2. 準備佐證資料（意向書、試用數據）
3. 用保守估計建立信任感
"""

    return report


if __name__ == "__main__":
    # 測試
    print("=== ROI 計算器測試 ===\n")

    # 測試 1：計算建議產值
    print("【測試 1】計算建議產值")
    result = calculate_roi(
        subsidy_amount=150,
        phase="phase1",
        industry="製造業",
        company_revenue=8000
    )
    print(format_roi_report(result))

    print("\n" + "="*60 + "\n")

    # 測試 2：驗證產值
    print("【測試 2】驗證產值")
    validation = validate_roi(
        subsidy_amount=150,
        expected_revenue_3years=900,
        industry="製造業"
    )
    print(format_validation_report(validation))
