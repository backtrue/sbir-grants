// src/utils/calculators.ts

export type PhaseType = 'phase1' | 'phase2' | 'phase2plus';
export type ProjectType = '技術研發' | '軟體開發' | '硬體開發' | '服務創新';

export interface BudgetLimit {
    max: number;
    subsidy_max: number;
    name: string;
}

import rules from '../../../../shared_domain/financial_rules.json';

export const PHASE_LIMITS: Record<PhaseType, BudgetLimit> = rules.phase_limits as any;

export interface AllocationItem {
    ratio: number;
    desc: string;
}

export const ALLOCATION_TEMPLATES: Record<ProjectType, Record<string, AllocationItem>> = rules.allocation_templates as any;

export interface BudgetResult {
    totalBudget: number;
    subsidy: number;
    selfFund: number;
    phaseName: string;
    projectType: string;
    allocations: Record<string, {
        ratio: number;
        amount: number;
        desc: string;
    }>;
    warnings: string[];
    suggestions: string[];
}

export function calculateBudget(totalBudget: number, phase: PhaseType = 'phase1', projectType: ProjectType = '技術研發'): BudgetResult {
    const limit = PHASE_LIMITS[phase] || PHASE_LIMITS['phase1'];
    const warnings: string[] = [];

    if (totalBudget > limit.max) {
        warnings.push(`⚠️ 經費超過上限：${limit.name} 計畫總經費上限為 ${limit.max} 萬元，您輸入的是 ${totalBudget} 萬元。補助上限為 ${limit.subsidy_max} 萬元。`);
    }

    const template = ALLOCATION_TEMPLATES[projectType] || ALLOCATION_TEMPLATES['技術研發'];
    const subsidy = Math.min(totalBudget * 0.5, limit.subsidy_max);
    const selfFund = totalBudget - subsidy;

    const allocations: Record<string, { ratio: number; amount: number; desc: string }> = {};
    for (const [itemName, itemData] of Object.entries(template)) {
        allocations[itemName] = {
            ratio: itemData.ratio,
            amount: Math.round(totalBudget * itemData.ratio),
            desc: itemData.desc
        };
    }

    const suggestions: string[] = [];
    if (projectType === '硬體開發') {
        suggestions.push('設備費需說明必要性，優先考慮租用');
        suggestions.push('打樣費用納入「消耗性器材」');
        suggestions.push('認證測試列入「委託研究費」');
    } else if (projectType === '軟體開發') {
        suggestions.push('雲端服務費需提供估算依據');
        suggestions.push('軟體授權費可納入「消耗性器材」');
        suggestions.push('人事費比例較高是正常的');
    } else if (projectType === '服務創新') {
        suggestions.push('場地費需與服務內容相關');
        suggestions.push('市場調查可列入「委託研究費」');
        suggestions.push('可編列少量行銷推廣費用');
    } else {
        suggestions.push('各項費用需附採購規劃說明');
        suggestions.push('委外項目需說明必要性');
        suggestions.push('差旅費需列明目的地和目的');
    }

    return {
        totalBudget,
        subsidy,
        selfFund,
        phaseName: limit.name,
        projectType,
        allocations,
        warnings,
        suggestions
    };
}

export function formatBudgetAsMarkdown(result: BudgetResult): string {
    let output = `## 💰 SBIR 經費表 (系統自動試算)\n\n`;

    if (result.warnings.length > 0) {
        output += `> **注意**：\n${result.warnings.map(w => `> - ${w}`).join('\n')}\n\n`;
    }

    output += `| 項目 | 金額（萬元） |\n|------|-------------|\n`;
    output += `| 計畫總經費 | **${result.totalBudget.toLocaleString()}** |\n`;
    output += `| 補助款 | **${result.subsidy.toLocaleString()}** |\n`;
    output += `| 自籌款 | **${result.selfFund.toLocaleString()}** |\n\n`;

    output += `### 經費分配明細\n\n`;
    output += `| 科目 | 比例 | 金額（萬元） | 說明 |\n|------|------|-------------|------|\n`;

    for (const [itemName, data] of Object.entries(result.allocations)) {
        output += `| ${itemName} | ${Math.round(data.ratio * 100)}% | ${data.amount.toLocaleString()} | ${data.desc} |\n`;
    }

    output += `\n### 💡 編列建議\n\n`;
    output += result.suggestions.map(s => `- ${s}`).join('\n') + '\n';

    return output;
}

