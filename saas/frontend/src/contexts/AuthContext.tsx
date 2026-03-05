import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://sbir-api.thinkwithblack.com');
// Use withCredentials to ensure cookies are sent with cross-subdomain requests
axios.defaults.withCredentials = true;

interface User {
    sub: string;  // Standard JWT 'subject' claim — matches backend payload
    email: string;
    name: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: () => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/me`);
            setUser(response.data.user);
        } catch {
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const login = () => {
        // Redirect to backend Google OAuth flow
        window.location.href = `${API_BASE}/auth/google/login`;
    };

    const logout = () => {
        // Redirect to backend logout URL, which clears the cookie
        window.location.href = `${API_BASE}/auth/logout`;
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
