import { useState, useEffect } from 'react';
import { Plus, FolderKanban, MoreVertical, Calendar, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';

// Ensure axios uses credentials for cookies
axios.defaults.withCredentials = true;

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');

interface Project {
    id: string;
    title: string;
    county: string | null;
    status: string;
    updated_at: string;
}

export default function Projects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newCounty, setNewCounty] = useState('');

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
            setProjects([data, ...projects]);
            setIsCreateModalOpen(false);
            setNewTitle('');
            setNewCounty('');
        } catch (e) {
            console.error('Failed to create project', e);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">專案列表</h1>
                    <p className="text-slate-500 mt-2">管理您所有的 SBIR 申請計畫草稿與檔案。</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors focus:ring-4 focus:ring-primary-100 shadow-sm whitespace-nowrap"
                >
                    <Plus className="w-5 h-5" />
                    新增專案
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {loading ? (
                    <div className="p-12 text-center text-slate-500">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-primary-600 animate-spin mx-auto mb-4" />
                        <p>載入專案中...</p>
                    </div>
                ) : projects.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                        <FolderKanban className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-lg font-medium text-slate-900 mb-1">尚無專案</p>
                        <p className="mb-6">建立您的第一個 SBIR 專案以開始使用。</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-primary-600 font-medium hover:text-primary-700 hover:underline"
                        >
                            建立專案 →
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200">
                        {projects.map((project) => (
                            <Link
                                key={project.id}
                                to={`/app/projects/${project.id}`}
                                className="group flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-start gap-4 mb-4 sm:mb-0">
                                    <div className="bg-blue-50 p-3 rounded-lg text-blue-600 shrink-0">
                                        <FolderKanban className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
                                            {project.title}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                                            <span className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-400" />
                                                {project.status}
                                            </span>
                                            {project.county && (
                                                <>
                                                    <span className="text-slate-300">•</span>
                                                    <span>{project.county}</span>
                                                </>
                                            )}
                                            <span className="text-slate-300">•</span>
                                            <span className="flex items-center gap-1.5">
                                                <Calendar className="w-4 h-4" />
                                                {new Date(project.updated_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-slate-400">
                                    <button className="p-2 hover:bg-slate-200 rounded-lg hover:text-slate-600 transition-colors">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    <ChevronRight className="w-5 h-5 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                                </div>
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
