// src/pages/shared/NotFound.jsx
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      gap: 16,
      textAlign: 'center',
      padding: 24,
    }}>
      <p style={{ fontSize: '5rem', fontWeight: 800, color: 'var(--text-tertiary)', lineHeight: 1 }}>404</p>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Page not found</h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Home</button>
      </div>
    </div>
  );
}