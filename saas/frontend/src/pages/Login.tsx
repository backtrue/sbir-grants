import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Rocket, ShieldCheck } from 'lucide-react';

export default function Login() {
    const { user, isLoading, login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && user) {
            navigate('/', { replace: true });
        }
    }, [user, isLoading, navigate]);

    if (isLoading) return null;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center text-primary-600">
                    <Rocket className="w-12 h-12" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
                    SBIR Cloud
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    SaaS 版本 - 您的專屬計畫書產生器
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
                    <div className="space-y-6">
                        <div>
                            <button
                                onClick={login}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                            >
                                使用 Google 帳號登入
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
                        <ShieldCheck className="w-4 h-4" />
                        <span>安全、快速的 SSO 驗證</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
