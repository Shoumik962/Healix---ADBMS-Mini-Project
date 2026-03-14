// src/pages/auth/RegisterPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, doctorsApi } from '../../api/services.js';
import toast from 'react-hot-toast';

const INITIAL = {
  role: 'patient', email: '', password: '',
  first_name: '', last_name: '',
  date_of_birth: '', gender: 'prefer_not_to_say',
  specialization_id: '', license_number: '',
  consultation_fee: '', years_of_experience: '', bio: '',
};

const ROLES = [
  { key: 'patient', label: 'Patient' },
  { key: 'doctor',  label: 'Doctor / Clinician' },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [specs, setSpecs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleRoleChange(role) {
    setForm(f => ({ ...f, role }));
    if (role === 'doctor' && specs.length === 0) {
      try {
        const { data } = await doctorsApi.specializations();
        setSpecs(data.data || []);
      } catch { /* silent */ }
    }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.register(form);
      toast.success(
        form.role === 'doctor'
          ? 'Account created — pending admin approval'
          : 'Account created. Sign in now.'
      );
      navigate('/login');
    } catch (err) {
      const errs = err.response?.data?.errors;
      setError(
        errs ? errs.map(e => e.message).join(', ')
             : (err.response?.data?.message || 'Registration failed')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <h1 className="auth-logo">HEALIX</h1>
        <p className="auth-tagline">Create your account</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          {/* Role toggle */}
          <div className="input-group">
            <label>Account type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {ROLES.map(({ key, label }) => (
                <button
                  key={key} type="button"
                  onClick={() => handleRoleChange(key)}
                  className={`btn ${form.role === key ? 'btn-primary' : 'btn-outline'} flex-1`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Common */}
          <div className="grid-2">
            <div className="input-group">
              <label>First name</label>
              <input required value={form.first_name} onChange={set('first_name')} />
            </div>
            <div className="input-group">
              <label>Last name</label>
              <input required value={form.last_name} onChange={set('last_name')} />
            </div>
          </div>

          <div className="input-group">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={set('email')} />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              type="password" required minLength={8}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              value={form.password} onChange={set('password')}
            />
          </div>

          {/* Patient-specific */}
          {form.role === 'patient' && (
            <div className="grid-2">
              <div className="input-group">
                <label>Date of birth</label>
                <input type="date" required value={form.date_of_birth} onChange={set('date_of_birth')} />
              </div>
              <div className="input-group">
                <label>Gender</label>
                <select value={form.gender} onChange={set('gender')}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
          )}

          {/* Doctor-specific */}
          {form.role === 'doctor' && <>
            <div className="input-group">
              <label>Specialization</label>
              <select required value={form.specialization_id} onChange={set('specialization_id')}>
                <option value="">Select specialization</option>
                {specs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label>License number</label>
              <input required placeholder="LIC-XXXX-0001" value={form.license_number} onChange={set('license_number')} />
            </div>

            <div className="grid-2">
              <div className="input-group">
                <label>Years of experience</label>
                <input type="number" min="0" value={form.years_of_experience} onChange={set('years_of_experience')} />
              </div>
              <div className="input-group">
                <label>Consultation fee ($)</label>
                <input type="number" min="0" step="0.01" value={form.consultation_fee} onChange={set('consultation_fee')} />
              </div>
            </div>

            <div className="input-group">
              <label>Bio</label>
              <textarea rows={3} placeholder="Brief professional summary" value={form.bio} onChange={set('bio')} />
            </div>
          </>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}