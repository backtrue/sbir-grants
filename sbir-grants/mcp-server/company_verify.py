import urllib.request
import urllib.parse
import json


async def MCP_verify_company_eligibility_by_g0v(company_name: str, capital_from_user: str | None = None, employee_size_from_user: str | None = None) -> str:
    """
    透過 g0v API 驗證台灣公司之 SBIR 申請資格。
    """
    if not company_name:
        return json.dumps({"error": "請提供公司名稱"}, ensure_ascii=False)

    try:
        url = f"https://company.g0v.ronny.tw/api/search?q={urllib.parse.quote(company_name)}&page=0"
        req = urllib.request.Request(
            url,
            headers={'Accept': 'application/json', 'User-Agent': 'SBIR-Assistant-Skill/1.0'}
        )

        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                return json.dumps({"error": f"g0v API 請求失敗，狀態碼：{response.status}"}, ensure_ascii=False)
            data = json.loads(response.read().decode('utf-8'))

    except Exception as e:
        return json.dumps({"error": f"連線或解析 g0v API 失敗: {str(e)}"}, ensure_ascii=False)

    g0v_company = None
    if data and "data" in data and len(data["data"]) > 0:
        g0v_company = data["data"][0]

    g0v_found = g0v_company is not None
    matched_name = g0v_company.get("公司名稱", company_name) if g0v_company else company_name

    # Check 1: 公司狀況 (Is active?)
    ch1 = False
    ch1_reason = ""
    if g0v_company:
        status = g0v_company.get("公司狀況", "")
        inactive_keywords = ['解散', '停業', '廢止', '撤銷', '歇業']
        ch1 = not any(k in status for k in inactive_keywords)
        if ch1:
            ch1_reason = f"公司狀況為「{status}」，符合登記設立要求"
        else:
            ch1_reason = f"公司狀況為「{status}」，不符合申請資格（已解散/停業等）"
    else:
        ch1 = False
        ch1_reason = "g0v 查無該公司登記資料，無法確認設立狀況"

    # Check 2: 中小企業認定 (Capital < 100M AND Employees < 200)
    ch2 = False
    ch2_reason = ""

    capital_str = g0v_company.get("資本總額(元)", "") if g0v_company else ""
    try:
        capital_ntd = int(capital_str.replace(',', '')) if capital_str else 0
    except ValueError:
        capital_ntd = 0

    has_g0v_capital = capital_ntd > 0

    # Fallback to wizard
    wizard_capital_num = 0
    if capital_from_user:
        # Extract digits from user input, assuming unit is "萬元" (10,000 NTD)
        import re
        nums = re.findall(r"[-+]?\d*\.\d+|\d+", str(capital_from_user))
        if nums:
            wizard_capital_num = int(float(nums[0]) * 10000)

    effective_capital = capital_ntd if has_g0v_capital else wizard_capital_num
    # Default to True if unknown, to be safe. Actually, better be True so we don't block.
    capital_ok = effective_capital < 100_000_000 if effective_capital > 0 else True

    # Check employee count
    employee_count = None
    size_text = str(employee_size_from_user) if employee_size_from_user else ""
    import re
    num_match = re.search(r'\d+', size_text)
    if num_match:
        employee_count = int(num_match.group())
    elif re.search(r'一人|只有我|獨資|個人', size_text):
        employee_count = 1

    employee_ok = employee_count < 200 if employee_count is not None else True

    ch2 = capital_ok and employee_ok
    capital_desc = f"g0v資本額 {capital_str} 元" if has_g0v_capital else f"使用者提供資本額 {capital_from_user or '未知'}"
    emp_desc = f"{employee_count} 人" if employee_count is not None else (size_text or '未知')
    ch2_reason = f"{capital_desc}（{'<1億✓' if capital_ok else '>=1億✗'}），員工 {emp_desc}（{'<200人✓' if employee_ok else '>=200人✗'}）"

    # Check 3: 陸資/外資 (Foreign directors)
    ch3 = True
    ch3_reason = ""
    if g0v_company:
        directors = g0v_company.get("董監事名單", [])
        if directors and isinstance(directors, list):
            has_foreign_name = False
            for d in directors:
                name = d.get("姓名", "")
                if re.search(r'[a-zA-Z]', name):
                    has_foreign_name = True
                    break
            ch3 = not has_foreign_name
            ch3_reason = "董監事名單中含疑似外籍姓名，建議確認外資持股比例" if has_foreign_name else "董監事名單中無明顯外籍成員，初步無外資超過 1/3 疑慮"
        else:
            ch3 = True
            ch3_reason = "g0v 無股東結構資料，建議自行確認外資比例是否低於 1/3"
    else:
        ch3 = True
        ch3_reason = "無 g0v 資料可稽核股權結構"

    results = {
        "ch_1": ch1,
        "ch_2": ch2,
        "ch_3": ch3,
        "company_found": g0v_found,
        "matched_name": matched_name,
        "reasons": {
            "ch_1": ch1_reason,
            "ch_2": ch2_reason,
            "ch_3": ch3_reason
        }
    }

    # Return as pretty json string
    return json.dumps({"results": results, "company_name": company_name, "g0v_found": g0v_found}, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    import asyncio
    import sys

    if len(sys.argv) > 1:
        comp_name = sys.argv[1]
        print(f"Testing g0v API for: {comp_name}")
        res = asyncio.run(MCP_verify_company_eligibility_by_g0v(comp_name, "500", "10"))
        print(res)
    else:
        print("Usage: python3 company_verify.py <company_name>")
