// src/pages/doctor/Profile.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { doctorsApi } from '../../api/services.js';
import toast from 'react-hot-toast';

export default function DoctorProfile() {
    const { user, updateUser } = useAuth();
    const [form, setForm] = useState({
        first_name: '', last_name: '', phone: '', bio: '',
        hospital_name: '', address: '', city: '', state: '', country: '',
        consultation_fee: '', years_of_experience: '',
        languages: '', specialization_id: '',
    });

    const { data: specs } = useQuery({
        queryKey: ['specializations'],
        queryFn: () => doctorsApi.specializations().then(r => r.data.data),
        staleTime: Infinity,
    });

    useEffect(() => {
        doctorsApi.getProfile('me').then(r => {
            const d = r.data.data;
            if (!d) return;
            setForm({
                first_name: d.first_name || '',
                last_name: d.last_name || '',
                phone: d.phone || '',
                bio: d.bio || '',
                hospital_name: d.hospital_name || '',
                address: d.address || '',
                city: d.city || '',
                state: d.state || '',
                country: d.country || '',
                consultation_fee: d.consultation_fee || '',
                years_of_experience: d.years_of_experience || '',
                languages: (d.languages || []).join(', '),
                specialization_id: d.specialization_id || '',
            });
        }).catch(() => { });
    }, []);

    const { mutate: save, isPending } = useMutation({
        mutationFn: () => doctorsApi.updateProfile({
            ...form,
            consultation_fee: parseFloat(form.consultation_fee) || 0,
            years_of_experience: parseInt(form.years_of_experience) || 0,
            languages: form.languages ? form.languages.split(',').map(s => s.trim()).filter(Boolean) : [],
        }),
        onSuccess: () => {
            updateUser({ first_name: form.first_name, last_name: form.last_name });
            toast.success('Profile updated');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Update failed'),
    });

    const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="page-title">My Profile</h1>

            {/* Approval status banner */}
            {user?.approval_status === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
                    ⏳ Your account is pending admin approval. You can update your profile while you wait.
                </div>
            )}

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
                        <input className="input" value={form.phone} onChange={set('phone')} /></div>
                    <div><label className="label">Specialization</label>
                        <select className="input" value={form.specialization_id} onChange={set('specialization_id')}>
                            <option value="">Select…</option>
                            {specs?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="label">Years of experience</label>
                            <input type="number" min="0" className="input" value={form.years_of_experience} onChange={set('years_of_experience')} /></div>
                        <div><label className="label">Consultation fee ($)</label>
                            <input type="number" min="0" step="0.01" className="input" value={form.consultation_fee} onChange={set('consultation_fee')} /></div>
                    </div>
                    <div><label className="label">Languages (comma-separated)</label>
                        <input className="input" value={form.languages} onChange={set('languages')} placeholder="English, Spanish" /></div>
                    <div><label className="label">Bio</label>
                        <textarea className="input" rows={3} value={form.bio} onChange={set('bio')} placeholder="Brief professional summary…" /></div>
                </div>
            </div>

            <div className="card">
                <div className="card-header"><h2 className="section-title">Practice Location</h2></div>
                <div className="card-body space-y-4">
                    <div><label className="label">Hospital / Clinic name</label>
                        <input className="input" value={form.hospital_name} onChange={set('hospital_name')} /></div>
                    <div><label className="label">Address</label>
                        <input className="input" value={form.address} onChange={set('address')} /></div>
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className="label">City</label>
                            <input className="input" value={form.city} onChange={set('city')} /></div>
                        <div><label className="label">State</label>
                            <input className="input" value={form.state} onChange={set('state')} /></div>
                        <div><label className="label">Country</label>
                            <input className="input" value={form.country} onChange={set('country')} /></div>
                    </div>
                </div>
                <div className="card-footer flex justify-end">
                    <button className="btn-primary" disabled={isPending} onClick={() => save()}>
                        {isPending ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}