// ROI Calculators

const INDUSTRY_ROAS_BENCHMARKS: Record<string, { min: number; recommended: number; excellent: number }> = rules.industry_roas_benchmarks as any;

export interface ROIResult {
    subsidyAmount: number;
    industry: string;
    phase: PhaseType;
    yearlyBreakdown: Array<{ year: number; recommended: number }>;
    targetRevenue: number;
    targetROAS: number;
    notes: string[];
}

export function calculateROI(subsidyAmount: number, phase: PhaseType = 'phase1', industry: string = '製造業', companyRevenue: number = 0): ROIResult {
    const benchmark = INDUSTRY_ROAS_BENCHMARKS[industry] || INDUSTRY_ROAS_BENCHMARKS['製造業'];

    let adjustmentFactor = 1.0;
    if (subsidyAmount >= 600) {
        adjustmentFactor = 0.8;
    } else if (subsidyAmount >= 300) {
        adjustmentFactor = 0.9;
    }

    const recommendedRevenue = subsidyAmount * benchmark.recommended * adjustmentFactor;

    let yearDistribution: number[];
    if (phase === 'phase1') {
        yearDistribution = [0.25, 0.35, 0.40];
    } else {
        yearDistribution = [0.15, 0.20, 0.25, 0.20, 0.20];
    }

    const yearlyBreakdown = yearDistribution.map((ratio, index) => ({
        year: index + 1,
        recommended: Math.round(recommendedRevenue * ratio * 10) / 10
    }));

    const notes: string[] = [];
    if (subsidyAmount >= 600) notes.push("大型計畫（≥600萬），ROAS 基準下調 20%");
    else if (subsidyAmount >= 300) notes.push("中型計畫（300-600萬），ROAS 基準下調 10%");

    if (['資通訊', '軟體', '數位服務'].includes(industry)) notes.push("軟體/數位產業，期待較高 ROAS（5-10 倍）");
    else if (['生技/醫療'].includes(industry)) notes.push("生技產業，考慮研發風險，可接受較低 ROAS");

    if (companyRevenue > 0) {
        if (companyRevenue < 1000) notes.push("新創公司，可適度降低 ROAS 要求");
        else if (companyRevenue > 20000) notes.push("大型公司，應展現較高 ROAS");
    }

    return {
        subsidyAmount,
        industry,
        phase,
        yearlyBreakdown,
        targetRevenue: Math.round(recommendedRevenue * 10) / 10,
        targetROAS: Math.round(benchmark.recommended * adjustmentFactor * 100) / 100,
        notes
    };
}

export function formatROIAsMarkdown(result: ROIResult): string {
    let output = `## 📈 預期效益與 ROI (系統自動估算)\n\n`;
    output += `- 補助金額：**${result.subsidyAmount} 萬元**\n`;
    output += `- 產業別：**${result.industry}**\n`;
    output += `- 計畫期間：**${result.phase.toUpperCase()}**\n\n`;

    output += `### 系統建議產值目標\n\n`;
    output += `> **3年累積產值：${result.targetRevenue} 萬 (ROAS: ${result.targetROAS} 倍)**\n\n`;

    output += `| 年度 | 分年預估營收（萬元） |\n|------|--------|\n`;
    for (const year of result.yearlyBreakdown) {
        output += `| 第 ${year.year} 年 | ${year.recommended} |\n`;
    }

    if (result.notes.length > 0) {
        output += `\n### 系統估算說明\n\n`;
        output += result.notes.map(n => `- ${n}`).join('\n') + '\n';
    }

    output += `\n> ⚠️ 請大模型在撰寫計畫書時，務必採用以上精確數值作為骨幹，再以專業口吻進行段落擴寫。\n`;

    return output;
}
