// src/pages/auth/RegisterPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/services.js';
import toast from 'react-hot-toast';

const INITIAL = {
    role: 'patient', email: '', password: '',
    first_name: '', last_name: '',
    // patient
    date_of_birth: '', gender: 'prefer_not_to_say',
    // doctor
    specialization_id: '', license_number: '',
    consultation_fee: '', years_of_experience: '', bio: '',
};

export default function RegisterPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState(INITIAL);
    const [specs, setSpecs] = useState([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Fetch specializations when role = doctor
    async function handleRoleChange(role) {
        setForm(f => ({ ...f, role }));
        if (role === 'doctor' && specs.length === 0) {
            try {
                const { data } = await import('../../api/services.js')
                    .then(m => m.doctorsApi.specializations());
                setSpecs(data.data || []);
            } catch { /* skip */ }
        }
    }

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await authApi.register(form);
            toast.success(
                form.role === 'doctor'
                    ? 'Account created! Waiting for admin approval.'
                    : 'Account created! You can now sign in.'
            );
            navigate('/login');
        } catch (err) {
            const errs = err.response?.data?.errors;
            setError(
                errs ? errs.map(e => e.message).join(', ')
                    : err.response?.data?.message || 'Registration failed'
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-50 to-blue-100
                    flex items-center justify-center p-4">
            <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-brand-700">HEALIX</h1>
                    <p className="text-gray-500 mt-2">Create your account</p>
                </div>

                <div className="card">
                    <div className="card-body">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                                    {error}
                                </div>
                            )}

                            {/* Role selector */}
                            <div>
                                <label className="label">I am a…</label>
                                <div className="flex gap-3">
                                    {['patient', 'doctor'].map(r => (
                                        <button key={r} type="button"
                                            onClick={() => handleRoleChange(r)}
                                            className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors
                        ${form.role === r
                                                    ? 'bg-brand-600 text-white border-brand-600'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                                            {r === 'patient' ? '🤒 Patient' : '🩺 Doctor'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Common fields */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label">First name</label>
                                    <input className="input" required value={form.first_name} onChange={set('first_name')} />
                                </div>
                                <div>
                                    <label className="label">Last name</label>
                                    <input className="input" required value={form.last_name} onChange={set('last_name')} />
                                </div>
                            </div>

                            <div>
                                <label className="label">Email</label>
                                <input type="email" className="input" required value={form.email} onChange={set('email')} />
                            </div>

                            <div>
                                <label className="label">Password</label>
                                <input type="password" className="input" required minLength={8}
                                    value={form.password} onChange={set('password')}
                                    placeholder="Min 8 chars, 1 uppercase, 1 number" />
                            </div>

                            {/* Patient fields */}
                            {form.role === 'patient' && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="label">Date of birth</label>
                                            <input type="date" className="input" required
                                                value={form.date_of_birth} onChange={set('date_of_birth')} />
                                        </div>
                                        <div>
                                            <label className="label">Gender</label>
                                            <select className="input" value={form.gender} onChange={set('gender')}>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                                <option value="other">Other</option>
                                                <option value="prefer_not_to_say">Prefer not to say</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Doctor fields */}
                            {form.role === 'doctor' && (
                                <>
                                    <div>
                                        <label className="label">Specialization</label>
                                        <select className="input" required value={form.specialization_id}
                                            onChange={set('specialization_id')}>
                                            <option value="">Select specialization</option>
                                            {specs.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label">License number</label>
                                        <input className="input" required value={form.license_number}
                                            onChange={set('license_number')} placeholder="LIC-XXXX-0001" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="label">Years of experience</label>
                                            <input type="number" className="input" min="0"
                                                value={form.years_of_experience} onChange={set('years_of_experience')} />
                                        </div>
                                        <div>
                                            <label className="label">Consultation fee ($)</label>
                                            <input type="number" className="input" min="0" step="0.01"
                                                value={form.consultation_fee} onChange={set('consultation_fee')} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label">Bio</label>
                                        <textarea className="input" rows={3}
                                            value={form.bio} onChange={set('bio')}
                                            placeholder="Briefly describe your expertise…" />
                                    </div>
                                </>
                            )}

                            <button type="submit" className="btn-primary w-full" disabled={busy}>
                                {busy ? 'Creating account…' : 'Create account'}
                            </button>
                        </form>
                    </div>

                    <div className="card-footer text-center text-sm text-gray-500">
                        Already have an account?{' '}
                        <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}