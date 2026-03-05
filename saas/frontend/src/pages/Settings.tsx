import { useState, useEffect } from 'react';
import { Key, Save, CheckCircle2, Loader2, Trash2, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://sbir-api.thinkwithblack.com');

interface KeyStatus {
    claude_key_set: boolean;
    openai_key_set: boolean;
    gemini_key_set: boolean;
}

export default function Settings() {
    const [claudeKey, setClaudeKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Load current key statuses (not values – they are masked server-side)
        axios.get<KeyStatus>(`${API_BASE}/api/me/keys`, { withCredentials: true })
            .then(res => setKeyStatus(res.data))
            .catch(err => console.error('[Settings] failed to load key status:', err));
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        setSaveSuccess(false);
        try {
            const payload: Record<string, string | null> = {};
            if (claudeKey) payload.claude_key = claudeKey;
            if (openaiKey) payload.openai_key = openaiKey;
            if (geminiKey) payload.gemini_key = geminiKey;

            if (Object.keys(payload).length === 0) {
                setError('請先輸入至少一組 API 金鑰再儲存。');
                return;
            }

            await axios.put(`${API_BASE}/api/me/keys`, payload, { withCredentials: true });
            // Refresh key statuses after saving
            const res = await axios.get<KeyStatus>(`${API_BASE}/api/me/keys`, { withCredentials: true });
            setKeyStatus(res.data);
            setClaudeKey('');
            setOpenaiKey('');
            setGeminiKey('');
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 4000);
        } catch (err: any) {
            setError(err.message || '儲存失敗，請重新嘗試');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (keyType: 'claude_key' | 'openai_key' | 'gemini_key') => {
        if (!confirm('確定要刪除此 API 金鑰？刪除後系統將切換回 Cloudflare AI。')) return;
        try {
            await axios.delete(`${API_BASE}/api/me/keys/${keyType}`, { withCredentials: true });
            setKeyStatus(prev => prev ? { ...prev, [`${keyType}_set`]: false } : prev);
        } catch {
            alert('刪除失敗，請重試。');
        }
    };

    const renderKeyField = (
        id: string,
        label: string,
        value: string,
        setter: (v: string) => void,
        placeholder: string,
        isSet: boolean | undefined,
        keyType: 'claude_key' | 'openai_key' | 'gemini_key',
        hint?: string,
    ) => (
        <div className="pt-4 first:pt-0 border-t border-slate-100 first:border-0">
            <div className="flex items-center justify-between mb-1">
                <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
                {isSet && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> 已設定
                        <button
                            onClick={() => handleDelete(keyType)}
                            className="ml-1 text-red-400 hover:text-red-600"
                            title="刪除"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </span>
                )}
            </div>
            <input
                type="password"
                id={id}
                value={value}
                onChange={e => setter(e.target.value)}
                placeholder={isSet ? '（已設定，輸入新值以更新）' : placeholder}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
            {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
        </div>
    );

    return (
        <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">API 設定</h1>
                <p className="text-slate-500 mt-2">
                    設定您自己的 API 金鑰 (BYOK)。如果留空，系統將使用預設的 Cloudflare Workers AI 模型。
                </p>
            </div>

            {saveSuccess && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <p className="text-sm text-emerald-800 font-medium">API 金鑰已成功儲存！系統下次呼叫 AI 時即會使用您的金鑰。</p>
                </div>
            )}

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                    <X className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-primary-50 p-2 rounded-lg text-primary-600">
                            <Key className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-semibold">語言模型設定</h2>
                    </div>

                    <div className="space-y-4">
                        {renderKeyField('claudeKey', 'Anthropic Claude API 金鑰', claudeKey, setClaudeKey, 'sk-ant-api03-...', keyStatus?.claude_key_set, 'claude_key', '強烈推薦，可獲得最佳的繁體中文生成品質。')}
                        {renderKeyField('openaiKey', 'OpenAI API 金鑰', openaiKey, setOpenaiKey, 'sk-...', keyStatus?.openai_key_set, 'openai_key', '作為 Claude 的備用選項。')}
                        {renderKeyField('geminiKey', 'Google Gemini API 金鑰', geminiKey, setGeminiKey, 'AIzaSy...', keyStatus?.gemini_key_set, 'gemini_key')}
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors focus:ring-4 focus:ring-primary-100 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        儲存設定
                    </button>
                </div>
            </div>
        </div>
    );
}
