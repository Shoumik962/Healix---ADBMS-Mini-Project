// src/pages/doctor/Profile.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { doctorsApi, authApi } from '../../api/services.js';
import toast from 'react-hot-toast';

export default function DoctorProfile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', bio: '',
    hospital_name: '', address: '', city: '', state: '', country: '',
    consultation_fee: '', years_of_experience: '',
    languages: '', specialization_id: '',
  });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });

  const { data: specs = [] } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => doctorsApi.specializations().then(r => r.data.data),
    staleTime: Infinity,
  });

  useEffect(() => {
    doctorsApi.getProfile('me').then(r => {
      const d = r.data.data;
      if (!d) return;
      setForm({
        first_name:          d.first_name          || '',
        last_name:           d.last_name           || '',
        phone:               d.phone               || '',
        bio:                 d.bio                 || '',
        hospital_name:       d.hospital_name       || '',
        address:             d.address             || '',
        city:                d.city                || '',
        state:               d.state               || '',
        country:             d.country             || '',
        consultation_fee:    d.consultation_fee    || '',
        years_of_experience: d.years_of_experience || '',
        languages:           (d.languages || []).join(', '),
        specialization_id:   d.specialization_id   || '',
      });
    }).catch(() => {});
  }, []);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => doctorsApi.updateProfile({
      ...form,
      consultation_fee:    parseFloat(form.consultation_fee)  || 0,
      years_of_experience: parseInt(form.years_of_experience) || 0,
      languages: form.languages ? form.languages.split(',').map(s => s.trim()).filter(Boolean) : [],
    }),
    onSuccess: () => { updateUser({ first_name: form.first_name, last_name: form.last_name }); toast.success('Profile updated'); },
    onError: err => toast.error(err.response?.data?.message || 'Update failed'),
  });

  const { mutate: changePassword, isPending: changingPw } = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: pw.current_password, new_password: pw.new_password }),
    onSuccess: () => { toast.success('Password changed'); setPw({ current_password: '', new_password: '', confirm: '' }); },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setPwField = k => e => setPw(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6" style={{ maxWidth: 560 }}>
      <h1 className="page-title">My Profile</h1>

      {user?.approval_status === 'pending' && (
        <div className="warning-banner">Your account is pending admin approval.</div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="section-title">Professional Information</h2></div>
        <div className="card-body space-y-4">
          <div className="grid-2">
            <div className="input-group"><label>First name</label><input value={form.first_name} onChange={set('first_name')} /></div>
            <div className="input-group"><label>Last name</label><input value={form.last_name} onChange={set('last_name')} /></div>
          </div>
          <div className="input-group"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
          <div className="input-group">
            <label>Specialization</label>
            <select value={form.specialization_id} onChange={set('specialization_id')}>
              <option value="">Select...</option>
              {specs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="input-group"><label>Years of experience</label><input type="number" min="0" value={form.years_of_experience} onChange={set('years_of_experience')} /></div>
            <div className="input-group"><label>Consultation fee ($)</label><input type="number" min="0" step="0.01" value={form.consultation_fee} onChange={set('consultation_fee')} /></div>
          </div>
          <div className="input-group"><label>Languages (comma-separated)</label><input placeholder="English, Spanish" value={form.languages} onChange={set('languages')} /></div>
          <div className="input-group"><label>Bio</label><textarea rows={3} placeholder="Brief professional summary" value={form.bio} onChange={set('bio')} /></div>
        </div>
        <div className="card-header" style={{ borderBottom: 'none', borderTop: '1px solid var(--border)' }}>
          <h2 className="section-title">Practice Location</h2>
        </div>
        <div className="card-body space-y-4">
          <div className="input-group"><label>Hospital / Clinic</label><input value={form.hospital_name} onChange={set('hospital_name')} /></div>
          <div className="input-group"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
          <div className="grid-3">
            <div className="input-group"><label>City</label><input value={form.city} onChange={set('city')} /></div>
            <div className="input-group"><label>State</label><input value={form.state} onChange={set('state')} /></div>
            <div className="input-group"><label>Country</label><input value={form.country} onChange={set('country')} /></div>
          </div>
        </div>
        <div className="card-footer flex justify-end">
          <button className="btn btn-primary" disabled={isPending} onClick={() => save()}>
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="section-title">Change Password</h2></div>
        <div className="card-body space-y-4">
          <div className="input-group"><label>Current password</label><input type="password" value={pw.current_password} onChange={setPwField('current_password')} /></div>
          <div className="input-group"><label>New password</label><input type="password" value={pw.new_password} onChange={setPwField('new_password')} /></div>
          <div className="input-group"><label>Confirm new password</label><input type="password" value={pw.confirm} onChange={setPwField('confirm')} /></div>
        </div>
        <div className="card-footer flex justify-end">
          <button className="btn btn-primary" disabled={changingPw || !pw.new_password || pw.new_password !== pw.confirm} onClick={() => changePassword()}>
            {changingPw ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}