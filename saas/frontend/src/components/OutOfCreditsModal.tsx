import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Key, X } from 'lucide-react';

export default function OutOfCreditsModal() {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const handleExhausted = () => setIsOpen(true);
        window.addEventListener('creditsExhausted', handleExhausted);
        return () => window.removeEventListener('creditsExhausted', handleExhausted);
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="bg-red-100 text-red-600 p-2 rounded-full">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">免費額度已用盡</h3>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-slate-600 text-sm leading-relaxed">
                        您的 50 點免費 AI 生成額度已經使用完畢囉！希望您滿意這套系統為您帶來的效率提升。
                    </p>
                    <p className="text-slate-600 text-sm leading-relaxed mt-3">
                        若要繼續無限使用平台的所有 AI 寫作與審閱功能，請填寫您專屬的 <strong>Claude</strong> 或 <strong>OpenAI API Key</strong> (BYOK 模式)。
                    </p>

                    <div className="mt-6">
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                navigate('/app/settings');
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-xl font-medium transition-colors shadow-sm focus:ring-4 focus:ring-indigo-100"
                        >
                            <Key className="w-4 h-4" />
                            前往設定 API 金鑰
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
