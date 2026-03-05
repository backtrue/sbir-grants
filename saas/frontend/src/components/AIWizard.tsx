import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft, Save } from 'lucide-react';
import questionsData from '../data/questions.json';

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
    scale?: any;
}

const questions: Question[] = questionsData.questions as Question[];

interface AIWizardProps {
    initialAnswers?: Record<string, any>;
    onSaveProgress: (answers: Record<string, any>) => void;
}

export default function AIWizard({ initialAnswers, onSaveProgress }: AIWizardProps) {
    const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers || {});
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Filter questions based on dependencies
    const visibleQuestions = questions.filter(q => {
        if (!q.depends_on) return true;
        const { question_id, condition } = q.depends_on;
        const dependentValue = answers[question_id];

        if (dependentValue === undefined) return false;

        if (condition === '> 0') return Number(dependentValue) > 0;
        if (condition === 'true') return !!dependentValue;
        if (condition.startsWith('=')) {
            const val = condition.replace('=', '').trim();
            return String(dependentValue) === val;
        }
        return true;
    });

    // Group questions by category for the wizard steps
    const categories = Array.from(new Set(visibleQuestions.map(q => q.category)));
    const currentCategory = categories[currentStepIndex];
    const currentQuestions = visibleQuestions.filter(q => q.category === currentCategory);

    const isLastStep = currentStepIndex === categories.length - 1;

    const handleAnswerChange = (id: string, value: any) => {
        setAnswers(prev => ({ ...prev, [id]: value }));
    };

    const isCurrentStepValid = () => {
        return currentQuestions.every(q => {
            const val = answers[q.id];

            // If required and value is missing/empty, validation fails
            if (q.required && (val === undefined || val === null || val === '')) {
                return false;
            }

            // If not required and value is missing/empty, validation passes
            if (!q.required && (val === undefined || val === null || val === '')) {
                return true;
            }

            // Apply specific validation rules if the value exists
            if (q.validation) {
                if (q.type === 'text' || q.type === 'textarea') {
                    if (q.validation.min_length && String(val).length < q.validation.min_length) return false;
                }
                if (q.type === 'number') {
                    if (q.validation.min && Number(val) < q.validation.min) return false;
                }
            }
            return true;
        });
    };

    const handleNext = () => {
        if (!isCurrentStepValid()) {
            setError('請在繼續前正確填寫所有必填欄位。');
            return;
        }
        setError(null);
        if (currentStepIndex < categories.length - 1) {
            onSaveProgress(answers);
            setCurrentStepIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setError(null);
            onSaveProgress(answers);
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    const handleSubmit = async () => {
        if (!isCurrentStepValid()) {
            setError('請在儲存前正確填寫所有必填欄位。');
            return;
        }
        setError(null);
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            await onSaveProgress(answers);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 4000);
        } catch (e: any) {
            setError(e.message || '儲存失敗');
        } finally {
            setIsSaving(false);
        }
    };

    const progressPercentage = ((currentStepIndex + 1) / categories.length) * 100;

    return (
        <div className="bg-gradient-to-br from-indigo-50 to-primary-50 rounded-xl border border-primary-100 p-6 shadow-sm space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-2">專案資料輸入</h2>
                <p className="text-sm text-slate-600 mb-4">
                    第 {currentStepIndex + 1} 步，共 {categories.length} 步： <span className="font-medium text-indigo-700">{currentCategory}</span>
                </p>

                {/* Progress Bar */}
                <div className="w-full bg-slate-200 rounded-full h-2 mb-6">
                    <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-in-out"
                        style={{ width: `${progressPercentage}%` }}
                    ></div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {saveSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <p className="text-sm text-emerald-800 font-medium">資料儲存成功！您現在可以繼續生成計畫書草稿。</p>
                </div>
            )}

            <div className="space-y-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                {currentQuestions.map(q => (
                    <div key={q.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <label className="block text-base font-medium text-slate-800">
                            {q.question} {q.required && <span className="text-red-500">*</span>}
                        </label>

                        {q.type === 'text' && (
                            <input
                                type="text"
                                value={answers[q.id] || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                placeholder={q.placeholder}
                                className="w-full p-3 rounded-lg border border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        )}

                        {q.type === 'textarea' && (
                            <textarea
                                value={answers[q.id] || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                placeholder={q.placeholder}
                                rows={4}
                                className="w-full p-3 rounded-lg border border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        )}

                        {q.type === 'number' && (
                            <input
                                type="number"
                                value={answers[q.id] || ''}
                                onChange={(e) => handleAnswerChange(q.id, Number(e.target.value))}
                                placeholder={q.placeholder}
                                className="w-full p-3 rounded-lg border border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        )}

                        {q.type === 'choice' && q.options && (
                            <select
                                value={answers[q.id] || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                className="w-full p-3 rounded-lg border border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">請選擇一個選項...</option>
                                {q.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        )}

                        {q.type === 'scale' && q.scale && (
                            <div className="pt-2">
                                <input
                                    type="range"
                                    min={q.scale.min}
                                    max={q.scale.max}
                                    value={answers[q.id] || q.scale.min}
                                    onChange={(e) => handleAnswerChange(q.id, Number(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <div className="flex justify-between text-xs text-slate-500 mt-2 px-1">
                                    <span>{q.scale.min} ({q.scale.labels[q.scale.min]})</span>
                                    <span className="font-bold text-indigo-700 text-sm">{answers[q.id] || q.scale.min}</span>
                                    <span>{q.scale.max} ({q.scale.labels[q.scale.max]})</span>
                                </div>
                            </div>
                        )}

                        {q.validation && (
                            <p className="text-xs text-slate-400">
                                {q.validation.min_length && `至少需 ${q.validation.min_length} 個字元。 `}
                                {q.validation.warning && `${q.validation.warning}`}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex justify-between pt-4">
                <button
                    onClick={handlePrev}
                    disabled={currentStepIndex === 0 || isSaving}
                    className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${currentStepIndex === 0
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-slate-700 bg-white border border-slate-300 hover:bg-slate-50'
                        }`}
                >
                    <ChevronLeft className="w-4 h-4" /> 上一步
                </button>

                {!isLastStep ? (
                    <button
                        onClick={handleNext}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm"
                    >
                        下一步 <ChevronRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                    >
                        {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? '儲存中...' : '儲存並完成'}
                    </button>
                )}
            </div>
        </div>
    );
}
