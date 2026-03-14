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
      toast.success(`Welcome back, ${user.first_name}`);
      navigate(`/${user.role}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-logo">HEALIX</h1>
        <p className="auth-tagline">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" required autoFocus
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password" type="password" required
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Dev quick-fill</p>
            <div className="flex gap-2">
              {[
                ['admin@healix.dev', 'Admin@1234', 'Admin'],
                ['dr.sarah@healix.dev', 'Doctor@1234', 'Doctor'],
                ['patient.alex@healix.dev', 'Patient@1234', 'Patient'],
              ].map(([email, pw, label]) => (
                <button
                  key={label} type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setForm({ email, password: pw })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="auth-footer">
          No account?{' '}
          <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}