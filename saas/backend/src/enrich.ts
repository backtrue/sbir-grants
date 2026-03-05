import { Hono } from 'hono'
import { authMiddleware, Bindings, Variables } from './middleware'
import { getAIProvider } from './ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'

const enrichApp = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

interface EnrichRequest {
    question_id: string
    question_text: string
    category: string
    user_answer: string
    // Optional context from other already-answered questions (full state)
    context?: Record<string, string | number | boolean>
}

interface EnrichResponse {
    sufficient: boolean
    is_question?: boolean  // true if the user's answer is a question or expression of confusion
    explanation?: string   // why it's insufficient, or a tutorial if is_question is true
    enriched_answer?: string // the AI-generated richer version, or an auto-drafted example
}

// Map of question IDs → minimum quality criteria for SBIR
import criteriaData from '../../../shared_domain/enrich_criteria.json';

const ENRICHABLE_QUESTIONS: Record<string, { min_chars: number; criteria: string, expand_hint?: string }> = criteriaData.enrichable_questions as any;

enrichApp.post('/', authMiddleware, async (c) => {
    try {
        const body = await c.req.json<EnrichRequest>()
        const { question_id, question_text, category, user_answer, context } = body

        // Only process enrichable questions
        const criteria = ENRICHABLE_QUESTIONS[question_id]
        if (!criteria) {
            return c.json<EnrichResponse>({ sufficient: true })
        }

        // Quick pre-check: if the answer is very long, likely sufficient
        if (user_answer.trim().length >= criteria.min_chars * 2) {
            return c.json<EnrichResponse>({ sufficient: true })
        }

        let contextStr = context
            ? `\n已知背景資訊（請在生成時參考）：\n${Object.entries(context)
                .filter(([, v]) => v)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join('\n')}`
            : ''

        // (Phase 4) Web Search Integration for Market Size
        if (question_id === 'market_size' && c.env.TAVILY_API_KEY) {
            try {
                const targetMarket = context?.['target_market'] || '台灣';
                const solutionDesc = context?.['solution_description']
                    ? String(context['solution_description']).substring(0, 50)
                    : '創新產品';

                const searchQuery = `${targetMarket} ${solutionDesc} 市場規模 產值 CAGR`;
                console.log(`[enrich] Fetching real market data from Tavily for query: ${searchQuery}`);

                const tavilyRes = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: c.env.TAVILY_API_KEY,
                        query: searchQuery,
                        search_depth: "basic",
                        include_answer: true,
                        max_results: 3
                    })
                });

                if (tavilyRes.ok) {
                    const tavilyData: any = await tavilyRes.json();
                    if (tavilyData.answer || (tavilyData.results && tavilyData.results.length > 0)) {
                        contextStr += `\n\n【即時聯網市調數據 (Tavily)】\n摘要: ${tavilyData.answer || ''}\n參考文獻:\n${tavilyData.results?.map((r: any) => `- ${r.title}: ${r.content}`).join('\n')}\n`;
                    }
                } else {
                    console.error('[enrich] Tavily search failed:', await tavilyRes.text());
                }
            } catch (e: any) {
                console.error('[enrich] Tavily integration error:', e.message);
            }
        }

        const systemPrompt = `你是一位熟悉政府 SBIR（中小企業創新研發計畫）審查標準的資深顧問。
你的任務是評估使用者對以下問題的回答是否足夠詳實，以通過 SBIR 審查委員的評分。

問題（類別：${category}）：${question_text}

充分標準：${criteria.criteria}
${contextStr}

請依照以下規則分析：
1. 如果使用者的回答已滿足充分標準，回傳 JSON：{"sufficient": true}
2. 如果使用者的回答不滿足標準（太短、太籠統、缺乏具體數字或細節），請進一步判斷：
   【狀況 A：使用者是在嘗試作答，只是寫得不好】
   - 回傳 JSON：{"sufficient": false, "is_question": false, "explanation": "一句話指出不足", "enriched_answer": "幫他擴寫好的完整草稿"}
   - explanation：用一句話說明不足之處（20字以內，中文，不帶主詞語氣直接說明問題）。
   - enriched_answer：基於使用者已提供的資訊，直接以完整的語句擴寫，幫助他們把缺乏的細節「補齊」。遇到需要具體數字、特定技術名稱或情境時，請直接「具體生造、推測一個符合情境的專業範例數字或方案」，讓讀起來是 100% 完整無缺漏的計畫書草稿。絕對不要出現「請補充」等填空詞。

   【狀況 B：使用者表示不知道、不懂、求助、或是反問專有名詞（如：不知道、什麼是 TRL、怎麼估算）】
   - 回傳 JSON：{"sufficient": false, "is_question": true, "explanation": "專屬的白話文教學", "enriched_answer": "幫他算好/寫好的完整草稿"}
   - explanation：轉化為「溫柔得體的白話文教學」。請根據背景資訊（產業、公司名稱等），用白話文解釋該題目的專有名詞或意涵（約 50-80 字）。
   - enriched_answer：不要讓使用者自己想！請直接根據已知背景，幫他「無中生有」出一個極度合理、有模有樣的完整段落或推算數字（例如直接幫他算好一份有理有據的 TAM/SAM/SOM 數字）。這份草稿必須像專家寫的，可以讓使用者直接拿來用或修改。

規則：
- 必須且只能使用「繁體中文（正體中文, zh-TW）」輸出，絕對不能出現簡體字。
- 只回傳 JSON，不要有任何多餘文字或 markdown 格式
- 如果不確定，傾向回傳 sufficient: false 以確保品質`

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `使用者的回答：「${user_answer}」` },
        ]

        const user = c.get('user')
        const { provider, apiKey } = await getAIProvider(c, user.sub)

        let rawText = ''

        if (provider === 'cloudflare') {
            const response = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                messages,
                max_tokens: 1500,
                temperature: 0.2,
            })
            const aiResult = response as any;
            rawText = aiResult?.choices?.[0]?.message?.content || aiResult?.response || '';
        } else {
            let model: any = null;
            if (provider === 'claude') {
                const anthropic = createAnthropic({ apiKey: apiKey! });
                model = anthropic('claude-3-5-sonnet-latest');
            } else if (provider === 'openai') {
                const openai = createOpenAI({ apiKey: apiKey! });
                model = openai('gpt-4o');
            } else if (provider === 'gemini') {
                const google = createGoogleGenerativeAI({ apiKey: apiKey! });
                model = google('gemini-1.5-pro');
            }
            const { text } = await generateText({ model, messages: messages as any, temperature: 0.2 });
            rawText = text;
        }

        console.log('[enrich] RAW AI OBJECT used provider:', provider);
        console.log('[enrich] Extracted raw text:', rawText)

        // Extract JSON safely
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            console.error('[enrich] Failed to find JSON in LLM response');
            // Can't parse — treat as sufficient to avoid blocking user
            return c.json<EnrichResponse>({ sufficient: true })
        }

        let result: EnrichResponse
        try {
            result = JSON.parse(jsonMatch[0])
        } catch {
            return c.json<EnrichResponse>({ sufficient: true })
        }

        // Validate shape
        if (typeof result.sufficient !== 'boolean') {
            return c.json<EnrichResponse>({ sufficient: true })
        }

        return c.json(result)
    } catch (err) {
        console.error('[enrich] error:', err)
        // On error, don't block the user
        return c.json<EnrichResponse>({ sufficient: true })
    }
})

export default enrichApp
export { ENRICHABLE_QUESTIONS }
