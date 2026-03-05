import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Edit3, Send, X, FileEdit, Save, Check, ShieldAlert } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SectionCardProps {
    projectId: string;
    sectionIndex: number;
    title: string;
    initialContent?: string;
    initialStatus?: string;
    onGenerateComplete?: () => void;
    // Callback to let parent register the trigger function
    onRegisterTrigger: (triggerFn: () => void) => void;
}

interface AIEdit {
    original_text: string;
    revised_text: string;
    reason: string;
}

interface AIReviewResult {
    FactCheckWarnings: string[];
    Strengths: string[];
    Weaknesses: string[];
    Edits: AIEdit[];
}

export default function SectionCard({
    projectId,
    sectionIndex,
    title,
    initialContent = '',
    initialStatus = 'empty',
    onGenerateComplete,
    onRegisterTrigger
}: SectionCardProps) {
    const [content, setContent] = useState(initialContent);
    const [status, setStatus] = useState(initialStatus); // 'empty', 'generating', 'completed', 'error'
    const [generating, setGenerating] = useState(false);
    const [showRefine, setShowRefine] = useState(false);
    const [refining, setRefining] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState('');

    const [reviewData, setReviewData] = useState<AIReviewResult | null>(null);
    const [reviewing, setReviewing] = useState(false);

    useEffect(() => {
        setContent(initialContent);
        setStatus(initialStatus);
    }, [initialContent, initialStatus]);

    const handleGenerate = async () => {
        if (generating) return;
        setGenerating(true);
        setStatus('generating');
        setContent(''); // Build from scratch

        try {
            const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');
            const response = await fetch(`${API_BASE}/ai/project/${projectId}/section/${sectionIndex}/generate`, {
                method: 'POST',
                credentials: 'include', // Ensure HttpOnly cookies are sent
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate section.');
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No stream available');

            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    const chunkStr = decoder.decode(value, { stream: true });
                    console.log(`[STREAM CHUNK]`, chunkStr);
                    buffer += chunkStr;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('0:')) {
                            const rawChunk = line.substring(2);
                            try {
                                fullText += JSON.parse(rawChunk);
                            } catch (e) {
                                fullText += rawChunk;
                            }
                            let cleanedText = fullText.replace(/\\n/g, '\n');
                            cleanedText = cleanedText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
                            setContent(cleanedText);
                        }
                    }
                }
                if (done) {
                    if (buffer.startsWith('0:')) {
                        const rawChunk = buffer.substring(2);
                        try {
                            fullText += JSON.parse(rawChunk);
                        } catch (e) {
                            fullText += rawChunk;
                        }
                        let cleanedText = fullText.replace(/\\n/g, '\n');
                        cleanedText = cleanedText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
                        setContent(cleanedText);
                    }
                    break;
                }
            }
            setStatus('completed');
            if (onGenerateComplete) onGenerateComplete();
        } catch (e: any) {
            console.error(`Failed to generate section ${sectionIndex}`, e);
            setStatus('error');
        } finally {
            setGenerating(false);
        }
    };

    const handleRefine = async () => {
        if (refining || !refinePrompt.trim()) return;
        setRefining(true);
        setStatus('generating');

        try {
            const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');
            const response = await fetch(`${API_BASE}/ai/project/${projectId}/section/${sectionIndex}/refine`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refinePrompt, currentContent: content })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to refine section.');
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No stream available');
            const decoder = new TextDecoder();

            // Clear content for rewriting
            let fullText = '';
            setContent('');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    const chunkStr = decoder.decode(value, { stream: true });
                    buffer += chunkStr;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('0:')) {
                            const rawChunk = line.substring(2);
                            try {
                                fullText += JSON.parse(rawChunk);
                            } catch (e) {
                                fullText += rawChunk;
                            }
                            let cleanedText = fullText.replace(/\\n/g, '\n');
                            cleanedText = cleanedText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
                            setContent(cleanedText);
                        }
                    }
                }
                if (done) {
                    if (buffer.startsWith('0:')) {
                        const rawChunk = buffer.substring(2);
                        try {
                            fullText += JSON.parse(rawChunk);
                        } catch (e) {
                            fullText += rawChunk;
                        }
                        let cleanedText = fullText.replace(/\\n/g, '\n');
                        cleanedText = cleanedText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
                        setContent(cleanedText);
                    }
                    break;
                }
            }
            setStatus('completed');
            setShowRefine(false);
            setRefinePrompt('');
            if (onGenerateComplete) onGenerateComplete();
        } catch (e: any) {
            console.error(`Failed to refine section ${sectionIndex}`, e);
            setStatus('error');
        } finally {
            setRefining(false);
        }
    };

    const handleSaveManualEdit = async () => {
        try {
            const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');
            const response = await fetch(`${API_BASE}/ai/project/${projectId}/section/${sectionIndex}/save`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editedContent })
            });
            if (!response.ok) throw new Error('Failed to save edit');
            setContent(editedContent);
            setIsEditing(false);
        } catch (e) {
            console.error(e);
            alert('保存修改失敗');
        }
    };

    useEffect(() => {
        if (onRegisterTrigger) {
            onRegisterTrigger(handleGenerate);
        }
    }, [onRegisterTrigger]);

    const handleReview = async () => {
        if (reviewing || !content) return;
        setReviewing(true);
        try {
            const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');
            const response = await fetch(`${API_BASE}/ai/project/${projectId}/section/${sectionIndex}/review`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                throw new Error('Failed to review section.');
            }
            const data = await response.json();
            setReviewData(data);
            setShowRefine(false);
            setIsEditing(false);
        } catch (e) {
            console.error(e);
            alert('審閱失敗，請重試');
        } finally {
            setReviewing(false);
        }
    };

    const acceptEdit = async (editIndex: number) => {
        if (!reviewData) return;
        const edit = reviewData.Edits[editIndex];

        let newContent = content;
        if (content.includes(edit.original_text)) {
            newContent = content.replace(edit.original_text, edit.revised_text);
        } else {
            // Very simple fallback if exact match not found (LLMs sometimes paraphrase original slightly)
            alert('無法完全比對原文，將盡可能取代。請檢查內容與格式。');
            newContent = newContent + `\n\n【建議加入】：\n${edit.revised_text}`;
        }

        setContent(newContent);

        // Save to DB
        try {
            const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');
            await fetch(`${API_BASE}/ai/project/${projectId}/section/${sectionIndex}/save`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent })
            });
        } catch (e) {
            console.error("Failed to auto-save after accepting edit", e);
        }

        const newEdits = [...reviewData.Edits];
        newEdits.splice(editIndex, 1);
        setReviewData({ ...reviewData, Edits: newEdits });
    };

    const rejectEdit = (editIndex: number) => {
        if (!reviewData) return;
        const newEdits = [...reviewData.Edits];
        newEdits.splice(editIndex, 1);
        setReviewData({ ...reviewData, Edits: newEdits });
    };

    const closeReview = () => {
        setReviewData(null);
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6 transition-all hover:shadow-md">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 text-xs w-6 h-6 flex items-center justify-center rounded-full font-bold">
                        {sectionIndex + 1}
                    </span>
                    {title}
                </h3>
                <div className="flex items-center gap-3">
                    {status === 'completed' && (
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                            已完成
                        </span>
                    )}
                    {status === 'error' && (
                        <span className="text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> 發生錯誤
                        </span>
                    )}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || refining || isEditing}
                        className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {generating && !refining ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                        {content ? '重新生成' : '開始撰寫'}
                    </button>
                    {content && !isEditing && (
                        <>
                            <button
                                onClick={() => {
                                    setEditedContent(content);
                                    setIsEditing(true);
                                    setShowRefine(false);
                                    setReviewData(null);
                                }}
                                disabled={generating || refining}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <FileEdit className="w-3.5 h-3.5" />
                                直接編輯
                            </button>
                            <button
                                onClick={() => {
                                    setShowRefine(!showRefine);
                                    setReviewData(null);
                                }}
                                disabled={generating || refining}
                                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                                修改與擴充
                            </button>
                            <button
                                onClick={handleReview}
                                disabled={generating || refining || reviewing}
                                className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-100 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                {reviewing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                🤖 專業顧問審閱
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showRefine && !isEditing && (
                <div className="bg-indigo-50/50 px-6 py-4 border-b border-slate-200">
                    <div className="flex items-start gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-indigo-900 mb-1">指示 AI 如何修改這個段落：</label>
                            <textarea
                                value={refinePrompt}
                                onChange={(e) => setRefinePrompt(e.target.value)}
                                placeholder="例如：請把語氣改得更自信、幫我補充一段因為勞工短缺帶來影響的數據..."
                                className="w-full text-sm rounded border border-indigo-200 px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[60px]"
                            />
                        </div>
                        <div className="flex flex-col gap-2 pt-5">
                            <button
                                onClick={handleRefine}
                                disabled={refining || !refinePrompt.trim()}
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                            >
                                {refining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                送出優化
                            </button>
                            <button
                                onClick={() => setShowRefine(false)}
                                disabled={refining}
                                className="px-3 py-1.5 bg-white text-slate-600 border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                                <X className="w-3.5 h-3.5" /> 取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {reviewData && !isEditing && (
                <div className="bg-rose-50/50 px-6 py-4 border-b border-rose-200">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                            🤖 AI 顧問審閱結果 (Track Changes)
                        </h4>
                        <button onClick={closeReview} className="text-rose-500 hover:text-rose-700 bg-white border border-rose-200 rounded px-2 py-1 text-xs">
                            關閉審閱
                        </button>
                    </div>

                    {reviewData.FactCheckWarnings && reviewData.FactCheckWarnings.length > 0 && reviewData.FactCheckWarnings[0] !== "如果沒有事實錯誤，回傳空陣列" && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                            <h5 className="text-red-800 font-semibold mb-2 flex items-center gap-2 text-sm">
                                <ShieldAlert className="w-4 h-4" /> 【事實查核警告：偵測到潛在幻覺】
                            </h5>
                            <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                                {reviewData.FactCheckWarnings.map((warning, i) => (
                                    <li key={i}>{warning}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {reviewData.Edits && reviewData.Edits.length > 0 ? (
                        <div className="space-y-4">
                            {reviewData.Edits.map((edit, idx) => (
                                <div key={idx} className="bg-white border border-rose-100 shadow-sm rounded-lg p-4 relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold bg-rose-100 text-rose-800 px-2 py-1 rounded">
                                            {edit.reason}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => acceptEdit(idx)}
                                                className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200"
                                            >
                                                <Check className="w-3.5 h-3.5" /> 接受
                                            </button>
                                            <button
                                                onClick={() => rejectEdit(idx)}
                                                className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded border border-slate-200"
                                            >
                                                <X className="w-3.5 h-3.5" /> 拒絕
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                        <div className="bg-red-50/50 p-3 rounded border border-red-100 text-sm">
                                            <div className="text-xs text-red-400 font-semibold mb-1">刪除：</div>
                                            <div className="text-slate-800 line-through decoration-red-400/50 select-text break-words">
                                                {edit.original_text}
                                            </div>
                                        </div>
                                        <div className="bg-emerald-50/50 p-3 rounded border border-emerald-100 text-sm">
                                            <div className="text-xs text-emerald-500 font-semibold mb-1">加入：</div>
                                            <div className="text-slate-800 select-text break-words">
                                                {edit.revised_text}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-rose-700 bg-white rounded p-4 border border-rose-100">
                            太棒了！AI 顧問認為目前的內容很完整，沒有建議任何修改。
                        </div>
                    )}
                </div>
            )}

            <div className={`p-6 ${generating ? 'bg-amber-50/30' : ''}`}>
                {isEditing ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="w-full text-sm leading-relaxed p-4 rounded-xl border border-indigo-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 resize-y min-h-[400px] text-slate-700 bg-white"
                        />
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSaveManualEdit}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm"
                            >
                                <Save className="w-4 h-4" /> 儲存修改內容
                            </button>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {!content && !generating && (
                            <div className="text-center py-8 text-slate-400">
                                <p className="text-sm">尚未生成內容。點擊上方按鈕讓專家開始代筆。</p>
                            </div>
                        )}

                        {content && (
                            <article className="prose prose-sm prose-amber max-w-none text-slate-800">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {content}
                                </ReactMarkdown>
                            </article>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
