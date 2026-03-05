import { useState, useEffect } from 'react';
import { FileText, Plus, Activity } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');

export default function Home() {
    const navigate = useNavigate();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newCounty, setNewCounty] = useState('');
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/projects`);
            setProjects(data);
        } catch (e) {
            console.error('Failed to fetch projects', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        try {
            const { data } = await axios.post(`${API_BASE}/projects`, {
                title: newTitle,
                county: newCounty,
            });
            setIsCreateModalOpen(false);
            // Navigate directly to the newly created project details page
            navigate(`/projects/${data.id}`);
        } catch (e) {
            console.error('Failed to create project', e);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">儀表板</h1>
                    <p className="text-slate-500 mt-2">歡迎回來。這裡是您所有 SBIR 專案的總覽。</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors focus:ring-4 focus:ring-primary-100 shadow-sm whitespace-nowrap"
                >
                    <Plus className="w-5 h-5" />
                    建立新專案
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
                        <FileText className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">草稿專案</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{projects.length}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="bg-amber-50 p-3 rounded-lg text-amber-600">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">進行中</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">0</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                    <h2 className="font-semibold text-slate-900">最近的專案</h2>
                    <Link to="/projects" className="text-sm text-primary-600 hover:text-primary-700 font-medium">查看全部 →</Link>
                </div>
                {loading ? (
                    <div className="p-12 text-center text-slate-500">載入儀表板中...</div>
                ) : projects.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                        <FolderKanbanIcon className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-lg font-medium text-slate-900 mb-1">找不到專案</p>
                        <p className="mb-4">建立新的 SBIR 專案以開始使用。</p>
                        <button onClick={() => setIsCreateModalOpen(true)} className="text-primary-600 font-medium hover:text-primary-700 hover:underline">
                            建立專案 →
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200">
                        {projects.slice(0, 5).map((p) => (
                            <Link key={p.id} to={`/projects/${p.id}`} className="block px-6 py-4 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                                <div>
                                    <p className="font-medium text-slate-900 group-hover:text-primary-600 transition-colors">{p.title}</p>
                                    <p className="text-sm text-slate-500">{p.county || '未指定縣市'}</p>
                                </div>
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                    {p.status}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Basic Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">建立新專案</h2>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">專案名稱</label>
                                    <input
                                        type="text"
                                        required
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="例如：115年度 AI 推薦系統研發計畫"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">目標縣市 (選填)</label>
                                    <input
                                        type="text"
                                        value={newCounty}
                                        onChange={(e) => setNewCounty(e.target.value)}
                                        placeholder="例如：台北市"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium focus:ring-4 focus:ring-primary-100 transition-colors"
                                >
                                    建立專案
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
function FolderKanbanIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            <path d="M8 10v4" />
            <path d="M12 10v2" />
            <path d="M16 10v6" />
        </svg>
    );
}
