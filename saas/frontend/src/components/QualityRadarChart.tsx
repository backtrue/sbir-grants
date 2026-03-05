import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip
} from 'recharts';
import { CheckCircle2, XCircle } from 'lucide-react';

interface QualityRadarChartProps {
    results: Record<string, boolean>;
    reasons: Record<string, string>;
    scorePct: number;
}

const DIMENSION_LABELS: Record<string, string> = {
    "ch_7": "創新差異化",
    "ch_8": "市場三層分析",
    "ch_9": "商業模式",
    "ch_10": "執行期程",
    "ch_11": "數據可信度",
    "ch_12": "語氣專業度"
};

export default function QualityRadarChart({ results, reasons, scorePct }: QualityRadarChartProps) {
    if (!results || Object.keys(results).length === 0) {
        return <div className="p-4 text-center text-gray-500">尚無審查資料</div>;
    }

    // Prepare data for recharts
    const chartData = Object.keys(DIMENSION_LABELS).map(key => ({
        subject: DIMENSION_LABELS[key],
        score: results[key] ? 100 : 20, // Give some minimum radius so the chart isn't empty
        fullMark: 100
    }));

    const failedDimensions = Object.keys(results).filter(key => !results[key]);
    const passedDimensions = Object.keys(results).filter(key => results[key]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
            {/* Left side: Chart */}
            <div className="md:w-1/2 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-800 mb-2">計畫書 6 維度品質診斷</h3>
                <div className="text-sm text-slate-500 mb-4">綜合防禦力：{scorePct}%</div>

                <div className="w-full h-64 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar
                                name="專案品質"
                                dataKey="score"
                                stroke="#3b82f6"
                                fill="#3b82f6"
                                fillOpacity={0.4}
                            />
                            <Tooltip
                                formatter={(value: any) => [value === 100 ? '✅ 通過' : '❌ 需改善', '狀態']}
                                labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Right side: Actionable Feedback */}
            <div className="md:w-1/2 p-6 overflow-y-auto max-h-[400px]">
                {failedDimensions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-3 text-center">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                            <CheckCircle2 size={32} />
                        </div>
                        <h4 className="text-xl font-bold text-green-700">完美無瑕！</h4>
                        <p className="text-slate-600">您的計畫書已達到六邊形戰士標準，這是一份能讓審查委員驚豔的傑作！</p>
                    </div>
                ) : (
                    <div>
                        <h4 className="text-md flex items-center gap-2 font-bold text-red-600 mb-4 pb-2 border-b border-red-100">
                            <XCircle className="w-5 h-5" />
                            發現 {failedDimensions.length} 處致命缺陷 (需立即改善)
                        </h4>
                        <div className="space-y-4">
                            {failedDimensions.map(key => (
                                <div key={key} className="bg-red-50/50 p-4 rounded-lg border border-red-100">
                                    <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        {DIMENSION_LABELS[key]}
                                    </div>
                                    <div className="text-sm text-slate-600">{reasons[key]}</div>
                                </div>
                            ))}
                        </div>

                        {passedDimensions.length > 0 && (
                            <div className="mt-8">
                                <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">已達成之指標</h4>
                                <div className="space-y-2">
                                    {passedDimensions.map(key => (
                                        <div key={key} className="flex gap-2 items-start text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="font-medium text-slate-700">{DIMENSION_LABELS[key]}</span>
                                                <span className="text-slate-500 ml-2">{reasons[key]}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
