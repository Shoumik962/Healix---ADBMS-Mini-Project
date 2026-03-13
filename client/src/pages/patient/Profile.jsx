// src/pages/patient/Profile.jsx
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { patientsApi } from '../../api/services.js';
import toast from 'react-hot-toast';

export default function PatientProfile() {
    const { user, updateUser } = useAuth();
    const [form, setForm] = useState({
        first_name: '', last_name: '', phone: '',
        date_of_birth: '', gender: 'prefer_not_to_say',
        blood_group: '', allergies: '', address: '',
    });
    const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });

    useEffect(() => {
        patientsApi.getProfile().then(r => {
            const p = r.data.data;
            setForm({
                first_name: p.first_name || '',
                last_name: p.last_name || '',
                phone: p.phone || '',
                date_of_birth: p.date_of_birth?.slice(0, 10) || '',
                gender: p.gender || 'prefer_not_to_say',
                blood_group: p.blood_group || '',
                allergies: (p.allergies || []).join(', '),
                address: p.address || '',
            });
        }).catch(() => { });
    }, []);

    const { mutate: save, isPending } = useMutation({
        mutationFn: () => patientsApi.updateProfile({
            ...form,
            allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        }),
        onSuccess: (r) => {
            updateUser({ first_name: form.first_name, last_name: form.last_name });
            toast.success('Profile updated');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Update failed'),
    });

    const { mutate: changePw, isPending: changingPw } = useMutation({
        mutationFn: () => {
            const { authApi } = require('../../api/services.js');
            return authApi.changePassword({ current_password: pwForm.current_password, new_password: pwForm.new_password });
        },
        onSuccess: () => { toast.success('Password changed'); setPwForm({ current_password: '', new_password: '', confirm: '' }); },
        onError: (err) => toast.error(err.response?.data?.message || 'Password change failed'),
    });

    const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="page-title">My Profile</h1>

            <div className="card">
                <div className="card-header"><h2 className="section-title">Personal Information</h2></div>
                <div className="card-body space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="label">First name</label>
                            <input className="input" value={form.first_name} onChange={set('first_name')} /></div>
                        <div><label className="label">Last name</label>
                            <input className="input" value={form.last_name} onChange={set('last_name')} /></div>
                    </div>
                    <div><label className="label">Phone</label>
                        <input className="input" value={form.phone} onChange={set('phone')} placeholder="+1 555 0100" /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="label">Date of birth</label>
                            <input type="date" className="input" value={form.date_of_birth} onChange={set('date_of_birth')} /></div>
                        <div><label className="label">Gender</label>
                            <select className="input" value={form.gender} onChange={set('gender')}>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                                <option value="prefer_not_to_say">Prefer not to say</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="label">Blood group</label>
                            <select className="input" value={form.blood_group} onChange={set('blood_group')}>
                                <option value="">Unknown</option>
                                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div><label className="label">Allergies</label>
                            <input className="input" value={form.allergies} onChange={set('allergies')} placeholder="Penicillin, peanuts…" /></div>
                    </div>
                    <div><label className="label">Address</label>
                        <textarea className="input" rows={2} value={form.address} onChange={set('address')} placeholder="123 Main St, City, State" /></div>
                </div>
                <div className="card-footer flex justify-end">
                    <button className="btn-primary" disabled={isPending} onClick={() => save()}>
                        {isPending ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="card-header"><h2 className="section-title">Change Password</h2></div>
                <div className="card-body space-y-4">
                    <div><label className="label">Current password</label>
                        <input type="password" className="input" value={pwForm.current_password}
                            onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))} /></div>
                    <div><label className="label">New password</label>
                        <input type="password" className="input" value={pwForm.new_password}
                            onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} /></div>
                    <div><label className="label">Confirm new password</label>
                        <input type="password" className="input" value={pwForm.confirm}
                            onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
                </div>
                <div className="card-footer flex justify-end">
                    <button className="btn-secondary" disabled={changingPw || !pwForm.current_password || pwForm.new_password !== pwForm.confirm}
                        onClick={() => changePw()}>
                        {changingPw ? 'Changing…' : 'Change password'}
                    </button>
                </div>
            </div>
        </div>
    );
}