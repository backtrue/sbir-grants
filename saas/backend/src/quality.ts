import { Hono } from 'hono'
import { authMiddleware, Bindings, Variables } from './middleware'

const qualityApp = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

qualityApp.use('*', authMiddleware)

export interface QualityDimension {
    label: string;
    question: string;
    keywords?: string[];
    min_related_keywords?: number;
    min_chars_total?: number;
}

export const QUALITY_DIMENSIONS: Record<string, QualityDimension> = {
    "ch_7": {
        label: "創新差異化論述",
        question: "創新技術說明清楚，與現有解決方案的差異化論述是否明確且具說服力？",
        keywords: ["創新", "差異", "優勢", "相比", "傳統", "%", "技術"],
        min_related_keywords: 3
    },
    "ch_8": {
        label: "市場規模三層分析",
        question: "是否包含完整的市場規模三層分析（TAM 總市場、SAM 可服務市場、SOM 目標市場）？",
        keywords: ["TAM", "SAM", "SOM", "億元", "萬元", "市場規模", "市佔"],
        min_related_keywords: 2
    },
    "ch_9": {
        label: "商業模式與產值預估",
        question: "是否包含明確的商業模式、客戶獲取策略，以及量化的未來三年產值預估？",
        keywords: ["商業模式", "收費", "客戶", "第一年", "第二年", "第三年", "萬元"],
        min_related_keywords: 2
    },
    "ch_10": {
        label: "執行期程與里程碑",
        question: "研究計畫是否包含合理的執行期程與具體的里程碑設定（6個月）？",
        keywords: ["M1", "M2", "M3", "月", "查核點", "時程", "里程碑", "甘特"],
        min_related_keywords: 2
    },
    "ch_11": {
        label: "數據可信度",
        question: "所提到的數據、市場數字或技術聲明，是否看起來有根據（非明顯假造）？",
        keywords: ["資料來源", "調查", "工研院", "IDC", "Gartner", "統計", "訪談"],
        min_related_keywords: 1
    },
    "ch_12": {
        label: "整體語氣與專業度",
        question: "計畫書整體語氣是否自信專業，適合呈現給 SBIR 審查委員閱讀？",
        min_chars_total: 1000
    }
};

function keywordCheck(text: string, keywords: string[], minCount: number): boolean {
    let count = 0;
    const lowerText = text.toLowerCase();
    for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) {
            count++;
        }
    }
    return count >= minCount;
}

qualityApp.get('/project/:projectId', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');

    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first();

    if (!project) return c.json({ error: 'Project not found' }, 404);

    // Fetch all generated sections that are completed
    const sectionsRes = await c.env.DB.prepare(
        "SELECT content FROM project_sections WHERE project_id = ? AND status = 'completed'"
    ).bind(projectId).all();

    const sections = (sectionsRes.results || []).map((row: any) => row.content as string);
    const fullText = sections.join('\n\n');

    if (!fullText || fullText.length < 50) {
        return c.json({
            error: 'Not enough content to evaluate. Please generate sections first.'
        }, 400);
    }

    const results: Record<string, boolean> = {};
    const reasons: Record<string, string> = {};

    for (const [dimId, dim] of Object.entries(QUALITY_DIMENSIONS)) {
        if (dimId === 'ch_12') {
            const passed = fullText.length >= dim.min_chars_total!;
            results[dimId] = passed;
            reasons[dimId] = `計畫書總長度 ${fullText.length} 字，${passed ? '通過' : `建議擴充至 ${dim.min_chars_total} 字以上`}。`;
        } else {
            const keywords = dim.keywords!;
            const minCount = dim.min_related_keywords!;
            const passed = keywordCheck(fullText, keywords, minCount);
            results[dimId] = passed;

            const lowerText = fullText.toLowerCase();
            const found = keywords.filter(kw => lowerText.includes(kw.toLowerCase()));

            if (passed) {
                reasons[dimId] = `包含必要關鍵詞：${found.slice(0, 3).join(', ')}`;
            } else {
                const missing = keywords.filter(kw => !lowerText.includes(kw.toLowerCase()));
                reasons[dimId] = `缺少關鍵要素，建議補充：${missing.slice(0, 3).join(', ')}`;
            }
        }
    }

    let passedCount = 0;
    for (const val of Object.values(results)) {
        if (val) passedCount++;
    }

    const totalCount = Object.keys(QUALITY_DIMENSIONS).length;
    const scorePct = Math.round((passedCount / totalCount) * 100);

    return c.json({
        results,
        reasons,
        passed_count: passedCount,
        total_count: totalCount,
        score_pct: scorePct,
        details: QUALITY_DIMENSIONS
    });
});

export default qualityApp;
