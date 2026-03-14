// src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/services.js';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('healix_user') || 'null'); }
        catch { return null; }
    });
    const [loading, setLoading] = useState(true);

    // ── On mount: validate token with /auth/me ─────────────────
    useEffect(() => {
        const token = localStorage.getItem('healix_access_token');
        if (!token) { setLoading(false); return; }

        authApi.me()
            .then(({ data }) => setUser(data.data))
            .catch(() => {
                localStorage.removeItem('healix_access_token');
                localStorage.removeItem('healix_user');
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    // ── login() ────────────────────────────────────────────────
    const login = useCallback(async (email, password) => {
        const { data } = await authApi.login({ email, password });
        const { access_token, user: userData } = data.data;
        localStorage.setItem('healix_access_token', access_token);
        localStorage.setItem('healix_user', JSON.stringify(userData));
        setUser(userData);
        return userData;
    }, []);

    // ── logout() ───────────────────────────────────────────────
    const logout = useCallback(async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        localStorage.removeItem('healix_access_token');
        localStorage.removeItem('healix_user');
        setUser(null);
    }, []);

    // ── updateUser() — after profile edits ────────────────────
    const updateUser = useCallback((partial) => {
        setUser((prev) => {
            const updated = { ...prev, ...partial };
            localStorage.setItem('healix_user', JSON.stringify(updated));
            return updated;
        });
    }, []);

    // ── Derived helpers ────────────────────────────────────────
    const isAuthenticated = !!user;
    const isPatient = user?.role === 'patient';
    const isDoctor = user?.role === 'doctor';
    const isAdmin = user?.role === 'admin';

    return (
        <AuthContext.Provider value={{
            user, loading,
            login, logout, updateUser,
            isAuthenticated, isPatient, isDoctor, isAdmin,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}