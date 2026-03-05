import { useState, useRef, useEffect } from 'react';
import { Send, CheckCircle2, Sparkles, MessageSquare, Edit2, RotateCcw, Zap, Loader2, Wand2, X } from 'lucide-react';
import questionsData from '../data/questions.json';
import axios from 'axios';
import { useParams } from 'react-router-dom';

interface Question {
    id: string;
    category: string;
    question: string;
    order: number;
    type: 'text' | 'choice' | 'number' | 'textarea' | 'scale';
    required: boolean;
    placeholder?: string;
    options?: string[];
    validation?: any;
    depends_on?: any;
}

const questions: Question[] = questionsData.questions as Question[];

interface AIInterviewerProps {
    initialAnswers?: Record<string, any>;
    onSaveProgress: (answers: Record<string, any>) => Promise<void>;
}

export default function AIInterviewer({ initialAnswers = {}, onSaveProgress }: AIInterviewerProps) {
    const { id: projectId } = useParams<{ id: string }>();
    const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers);
    // Determine the first unanswered question based on order
    const firstUnansweredIndex = questions.findIndex(q => !answers[q.id] || answers[q.id].trim() === '');
    const [currentStepIndex, setCurrentStepIndex] = useState(firstUnansweredIndex >= 0 ? firstUnansweredIndex : questions.length);

    const [inputValue, setInputValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [aiAutoFilled, setAiAutoFilled] = useState<Set<string>>(new Set());
    const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({}); // Store extracted answers as suggestions
    // Consultant warm acknowledgement messages per question ID
    const [consultantAcks, setConsultantAcks] = useState<Record<string, string>>({});
    // Typing indicator: which question the consultant is "typing" a response for
    const [typingForId, setTypingForId] = useState<string | null>(null);
    // Enrich state: when AI suggests a richer answer and is waiting for user to confirm
    const [enrichState, setEnrichState] = useState<{
        questionId: string;
        explanation: string; // shown in consultant bubble
        isQuestion?: boolean;
    } | null>(null);

    // AI Regeneration State
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [showRegenerateInput, setShowRegenerateInput] = useState(false);
    const [regenerateInstruction, setRegenerateInstruction] = useState('');

    // IDs of questions where AI quality check is applied
    const ENRICHABLE_IDS = new Set([
        'problem_description', 'current_solutions', 'solution_description',
        'innovation_points', 'quantified_benefits', 'technical_barriers',
        'competitive_advantage', 'key_risks', 'target_market', 'market_size',
        'team_composition', 'budget_breakdown', 'revenue_calculation_basis',
        'current_trl', 'target_trl',
        'expected_revenue_year1', 'expected_revenue_year2', 'expected_revenue_year3'
    ]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- Warm acknowledgement template bank ---
    // Returns a natural consultant response acknowledging the user's answer
    const generateAck = (question: Question, answer: string): string => {
        const name = answer.trim().split(/[，,、。\s]/)[0]; // rough first-segment extraction
        const acks: Record<string, () => string> = {
            // Company name
            company_name: () => `很高興認識您！「${name}」這個名字我記下了，接下來我需要多了解一下貴公司的產業背景。`,
            applicant_name: () => `謝謝您！${name}，我已記錄下來。`,
            // Catch-all for short answers
        };
        if (acks[question.id]) return acks[question.id]();

        // Generic warm pools based on category / length
        const shortResponsePhrases = [
            `好的，謝謝您！我已記下關於「${question.category}」的重要資訊。`,
            `了解了！${question.category}這部分對計畫書很關鍵，感謝您的說明。`,
            `謝謝，這些資訊相當有幫助！讓我繼續下一個問題。`,
        ];
        const longResponsePhrases = [
            `非常詳細的說明，謝謝您！我已把這些重點記下來，這對後續撰寫「${question.category}」這段內容會很有幫助。`,
            `感謝您提供這麼完整的背景！${question.category}的脈絡我清楚了，我們繼續。`,
            `您描述得很清晰，謝謝！這對計畫書的完整性有很大的幫助，讓我們接著往下走。`,
        ];
        const pool = answer.length > 30 ? longResponsePhrases : shortResponsePhrases;
        return pool[Math.floor(Math.random() * pool.length)];
    };

    // Auto scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [currentStepIndex, editingQuestionId]);

    const isFinished = currentStepIndex >= questions.length && !editingQuestionId;
    const currentQuestion = editingQuestionId
        ? questions.find(q => q.id === editingQuestionId)
        : questions[currentStepIndex];

    useEffect(() => {
        if (currentQuestion && answers[currentQuestion.id]) {
            setInputValue(answers[currentQuestion.id]);
        } else if (currentQuestion && aiSuggestions[currentQuestion.id]) {
            setInputValue(aiSuggestions[currentQuestion.id]);
        } else {
            setInputValue('');
        }
    }, [currentQuestion, answers, editingQuestionId, aiSuggestions]);

    const handleSend = async () => {
        if (!currentQuestion) return;

        // Basic validation
        if (currentQuestion.required && (!inputValue || inputValue.trim() === '')) {
            alert('此為必填項目，請提供一些資訊。');
            return;
        }

        setIsSaving(true);

        // --- AI Answer Enrichment Check ---
        // Run for enrichable questions, even if editing historical answers, but skip if they are currently confirming a suggested enrichment
        const isEnrichable = ENRICHABLE_IDS.has(currentQuestion.id);
        const isConfirmingEnrichment = enrichState?.questionId === currentQuestion.id;

        if (isEnrichable && !isConfirmingEnrichment) {
            try {
                setIsExtracting(true);
                // Pass all currently collected answers as context so the AI can use facts like budget limits, team size, etc.
                const ctx = { ...answers };
                const enrichRes = await axios.post(
                    `${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://sbir-api.thinkwithblack.com')}/api/enrich`,
                    {
                        question_id: currentQuestion.id,
                        question_text: currentQuestion.question,
                        category: currentQuestion.category,
                        user_answer: inputValue,
                        context: ctx,
                    },
                    { withCredentials: true }
                );
                const enrichData = enrichRes.data as {
                    sufficient: boolean;
                    is_question?: boolean;
                    explanation?: string;
                    enriched_answer?: string;
                };

                if (!enrichData.sufficient && enrichData.enriched_answer) {
                    // AI thinks this answer needs more depth.
                    // Pre-fill the input with the enriched version and stay on this question.
                    setEnrichState({
                        questionId: currentQuestion.id,
                        explanation: enrichData.explanation ?? '這個回答可以更詳細一點。',
                        isQuestion: enrichData.is_question,
                    });
                    setInputValue(enrichData.enriched_answer);
                    setIsSaving(false);
                    setIsExtracting(false);
                    return; // Stop here — wait for user to edit and confirm
                }
            } catch (enrichErr) {
                // Non-critical — continue with the user's original answer
                console.warn('[enrich] quality check skipped:', enrichErr);
            } finally {
                setIsExtracting(false);
            }
        }

        // If we reach here, either: answer is sufficient, or user confirmed enriched version
        // Clear enrich state
        if (isConfirmingEnrichment) setEnrichState(null);

        let finalInputValue = inputValue;
        const newSuggestions = { ...aiSuggestions };
        const newlyAutoFilled = new Set<string>(aiAutoFilled);

        // --- Phase 11.8: Open Data Integration (g0v API) ---
        if (currentQuestion.id === 'company_name' && finalInputValue.trim()) {
            try {
                setIsExtracting(true);
                const res = await axios.get(`https://company.g0v.ronny.tw/api/search?q=${encodeURIComponent(finalInputValue)}`);
                if (res.data?.found > 0) {
                    const activeCompany = res.data.data.find((c: any) => c['公司狀況'] === '核准設立' || c['現況'] === '核准設立' || c['登記現況'] === '核准設立');
                    if (activeCompany) {
                        const officialName = activeCompany['公司名稱'] || activeCompany['商業名稱'];
                        if (officialName && officialName !== finalInputValue) {
                            finalInputValue = officialName;
                            newlyAutoFilled.add('company_name');
                        }

                        const capitalRaw = activeCompany['資本總額(元)'] || activeCompany['實收資本額(元)'] || activeCompany['資本額(元)'];
                        if (capitalRaw) {
                            const capitalNum = parseInt(capitalRaw.toString().replace(/,/g, ''), 10);
                            if (!isNaN(capitalNum) && capitalNum > 0) {
                                const capitalInTenK = Math.floor(capitalNum / 10000);
                                newSuggestions['capital'] = capitalInTenK.toString();
                                newlyAutoFilled.add('capital');
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('[OpenData] Failed to fetch company data', err);
            } finally {
                setIsExtracting(false);
            }
        }

        // Start with the answer the user explicitly typed (or auto-corrected)
        let mergedAnswers = { ...answers, [currentQuestion.id]: finalInputValue };

        // --- Phase 10: Dynamic Knowledge Extraction ---
        if (!editingQuestionId) {
            const unansweredQuestions = questions.filter(
                (q) => q.id !== currentQuestion.id && (!mergedAnswers[q.id] || mergedAnswers[q.id].trim() === '')
            ).map(q => ({ id: q.id, question: q.question, category: q.category }));

            if (unansweredQuestions.length > 0) {
                try {
                    setIsExtracting(true);
                    const extractRes = await axios.post(
                        `${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://sbir-api.thinkwithblack.com')}/api/extract`,
                        { user_input: finalInputValue, unanswered_questions: unansweredQuestions },
                        { withCredentials: true }
                    );
                    const extracted: { question_id: string; extracted_answer: string }[] = extractRes.data?.extracted ?? [];
                    if (extracted.length > 0) {
                        const autoFilledLabels: string[] = [];

                        extracted.forEach(({ question_id, extracted_answer }) => {
                            // Only store as suggestion if the user hasn't explicitly answered it yet
                            if (!mergedAnswers[question_id] || mergedAnswers[question_id].trim() === '') {
                                newSuggestions[question_id] = extracted_answer;
                                newlyAutoFilled.add(question_id);
                                const q = questions.find(q => q.id === question_id);
                                if (q) autoFilledLabels.push(`「${q.category}」`);
                            }
                        });

                        setAiSuggestions(newSuggestions);
                        setAiAutoFilled(newlyAutoFilled);
                    }
                } catch (extractError) {
                    console.warn('[extract] AI extraction skipped:', extractError);
                } finally {
                    setIsExtracting(false);
                }
            }
        }

        try {
            await onSaveProgress({ wizardAnswers: mergedAnswers });
            setAnswers(mergedAnswers);
            setInputValue('');

            if (editingQuestionId) {
                setEditingQuestionId(null);
            } else {
                const ackText = generateAck(currentQuestion, inputValue);
                setTypingForId(currentQuestion.id);
                await new Promise(res => setTimeout(res, 800));
                setConsultantAcks(prev => ({ ...prev, [currentQuestion.id]: ackText }));
                setTypingForId(null);
                await new Promise(res => setTimeout(res, 400));

                const nextIndex = questions.findIndex(
                    (q, idx) => idx > currentStepIndex && (!mergedAnswers[q.id] || mergedAnswers[q.id].trim() === '')
                );

                if (nextIndex !== -1) {
                    setCurrentStepIndex(nextIndex);
                    // Clear the suggestion for the current question if it existed, so we don't hold onto stale state
                    setAiSuggestions(prev => {
                        const copy = { ...prev };
                        delete copy[currentQuestion.id];
                        return copy;
                    });
                } else {
                    const anyUnanswered = questions.findIndex(q => !mergedAnswers[q.id] || mergedAnswers[q.id].trim() === '');
                    setCurrentStepIndex(anyUnanswered !== -1 ? anyUnanswered : questions.length);
                }
            }
        } catch (e) {
            console.error('Save failed', e);
            alert('保存失敗，請重試。');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRegenerate = async (prompt?: string) => {
        if (!currentQuestion) return;

        const instructionToUse = prompt || regenerateInstruction;
        if (!instructionToUse.trim()) return;

        setIsRegenerating(true);
        try {
            const res = await axios.post(
                `${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://sbir-api.thinkwithblack.com')}/api/regenerate`,
                {
                    original_question: currentQuestion.question,
                    original_criteria: currentQuestion.validation?.criteria, // Assuming criteria is under validation
                    current_draft: inputValue,
                    modification_prompt: instructionToUse,
                    context: { ...answers, project_id: projectId }
                },
                { withCredentials: true }
            );

            if (res.data?.regenerated_text) {
                const newText = res.data.regenerated_text;
                setInputValue(newText);
                setShowRegenerateInput(false);
                setRegenerateInstruction('');

                // Auto-save the rewritten result to the database and global state silently.
                // This ensures if the user immediately switches tabs, the rewrite is not lost.
                try {
                    const mergedAnswers = {
                        ...answers,
                        [currentQuestion.id]: newText,
                    };
                    setAnswers(mergedAnswers);
                    await onSaveProgress({ wizardAnswers: mergedAnswers });
                } catch (saveErr) {
                    console.error('[regenerate auto-save] failed:', saveErr);
                }
            }
        } catch (err) {
            console.error('[regenerate] failed:', err);
            alert('重新生成失敗，請稍後再試。');
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // isComposing: true means the user is still in an IME composition (e.g. typing Chinese)
        // We must NOT intercept Enter during composition, or it auto-submits mid-character
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    // Derived historical QA up to the current point
    // We show all questions that have been answered (in order), 
    // PLUS the current active question if we are not finished
    const historicalQA = questions.filter(q =>
        (answers[q.id] && answers[q.id].trim() !== '') ||
        (currentQuestion && q.id === currentQuestion.id && !isFinished) ||
        (editingQuestionId === q.id)
    );

    return (
        <div className="flex flex-col h-[75vh] bg-slate-50 relative rounded-xl border border-slate-200 shadow-sm overflow-hidden">


            {/* Header */}
            <div className="bg-white border-b border-slate-200 p-4 shrink-0 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">SBIR 提案顧問</h3>
                        <p className="text-xs text-slate-500">
                            {isFinished ? '訪談完成，可生成草稿' : '正在收集計畫所需資訊...'}
                        </p>
                    </div>
                </div>
                {!isFinished && (
                    <div className="flex items-center gap-2">
                        {isExtracting && (
                            <div className="flex items-center gap-1.5 text-xs text-indigo-600">
                                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                AI 分析中
                            </div>
                        )}
                        <div className="text-xs font-medium bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                            進度：{Object.keys(answers).filter(k => answers[k] && answers[k].trim() !== '').length} / {questions.length}
                        </div>
                    </div>
                )}
            </div>

            {/* Chat History Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

                {/* Intro message */}
                <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-sm text-slate-700 max-w-[85%]">
                        <p>您好！我是您的專屬計畫書撰寫顧問。</p>
                        <p className="mt-2">接下來，我會引導您一步步梳理專案構想。您只需要像平常聊天一樣回答我的問題，我會在背景自動把您的知識切塊並儲存。我們開始吧！</p>
                    </div>
                </div>

                {/* Dynamic QA Flow */}
                {historicalQA.map((q) => {
                    const isCurrentFocus = currentQuestion?.id === q.id;
                    const hasAnswer = answers[q.id] && answers[q.id].trim() !== '';

                    return (
                        <div key={q.id} className="space-y-6">
                            {/* Consultant Question */}
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                                    <Sparkles className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div className={`border rounded-2xl p-4 shadow-sm text-sm max-w-[85%] ${isCurrentFocus ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
                                    <div className="text-xs font-semibold text-indigo-600 mb-1">{q.category}</div>
                                    <div className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                                        {q.question.replace(/\\n/g, '\n')}
                                    </div>
                                    {q.placeholder && isCurrentFocus && (
                                        <div className="mt-3 text-xs text-slate-500 bg-white/50 p-2 rounded border border-indigo-100">
                                            💡 提示：{q.placeholder}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Enrichment explanation bubble — appears when AI has pre-filled a richer answer OR when giving a tutorial */}
                            {isCurrentFocus && enrichState?.questionId === q.id && (
                                <div className="flex gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${enrichState.isQuestion ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                                        <Sparkles className={`w-4 h-4 ${enrichState.isQuestion ? 'text-emerald-600' : 'text-amber-600'}`} />
                                    </div>
                                    <div className={`border rounded-2xl p-4 shadow-sm text-sm text-slate-700 max-w-[90%] leading-relaxed flex-1 ${enrichState.isQuestion ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                                        <div className={`font-semibold mb-1.5 flex items-center gap-1.5 ${enrichState.isQuestion ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            {enrichState.isQuestion ? (
                                                <><span>🎓</span> 顧問解惑</>
                                            ) : (
                                                <><Zap className="w-3.5 h-3.5" /> 顧問已幫您草擬了一份更專業的版本！</>
                                            )}
                                        </div>
                                        <div className="text-slate-600 text-xs leading-relaxed mb-3">
                                            {enrichState.explanation}
                                            <br />
                                            {enrichState.isQuestion ? (
                                                <div className="mt-2 text-emerald-600 font-medium">✨ 我已經根據您的背景在下方為您預填了一份草稿，您可以直接參考修改！</div>
                                            ) : (
                                                <span className="mt-1 block">您可以直接在下方輸入框修改這份草稿，或者再告訴我大方向重新生成。</span>
                                            )}
                                        </div>


                                    </div>
                                </div>
                            )}

                            {/* User Answer Bubble (if not currently focused) */}
                            {!isCurrentFocus && hasAnswer && (
                                <>
                                    <div className="flex gap-4 flex-row-reverse group">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0 mt-1">
                                            <MessageSquare className="w-4 h-4 text-slate-500" />
                                        </div>
                                        <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm p-4 shadow-sm text-sm max-w-[85%] whitespace-pre-wrap relative">
                                            {aiAutoFilled.has(q.id) && (
                                                <div className="flex items-center gap-1 text-[10px] font-semibold text-indigo-200 mb-1.5">
                                                    {q.id === 'company_name' || q.id === 'capital' ? (
                                                        <>💡 經濟部公開資料同步</>
                                                    ) : (
                                                        <><Zap className="w-2.5 h-2.5" /> AI 自動萃取</>
                                                    )}
                                                </div>
                                            )}
                                            {answers[q.id]}
                                            <button
                                                onClick={() => setEditingQuestionId(q.id)}
                                                className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-md opacity-0 group-hover:opacity-100 transition"
                                                title="編輯此回答"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Consultant typing indicator */}
                                    {typingForId === q.id && (
                                        <div className="flex gap-4">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                                                <Sparkles className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Consultant warm acknowledgement */}
                                    {consultantAcks[q.id] && typingForId !== q.id && (
                                        <div className="flex gap-4">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                                                <Sparkles className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-sm text-sm text-slate-700 max-w-[85%] leading-relaxed">
                                                {consultantAcks[q.id]}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}

                {/* End State */}
                {isFinished && (
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm text-sm text-slate-700 max-w-[85%]">
                            <p className="font-semibold text-emerald-700 mb-1">訪談完成！🎉</p>
                            <p>您已提供足夠的背景資訊。如果您對這些答案感到滿意，可以直接切換至上方的 <strong>「AI Draft」</strong> 頁籤，讓我幫您生成完整的計畫書草稿喔！</p>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area (Only shows if there is an active question) */}
            {!isFinished && currentQuestion && (
                <div className="bg-white border-t border-slate-200 p-4 shrink-0 shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.02)]">
                    <div className="max-w-4xl mx-auto flex flex-col gap-3">
                        {/* REGENERATE INSTRUCTION BOX */}
                        {showRegenerateInput && (
                            <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl p-3 flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in relative shadow-sm">
                                <div className="flex gap-2">
                                    {['更生動口語', '更具體專業', '再精簡強調重點', '改用條列式'].map(chip => (
                                        <button
                                            key={chip}
                                            onClick={() => handleRegenerate(chip)}
                                            disabled={isRegenerating}
                                            className="text-[11px] px-2 py-1 bg-white border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 text-indigo-700 rounded-md transition-colors disabled:opacity-50 shadow-sm"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2 items-center">
                                    <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mx-1" />
                                    <input
                                        autoFocus
                                        type="text"
                                        value={regenerateInstruction}
                                        onChange={e => setRegenerateInstruction(e.target.value)}
                                        placeholder="請輸入給 AI 的修改指示（例如：數值算錯了，請用 USD 699 重新計算）..."
                                        className="flex-1 bg-transparent border-none text-sm focus:outline-none focus:ring-0 placeholder:text-indigo-400 text-indigo-900"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                                e.preventDefault();
                                                handleRegenerate();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={() => handleRegenerate()}
                                        disabled={isRegenerating || !regenerateInstruction.trim()}
                                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                                    >
                                        {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : '開始微調'}
                                    </button>
                                </div>
                                <button onClick={() => setShowRegenerateInput(false)} className="absolute -top-2 -right-2 bg-white rounded-full p-1.5 border shadow-sm text-slate-400 hover:text-slate-600 transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        <div className="relative flex items-end gap-3">
                            <div className="flex-1 relative">
                                {editingQuestionId && (
                                    <div className="absolute -top-8 left-0 text-xs font-medium text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-t-lg border border-amber-200 border-b-0">
                                        <RotateCcw className="w-3 h-3" />
                                        正在修改過去的回答
                                    </div>
                                )}
                                <textarea
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={isSaving}
                                    placeholder={currentQuestion.type === 'choice' && currentQuestion.options ? `例如: ${currentQuestion.options.join(', ')}` : "請輸入您的回答... (Shift + Enter 換行)"}
                                    className={`w-full bg-slate-50 border text-slate-800 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 transition resize-none
                                        ${enrichState?.questionId === currentQuestion.id
                                            ? enrichState.isQuestion
                                                ? 'border-emerald-300 focus:ring-emerald-500/50 focus:border-emerald-500 bg-emerald-50/40 rounded-tl-none'
                                                : 'border-amber-300 focus:ring-amber-500/50 focus:border-amber-500 bg-amber-50/30 rounded-tl-none'
                                            : editingQuestionId
                                                ? 'rounded-tl-none border-amber-300 focus:ring-amber-500/50 focus:border-amber-500 bg-amber-50/20'
                                                : 'border-slate-200 focus:ring-indigo-500/50 focus:border-indigo-500'
                                        }`}
                                    rows={currentQuestion.type === 'textarea' ? 5 : 2}
                                />
                            </div>

                            <div className="flex flex-col gap-2 shrink-0">
                                {inputValue.trim().length > 0 && !showRegenerateInput && (
                                    <button
                                        onClick={() => setShowRegenerateInput(true)}
                                        disabled={isSaving || isExtracting}
                                        className="h-8 px-3 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border border-indigo-200 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                        title="有內容想微調？呼叫 AI 幫你改！"
                                    >
                                        <Wand2 className="w-3.5 h-3.5" /> AI 幫我改
                                    </button>
                                )}
                                <button
                                    onClick={handleSend}
                                    disabled={isSaving || isExtracting || inputValue.trim() === ''}
                                    className={`h-[46px] px-5 w-full rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 ${isSaving || isExtracting || inputValue.trim() === ''
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : enrichState?.questionId === currentQuestion.id
                                            ? enrichState.isQuestion
                                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                                : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                                            : editingQuestionId
                                                ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                        }`}
                                >
                                    {isSaving || isExtracting ? (
                                        <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                    ) : enrichState?.questionId === currentQuestion.id ? (
                                        enrichState.isQuestion ? <>✅ 沒問題，送出</> : <>✅ 確認送出</>
                                    ) : editingQuestionId ? (
                                        <>更新儲存</>
                                    ) : (
                                        <><Send className="w-4 h-4" /> 送出</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
