// src/pages/auth/LoginPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const user = await login(form.email, form.password);
            toast.success(`Welcome back, ${user.first_name}!`);
            navigate(`/${user.role}`, { replace: true });
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-50 to-blue-100
                    flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-brand-700">HEALIX</h1>
                    <p className="text-gray-500 mt-2">Sign in to your account</p>
                </div>

                <div className="card">
                    <div className="card-body">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700
                                text-sm rounded-lg px-4 py-3">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="label">Email</label>
                                <input
                                    type="email" className="input" required autoFocus
                                    value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="you@example.com"
                                />
                            </div>

                            <div>
                                <label className="label">Password</label>
                                <input
                                    type="password" className="input" required
                                    value={form.password}
                                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="••••••••"
                                />
                            </div>

                            <button type="submit" className="btn-primary w-full" disabled={busy}>
                                {busy ? 'Signing in…' : 'Sign in'}
                            </button>
                        </form>

                        {/* Quick-fill dev buttons */}
                        {import.meta.env.DEV && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-xs text-gray-400 mb-2">Dev quick-fill:</p>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        ['admin@healix.dev', 'Admin@1234', 'Admin'],
                                        ['dr.sarah@healix.dev', 'Doctor@1234', 'Doctor'],
                                        ['patient.alex@healix.dev', 'Patient@1234', 'Patient'],
                                    ].map(([email, pw, label]) => (
                                        <button key={label} type="button"
                                            className="btn-secondary btn-sm"
                                            onClick={() => setForm({ email, password: pw })}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="card-footer text-center text-sm text-gray-500">
                        No account?{' '}
                        <Link to="/register" className="text-brand-600 font-medium hover:underline">
                            Register
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}