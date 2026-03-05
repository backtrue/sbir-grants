import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Upload, FileText, Trash2, Download, AlertCircle, RefreshCw, Layers, CheckSquare, Sparkles, PlayCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toDocx } from 'mdast2docx';
import { tablePlugin } from '@m2d/table';
import { listPlugin } from '@m2d/list';
import { WidthType } from 'docx';
import AIInterviewer from '../components/AIInterviewer';
import SectionCard from '../components/SectionCard';
import QualityRadarChart from '../components/QualityRadarChart';

axios.defaults.withCredentials = true;
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : 'https://sbir-api.thinkwithblack.com/api');

interface Section {
    section_index: number;
    title: string;
    content: string;
    status: string;
}

interface Project {
    id: string;
    title: string;
    county: string | null;
    status: string;
    progress_data: string;
    chunking_status?: 'pending' | 'syncing' | 'completed' | 'failed';
    sections?: Section[];
}

interface Document {
    id: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
    uploaded_at: string;
    extraction_status?: 'pending' | 'processing' | 'done' | 'failed';
    extraction_error?: string;
    chunk_count?: number;
}

interface DocChunk {
    id: string;
    chunk_index: number;
    chunk_text: string;
    section_tags: string; // JSON string e.g. "[1,3]"
}

export default function ProjectDetails() {
    const { id } = useParams<{ id: string }>();
    const [project, setProject] = useState<Project | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Tab State
    const [activeTab, setActiveTab] = useState<'overview' | 'data' | 'draft' | 'checklists'>('overview');

    // Checklist State
    const [checklistData, setChecklistData] = useState<{ [key: string]: boolean }>({});
    const [savingProgress, setSavingProgress] = useState(false);

    // AI Generator State
    const [generatingQueue, setGeneratingQueue] = useState(false);
    const [exportingWord, setExportingWord] = useState(false);
    const [checkingQuality, setCheckingQuality] = useState(false);
    const [qualityScorePct, setQualityScorePct] = useState<number | null>(null);
    const [aiQualityReasons, setAiQualityReasons] = useState<Record<string, string>>({});
    const [verifyingCompany, setVerifyingCompany] = useState(false);
    const [companyVerifyInfo, setCompanyVerifyInfo] = useState<{ found: boolean; name: string; reasons: Record<string, string> } | null>(null);
    const [generatingPitchDeck, setGeneratingPitchDeck] = useState(false);
    const [pitchDeckContent, setPitchDeckContent] = useState('');
    const [showPitchDeckModal, setShowPitchDeckModal] = useState(false);
    const [pitchDeckCopied, setPitchDeckCopied] = useState(false);

    // Document processing state
    const [docStatusList, setDocStatusList] = useState<Document[]>([]);
    const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
    const [docChunks, setDocChunks] = useState<Record<string, DocChunk[]>>({});
    const [updatingSections, setUpdatingSections] = useState<string | null>(null);
    const [isPollingDocs, setIsPollingDocs] = useState(true);
    // Hardcoded expected sections from phase1_chunks
    const PHASE1_CHUNKS_TITLES = [
        "1. 公司簡介",
        "2. 問題陳述",
        "3. 創新構想",
        "4. 可行性評估規劃",
        "5. 市場初步分析",
        "6. 預期營收與產值",
        "7. 團隊介紹與經費規劃"
    ];

    const sectionTriggerRefs = useRef<((() => void) | null)[]>(new Array(PHASE1_CHUNKS_TITLES.length).fill(null));

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchProjectData();
    }, [id]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (project?.chunking_status === 'syncing') {
            interval = setInterval(() => {
                fetchProjectData();
            }, 3000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [project?.chunking_status, id]);

    // Poll document extraction status while any file is pending/processing
    useEffect(() => {
        if (!id || !isPollingDocs) return;
        const interval = setInterval(async () => {
            const list = await fetchDocStatus();
            const stillProcessing = list?.some((d: Document) =>
                d.extraction_status === 'pending' || d.extraction_status === 'processing'
            );
            if (!stillProcessing) setIsPollingDocs(false);
        }, 3000);
        return () => clearInterval(interval);
    }, [id, isPollingDocs]);

    useEffect(() => {
        if (id) fetchDocStatus();
    }, [id]);

    const fetchDocStatus = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/storage/project/${id}/status`);
            setDocStatusList(data);
            return data;
        } catch { return []; }
    };

    const fetchDocChunks = async (docId: string) => {
        if (docChunks[docId]) return; // already loaded
        try {
            const { data } = await axios.get(`${API_BASE}/storage/document/${docId}/chunks`);
            setDocChunks(prev => ({ ...prev, [docId]: data }));
        } catch { }
    };

    const handleSectionTagToggle = async (chunkId: string, docId: string, sectionIndex: number, currentTags: number[]) => {
        const newTags = currentTags.includes(sectionIndex)
            ? currentTags.filter(t => t !== sectionIndex)
            : [...currentTags, sectionIndex].sort();
        setUpdatingSections(chunkId);
        try {
            await axios.patch(`${API_BASE}/storage/chunk/${chunkId}/sections`, { section_tags: newTags });
            setDocChunks(prev => ({
                ...prev,
                [docId]: (prev[docId] || []).map(c =>
                    c.id === chunkId ? { ...c, section_tags: JSON.stringify(newTags) } : c
                )
            }));
        } catch { } finally {
            setUpdatingSections(null);
        }
    };

    const SECTION_NAMES: Record<number, string> = {
        1: '公司簡介', 2: '問題陳述', 3: '創新構想',
        4: '可行性評估', 5: '市場分析', 6: '預期營收', 7: '團隊與經費'
    };

    const fetchProjectData = async () => {
        try {
            const [projRes, docsRes, sectionsRes] = await Promise.all([
                axios.get(`${API_BASE}/projects/${id}`),
                axios.get(`${API_BASE}/storage/project/${id}`),
                axios.get(`${API_BASE}/projects/${id}/sections`)
            ]);
            setProject({ ...projRes.data, sections: sectionsRes.data });
            setDocuments(docsRes.data);
            try {
                if (projRes.data.progress_data) {
                    const parsed = JSON.parse(projRes.data.progress_data);
                    // Checklist data is stored under `checklists` key
                    setChecklistData(parsed.checklists || {});
                }
            } catch (e) { /* ignore parse error */ }
        } catch (e) {
            console.error('Failed to fetch project data', e);
        } finally {
            setLoading(false);
        }
    };

    const handleChecklistChange = async (key: string, checked: boolean) => {
        const newData = { ...checklistData, [key]: checked };
        setChecklistData(newData);
        setSavingProgress(true);
        try {
            // Merge into existing progress_data, only update the `checklists` key
            const projRes = await axios.get(`${API_BASE}/projects/${id}`);
            const existingData = (() => {
                try { return JSON.parse(projRes.data.progress_data || '{}'); } catch { return {}; }
            })();
            await axios.put(`${API_BASE}/projects/${id}`, {
                progress_data: JSON.stringify({ ...existingData, checklists: newData })
            });
        } catch (e) {
            console.error('Failed to save progress', e);
        } finally {
            setSavingProgress(false);
        }
    };

    const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
    }
    const MAX_UPLOAD_MB = 20

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Client-side validation
        if (!ALLOWED_UPLOAD_TYPES[file.type]) {
            alert(`不支援的檔案格式（${file.name}）。\n僅接受：PDF、Word (.docx/.doc)、Excel (.xlsx/.xls)`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
            alert(`檔案太大（${(file.size / 1024 / 1024).toFixed(1)}MB）。最大限制為 ${MAX_UPLOAD_MB}MB。`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const { data } = await axios.post(`${API_BASE}/storage/project/${id}/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            setDocuments([data, ...documents]);
            setDocStatusList(prev => [data, ...prev]);
            setIsPollingDocs(true);
        } catch (error: any) {
            const msg = error?.response?.data?.error || '上傳失敗，請重試。';
            alert(msg);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDeleteFile = async (fileId: string) => {
        if (!window.confirm('Are you sure you want to delete this file?')) return;

        try {
            await axios.delete(`${API_BASE}/storage/${fileId}`);
            setDocuments(documents.filter(d => d.id !== fileId));
            setDocStatusList(prev => prev.filter(d => d.id !== fileId));
        } catch (error) {
            console.error('Failed to delete file', error);
            alert('Failed to delete file.');
        }
    };

    const handleDownload = (fileId: string) => {
        // Assuming cookie-based auth, we can just trigger a window location change or an anchor click
        window.location.href = `${API_BASE}/storage/download/${fileId}`;
    };

    const handleQualityCheck = async () => {
        if (checkingQuality) return;
        setCheckingQuality(true);
        try {
            const res = await axios.get(`${API_BASE}/quality/project/${id}`);
            const { results, score_pct, reasons } = res.data;
            if (!results) throw new Error('No results');

            if (score_pct !== undefined) setQualityScorePct(score_pct);

            // Auto-update ch_7~ch_12 in checklistData based on AI verdict
            const updates: Record<string, boolean> = {};
            for (const key of ['ch_7', 'ch_8', 'ch_9', 'ch_10', 'ch_11', 'ch_12']) {
                if (results[key] !== undefined) updates[key] = !!results[key];
            }
            const newData = { ...checklistData, ...updates };
            setChecklistData(newData);
            if (reasons) setAiQualityReasons(reasons);

            // Persist to DB (merge into existing progress_data)
            const projRes = await axios.get(`${API_BASE}/projects/${id}`);
            const existingData = (() => {
                try { return JSON.parse(projRes.data.progress_data || '{}'); } catch { return {}; }
            })();
            await axios.put(`${API_BASE}/projects/${id}`, {
                progress_data: JSON.stringify({ ...existingData, checklists: newData })
            });
        } catch (e: any) {
            alert('AI 品質審查失敗：' + (e.response?.data?.error || e.message));
        } finally {
            setCheckingQuality(false);
        }
    };

    const handleExportWord = async () => {
        setExportingWord(true);
        try {
            // Refetch the absolute latest sections from the server first
            // because React state might only have the old chunks if the user just clicked Generate
            const res = await axios.get(`${API_BASE}/projects/${id}/sections`);
            const latestSections = res.data;

            if (!latestSections || latestSections.length === 0) {
                alert('沒有可匯出的內容。請先生成草稿。');
                setExportingWord(false);
                return;
            }

            // 1. Sort sections by index to ensure correct order
            const sortedSections = [...latestSections].sort((a: any, b: any) => a.section_index - b.section_index);

            // 2. Combine all Markdown contents
            let fullMarkdown = `# ${project?.title || 'SBIR Proposal'}\n\n`;
            for (const sec of sortedSections) {
                if (sec.content && sec.status === 'completed') {
                    fullMarkdown += `${sec.content}\n\n`;
                }
            }

            if (fullMarkdown.trim() === '') {
                alert('所有章節目前都是空的。');
                setExportingWord(false);
                return;
            }

            // 3. Parse Markdown into an Abstract Syntax Tree (Supporting GFM tables)
            const mdast = unified().use(remarkParse).use(remarkGfm).parse(fullMarkdown);

            // 4. Custom Table Plugin to fix Mac Pages squeezed tables by calculating column widths
            const customTablePlugin = (options: any = {}) => {
                return {
                    block: (docx: any, node: any, paraProps: any, blockChildrenProcessor: any, inlineChildrenProcessor: any) => {
                        if (node.type !== 'table') return [];
                        const colCount = node.children[0]?.children?.length || 1;
                        // 9026 twips is full A4 page width without margins
                        const cw = Math.floor(9026 / colCount);
                        const columnWidths = Array(colCount).fill(cw);

                        const dynamicPlugin = tablePlugin({
                            ...options,
                            tableProps: {
                                ...options.tableProps,
                                width: { size: 9026, type: WidthType.DXA },
                                columnWidths
                            }
                        });
                        return dynamicPlugin.block!(docx, node, paraProps, blockChildrenProcessor, inlineChildrenProcessor);
                    }
                };
            };

            // 5. Convert MDAST to DOCX Buffer with Table and List Plugins
            const docxBuffer = await toDocx(mdast as any, {
                title: project?.title || 'SBIR Proposal',
                creator: 'SBIR Assistant',
                description: 'SBIR Phase 1 Proposal Draft',
            }, {
                plugins: [
                    customTablePlugin(),
                    listPlugin()
                ]
            });

            // 6. Trigger Download
            const blob = new Blob([docxBuffer as any], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${project?.title || 'SBIR_Proposal'}_Phase1.docx`;
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error) {
            console.error('Failed to export Word file', error);
            alert('產生 Word 文件時發生錯誤。');
        } finally {
            setExportingWord(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-24 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center p-24">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-800">找不到專案</h2>
                <Link to="/projects" className="text-primary-600 hover:underline mt-4 inline-block">
                    返回專案列表
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            {/* Header section */}
            <div className="flex items-center gap-4">
                <Link
                    to="/projects"
                    className="p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-6 h-6" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{project.title}</h1>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            {project.status}
                        </span>
                        {project.chunking_status === 'syncing' && (
                            <span className="flex items-center gap-1.5 text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                AI 解析中...
                            </span>
                        )}
                        {project.chunking_status === 'completed' && (
                            <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                AI 已同步
                            </span>
                        )}
                        {project.county && (
                            <>
                                <span className="text-slate-300">•</span>
                                <span>{project.county}</span>
                            </>
                        )}
                        <span className="text-slate-300">•</span>
                        <span>ID: {project.id.split('-')[0]}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Area (2/3 width) */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Navigation Tabs */}
                    <div className="flex border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'overview' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        >
                            <Layers className="w-4 h-4" />
                            總覽
                        </button>
                        <button
                            onClick={() => setActiveTab('data')}
                            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'data' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        >
                            <FileText className="w-4 h-4" />
                            專案資料
                        </button>
                        <button
                            onClick={() => setActiveTab('draft')}
                            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'draft' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        >
                            <Sparkles className="w-4 h-4" />
                            AI 草稿
                        </button>
                        <button
                            onClick={() => setActiveTab('checklists')}
                            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'checklists' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        >
                            <CheckSquare className="w-4 h-4" />
                            檢核表
                        </button>
                    </div>

                    {/* Tab Contents */}

                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                            <h2 className="text-lg font-semibold text-slate-900">專案總覽</h2>
                            <p className="text-slate-600">
                                歡迎來到您的 SBIR 專案工作區。您可以在這裡追蹤進度、存放參考文件、準備計畫書草稿，並確保在提交前符合所有規定。
                            </p>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 mb-1">狀態</p>
                                    <p className="text-slate-900 font-medium">{project.status}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-500 mb-1">目標縣市</p>
                                    <p className="text-slate-900 font-medium">{project.county || '未指定'}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-sm font-medium text-slate-500 mb-3">進度大綱</p>
                                    {(() => {
                                        const CHECKLIST_TOTAL = 18;
                                        const checklistDone = Object.keys(checklistData).filter(k => k.startsWith('ch_') && checklistData[k]).length;
                                        const sectionsDone = project.sections?.filter(s => s.status === 'completed').length || 0;
                                        return (
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>✅ 申請檢核表</span>
                                                        <span className="font-medium text-emerald-600">{checklistDone} / {CHECKLIST_TOTAL}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(checklistDone / CHECKLIST_TOTAL) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>🪄 AI 草稿章節</span>
                                                        <span className="font-medium text-amber-600">{sectionsDone} / {PHASE1_CHUNKS_TITLES.length}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div className="bg-amber-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(sectionsDone / PHASE1_CHUNKS_TITLES.length) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-400 text-right">整體完成度：{checklistDone + sectionsDone} / {CHECKLIST_TOTAL + PHASE1_CHUNKS_TITLES.length} 項</p>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Data Entry Tab */}
                    {activeTab === 'data' && (
                        <AIInterviewer
                            initialAnswers={(() => {
                                try {
                                    const data = typeof project.progress_data === 'string'
                                        ? JSON.parse(project.progress_data)
                                        : (project.progress_data || {});
                                    return (data as any).wizardAnswers || {};
                                } catch {
                                    return {};
                                }
                            })()}
                            onSaveProgress={async (answers) => {
                                try {
                                    const parsedData = typeof project.progress_data === 'string'
                                        ? JSON.parse(project.progress_data)
                                        : (project.progress_data || {});
                                    // Store wizard answers under the `wizardAnswers` key to avoid overwriting checklists
                                    const updatedProgress = { ...parsedData, wizardAnswers: { ...(parsedData.wizardAnswers || {}), ...answers } };
                                    const { data: updatedProject } = await axios.put(
                                        `${API_BASE}/projects/${id}`,
                                        { progress_data: JSON.stringify(updatedProgress) }
                                    );
                                    setProject(updatedProject);
                                } catch (e) {
                                    console.error('Failed to save interviewer progress', e);
                                    throw e;
                                }
                            }}
                        />
                    )}

                    {/* AI Draft Tab */}
                    {activeTab === 'draft' && (
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-amber-500" />
                                        計畫書草稿
                                    </h2>
                                    <p className="text-sm text-slate-600 mt-1">使用您儲存的專案資料生成完整的計畫書草稿。</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleExportWord}
                                        disabled={exportingWord || project.chunking_status === 'syncing' || !project.sections?.length}
                                        className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                    >
                                        {exportingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                        {exportingWord ? '匯出中...' : '匯出 Word'}
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (generatingQueue) return;
                                            if (!window.confirm('確定要生成所有章節嗎？這將會花費數分鐘時間。')) return;
                                            setGeneratingQueue(true);
                                            try {
                                                // Batch generation logic: 2 at a time
                                                for (let i = 0; i < PHASE1_CHUNKS_TITLES.length; i += 2) {
                                                    const batchIndices = [i, i + 1].filter(idx => idx < PHASE1_CHUNKS_TITLES.length);
                                                    const promises = batchIndices.map(idx => {
                                                        const triggerFunc = sectionTriggerRefs.current[idx];
                                                        if (triggerFunc) {
                                                            triggerFunc();
                                                        }
                                                        // Allow 15s wait delay before starting the next batch, or trigger blindly
                                                        return new Promise(resolve => setTimeout(resolve, 2000));
                                                    });
                                                    await Promise.all(promises);
                                                }
                                            } finally {
                                                setGeneratingQueue(false);
                                            }
                                        }}
                                        disabled={generatingQueue || project.chunking_status === 'syncing'}
                                        className="px-5 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                    >
                                        {generatingQueue ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                        {generatingQueue ? '佇列啟動中...' : '🪄 全部生成'}
                                    </button>
                                </div>
                            </div>

                            {project.chunking_status === 'syncing' && (
                                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700 flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    AI 正在分析並切塊您的專案資料。請在生成草稿前稍候。
                                </div>
                            )}

                            <div className="mt-6">
                                {PHASE1_CHUNKS_TITLES.map((title, index) => {
                                    const savedSection = project.sections?.find(s => s.section_index === index);
                                    return (
                                        <SectionCard
                                            key={index}
                                            projectId={project.id}
                                            sectionIndex={index}
                                            title={title}
                                            initialContent={savedSection?.content || ''}
                                            initialStatus={savedSection?.status || 'empty'}
                                            onGenerateComplete={() => {
                                                // Optionally, fetch project data to sync
                                                console.log(`Section ${index} generator complete`);
                                            }}
                                            onRegisterTrigger={(triggerFn) => {
                                                sectionTriggerRefs.current[index] = triggerFn;
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Checklists Tab */}
                    {activeTab === 'checklists' && (
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-8">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    <CheckSquare className="w-5 h-5 text-emerald-500" />
                                    SBIR 申請完整檢核表
                                </h2>
                                <p className="text-sm text-slate-600 mt-1">對應計畫書草稿章節，確保申請前所有項目均已就緒。</p>
                                {savingProgress && <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> 儲存中...</p>}
                            </div>

                            <div className="space-y-8">
                                {/* Category 1: 申請基本資格 */}
                                <div>
                                    <h3 className="font-semibold text-slate-800 border-b-2 border-slate-200 pb-2 mb-4 flex items-center gap-2">
                                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">一</span>
                                        申請基本資格確認
                                        <button
                                            onClick={async () => {
                                                if (verifyingCompany) return;
                                                setVerifyingCompany(true);
                                                try {
                                                    const res = await axios.post(`${API_BASE}/ai/project/${id}/company-verify`);
                                                    const { results, companyName, g0vFound } = res.data;
                                                    setCompanyVerifyInfo({ found: g0vFound, name: companyName, reasons: results.reasons || {} });
                                                    const updates: Record<string, boolean> = {};
                                                    for (const key of ['ch_1', 'ch_2', 'ch_3']) {
                                                        if (results[key] !== undefined) updates[key] = !!results[key];
                                                    }
                                                    const newData = { ...checklistData, ...updates };
                                                    setChecklistData(newData);
                                                    const projRes = await axios.get(`${API_BASE}/projects/${id}`);
                                                    const existing = (() => { try { return JSON.parse(projRes.data.progress_data || '{}'); } catch { return {}; } })();
                                                    await axios.put(`${API_BASE}/projects/${id}`, { progress_data: JSON.stringify({ ...existing, checklists: newData }) });
                                                } catch (e: any) {
                                                    alert('公司資料查詢失敗：' + (e.response?.data?.error || e.message));
                                                } finally {
                                                    setVerifyingCompany(false);
                                                }
                                            }}
                                            disabled={verifyingCompany}
                                            className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                                        >
                                            {verifyingCompany ? <RefreshCw className="w-3 h-3 animate-spin" /> : <span>🔍</span>}
                                            {verifyingCompany ? 'g0v 查詢中...' : '查詢公司資料 (g0v)'}
                                        </button>
                                    </h3>
                                    {companyVerifyInfo && (
                                        <div className={`mb-4 p-3 border rounded-lg text-xs space-y-1 ${companyVerifyInfo.found ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                                            <p className="font-semibold">{companyVerifyInfo.found ? '✅ g0v 查到公司登記資料' : '⚠️ g0v 查無完全符合資料（可能公司名稱有誤）'}</p>
                                            <p>查詢公司名：<span className="font-medium">{companyVerifyInfo.name}</span></p>
                                            {Object.entries(companyVerifyInfo.reasons).map(([key, reason]) => (
                                                <p key={key}><span className="font-medium">{key.replace('ch_', '#')}：</span>{reason as string}</p>
                                            ))}
                                        </div>
                                    )}
                                    <div className="space-y-3">
                                        {[
                                            { id: 'ch_1', label: '公司已完成設立登記，統一編號與代表人資料正確' },
                                            { id: 'ch_2', label: '符合中小企業認定標準（員工數 < 200 人，資本額 < 新臺幣一億元）' },
                                            { id: 'ch_3', label: '外資持股比例未達 1/3（無陸資投資疑慮）' },
                                            { id: 'ch_4', label: '近三年無重大欠稅或欠費紀錄' },
                                            { id: 'ch_5', label: '研究主持人（代表人或授權人員）已確認，並可全程參與' },
                                            { id: 'ch_6', label: '已確認目標縣市 SBIR 申請窗口、收件日期與截止時間' },
                                        ].map(item => (
                                            <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                                                    checked={!!checklistData[item.id]}
                                                    onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
                                                />
                                                <span className={`text-sm ${checklistData[item.id] ? 'text-slate-400 line-through' : 'text-slate-700 group-hover:text-slate-900'}`}>{item.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Category 2: AI 草稿章節（自動對齊） */}
                                <div>
                                    <h3 className="font-semibold text-slate-800 border-b-2 border-slate-200 pb-2 mb-4 flex items-center gap-2">
                                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">二</span>
                                        計畫書草稿章節完成狀態
                                        <span className="text-xs text-slate-400 font-normal ml-auto">（自動對齊 AI Draft）</span>
                                    </h3>
                                    <div className="space-y-2">
                                        {PHASE1_CHUNKS_TITLES.map((title, index) => {
                                            const section = project.sections?.find(s => s.section_index === index);
                                            const isDone = section?.status === 'completed';
                                            return (
                                                <div key={index} className={`flex items-center gap-3 p-3 rounded-lg border ${isDone ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                                        {isDone ? (
                                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 font-bold">{index + 1}</span>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm font-medium ${isDone ? 'text-emerald-700' : 'text-slate-500'}`}>{title}</span>
                                                    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                        {isDone ? '已完成' : '待生成'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Category 3: 計畫書內容品質確認 */}
                                <div>
                                    <h3 className="font-semibold text-slate-800 border-b-2 border-slate-200 pb-2 mb-4 flex items-center gap-2">
                                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">三</span>
                                        計畫書內容品質確認
                                        <button
                                            onClick={handleQualityCheck}
                                            disabled={checkingQuality || !project.sections?.some(s => s.status === 'completed')}
                                            className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                                        >
                                            {checkingQuality ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                            {checkingQuality ? 'AI 審查中...' : '🤖 AI 品質審查'}
                                        </button>
                                    </h3>

                                    {qualityScorePct !== null && Object.keys(aiQualityReasons).length > 0 && (
                                        <div className="mb-6">
                                            <QualityRadarChart
                                                results={checklistData}
                                                reasons={aiQualityReasons}
                                                scorePct={qualityScorePct}
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {[
                                            { id: 'ch_7', label: '創新技術說明清楚，與現有解決方案的差異化論述明確' },
                                            { id: 'ch_8', label: '市場規模推估完整（TAM / SAM / SOM 三層分析）' },
                                            { id: 'ch_9', label: '商業模式、客戶獲取策略及未來三年產值預估已完成' },
                                            { id: 'ch_10', label: '研究計畫期程合理（通常 6 ～ 12 個月），里程碑明確' },
                                            { id: 'ch_11', label: '所有數據、引用資料均有可查驗的來源（勿使用未佐證數字）' },
                                            { id: 'ch_12', label: '計畫書整體語氣自信專業，技術名詞解釋適當，非技術審查委員可讀懂' },
                                        ].map(item => (
                                            <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                                                    checked={!!checklistData[item.id]}
                                                    onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
                                                />
                                                <span className={`text-sm flex-1 ${checklistData[item.id] ? 'text-slate-400 line-through' : 'text-slate-700 group-hover:text-slate-900'}`}>{item.label}</span>
                                                {aiQualityReasons[item.id] && (
                                                    <span className="text-xs text-purple-500 ml-2 shrink-0" title={aiQualityReasons[item.id]}>AI ✓</span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Category 4: 附件與提交前確認 */}
                                <div>
                                    <h3 className="font-semibold text-slate-800 border-b-2 border-slate-200 pb-2 mb-4 flex items-center gap-2">
                                        <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">四</span>
                                        附件準備與提交前確認
                                    </h3>
                                    <div className="space-y-3">
                                        {[
                                            { id: 'ch_13', label: '公司登記文件（公司設立登記表或變更登記表）已備妥' },
                                            { id: 'ch_14', label: '經費表編列正確：人事費 ≤ 60%，研究費用 ≥ 40%' },
                                            { id: 'ch_15', label: '所有研究人員履歷（含學歷、專業資格、相關經歷）已備妥' },
                                            { id: 'ch_16', label: '計畫書 Word 版本已完成最終校稿並確認格式規範' },
                                            { id: 'ch_17', label: '簡報（Pitch Deck，建議 12～15 頁）已準備就緒' },
                                            { id: 'ch_18', label: '已向縣市政府指定窗口完成申請，並取得收件確認' },
                                        ].map(item => (
                                            <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                                                    checked={!!checklistData[item.id]}
                                                    onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
                                                />
                                                <span className={`text-sm ${checklistData[item.id] ? 'text-slate-400 line-through' : 'text-slate-700 group-hover:text-slate-900'}`}>{item.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {/* Pitch Deck Generator */}
                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                        <button
                                            onClick={async () => {
                                                if (generatingPitchDeck) return;
                                                setGeneratingPitchDeck(true);
                                                setPitchDeckContent('');
                                                setShowPitchDeckModal(true);
                                                try {
                                                    const response = await fetch(`${API_BASE}/ai/project/${id}/pitch-deck`, {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                    });
                                                    if (!response.ok) throw new Error('Failed');
                                                    const reader = response.body!.getReader();
                                                    const decoder = new TextDecoder();
                                                    let buffer = '';
                                                    while (true) {
                                                        const { done, value } = await reader.read();
                                                        if (done) break;
                                                        buffer += decoder.decode(value, { stream: true });
                                                        const lines = buffer.split('\n');
                                                        buffer = lines.pop() || '';
                                                        for (const line of lines) {
                                                            if (line.startsWith('data: ')) {
                                                                const data = line.slice(6);
                                                                if (data === '[DONE]' || data === '[ERROR]') break;
                                                                setPitchDeckContent(prev => prev + data);
                                                            }
                                                        }
                                                    }
                                                } catch (e) {
                                                    console.error(e);
                                                } finally {
                                                    setGeneratingPitchDeck(false);
                                                }
                                            }}
                                            disabled={true}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-300 text-slate-500 text-sm font-medium rounded-lg cursor-not-allowed opacity-60"
                                            title="功能開發中，即將推出"
                                        >
                                            <Sparkles className="w-4 h-4" /> 🎯 生成 Pitch Deck 素材（即將推出）
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pitch Deck Modal */}
                    {showPitchDeckModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                                    <h3 className="font-bold text-slate-900 text-lg">🎯 Pitch Deck 素材</h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={async () => {
                                                await navigator.clipboard.writeText(pitchDeckContent);
                                                setPitchDeckCopied(true);
                                                setTimeout(() => setPitchDeckCopied(false), 2000);
                                            }}
                                            disabled={generatingPitchDeck}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                                        >
                                            {pitchDeckCopied ? '✅ 已複製！' : '📋 全部複製'}
                                        </button>
                                        <button
                                            onClick={() => setShowPitchDeckModal(false)}
                                            className="px-3 py-1.5 text-slate-500 hover:text-slate-800 text-sm rounded-lg hover:bg-slate-100 transition"
                                        >
                                            關閉
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    {generatingPitchDeck && !pitchDeckContent && (
                                        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> 正在生成詳細內容...</div>
                                    )}
                                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed">{pitchDeckContent}</pre>
                                    {generatingPitchDeck && pitchDeckContent && <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1" />}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Sidebar Space (1/3 width) */}
                <div className="space-y-6">

                    {/* Documents Widget */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-[500px]">
                        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-500" />
                                專案檔案
                            </h3>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="text-sm px-3 py-1.5 bg-white border border-slate-300 shadow-sm text-slate-700 rounded hover:bg-slate-50 hover:text-primary-600 transition disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {uploading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                                上傳
                            </button>
                            <input
                                type="file"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".pdf,.docx,.doc,.xlsx,.xls"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {(docStatusList || documents).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                                    <Upload className="w-8 h-8 mb-3 opacity-50" />
                                    <p className="text-sm">尚未上傳任何檔案。</p>
                                    <p className="text-xs mt-1">請上傳參考文件 (PDF) 以協助 AI 生成更高品質的草稿。</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(docStatusList || documents).map((doc) => (
                                        <div key={doc.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                            <div
                                                className={`group flex items-center justify-between p-3 transition-colors ${doc.extraction_status === 'done' ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                                                onClick={() => {
                                                    if (doc.extraction_status === 'done') {
                                                        const isExpanding = expandedDocId !== doc.id;
                                                        setExpandedDocId(isExpanding ? doc.id : null);
                                                        if (isExpanding) fetchDocChunks(doc.id);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="p-2 bg-slate-100 rounded text-slate-500 shrink-0">
                                                        <FileText className="w-4 h-4" />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <p className="text-sm font-medium text-slate-700 truncate" title={doc.file_name}>
                                                            {doc.file_name}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs text-slate-400 uppercase">
                                                                {formatBytes(doc.size_bytes)}
                                                            </span>
                                                            {doc.extraction_status === 'pending' || doc.extraction_status === 'processing' ? (
                                                                <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                                                    <Loader2 className="w-3 h-3 animate-spin" /> 解析中
                                                                </span>
                                                            ) : doc.extraction_status === 'failed' ? (
                                                                <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded" title={doc.extraction_error}>
                                                                    <AlertCircle className="w-3 h-3" /> 解析失敗
                                                                </span>
                                                            ) : doc.extraction_status === 'done' ? (
                                                                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                                                    <Sparkles className="w-3 h-3" /> 已切分 {doc.chunk_count} 段
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownload(doc.id); }}
                                                        className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                                                        title="Download"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteFile(doc.id); }}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Chunk Viewer (Expanded State) */}
                                            {expandedDocId === doc.id && doc.extraction_status === 'done' && (
                                                <div className="border-t border-slate-100 bg-slate-50 p-3 max-h-80 overflow-y-auto space-y-3">
                                                    {!docChunks[doc.id] ? (
                                                        <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
                                                    ) : docChunks[doc.id].length === 0 ? (
                                                        <div className="text-center text-xs text-slate-400 py-2">沒有提取到文字內容</div>
                                                    ) : (
                                                        docChunks[doc.id].map(chunk => {
                                                            const tags: number[] = (() => {
                                                                try { return JSON.parse(chunk.section_tags) || []; } catch { return []; }
                                                            })();
                                                            const isUpdating = updatingSections === chunk.id;

                                                            return (
                                                                <div key={chunk.id} className="bg-white border border-slate-200 rounded p-2 text-xs shadow-sm">
                                                                    <p className="text-slate-600 line-clamp-3 mb-2" title={chunk.chunk_text}>
                                                                        {chunk.chunk_text}
                                                                    </p>
                                                                    <div className="flex flex-wrap items-center gap-1.5 relative group/tags">
                                                                        {tags.length === 0 && <span className="text-slate-400 italic">無關聯區塊</span>}
                                                                        {tags.map(t => (
                                                                            <span key={t} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0.5 rounded border border-indigo-100">
                                                                                #{t} {SECTION_NAMES[t]?.split(' ')[0]}
                                                                                <button
                                                                                    disabled={isUpdating}
                                                                                    onClick={() => handleSectionTagToggle(chunk.id, doc.id, t, tags)}
                                                                                    className="hover:text-red-500 hover:bg-indigo-100 rounded-full w-3.5 h-3.5 flex items-center justify-center transition-colors -mr-0.5"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            </span>
                                                                        ))}

                                                                        {/* Add Tag Dropdown (Hover) */}
                                                                        <div className="relative">
                                                                            <button disabled={isUpdating} className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors">
                                                                                +
                                                                            </button>
                                                                            <div className="absolute left-0 bottom-full mb-1 hidden group-hover/tags:block z-10 w-32 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden py-1">
                                                                                {[1, 2, 3, 4, 5, 6, 7].map(num => {
                                                                                    if (tags.includes(num)) return null;
                                                                                    return (
                                                                                        <button
                                                                                            key={num}
                                                                                            onClick={() => handleSectionTagToggle(chunk.id, doc.id, num, tags)}
                                                                                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                                                                                        >
                                                                                            #{num} {SECTION_NAMES[num]}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>

                </div>
            </div>
        </div >
    );
}
