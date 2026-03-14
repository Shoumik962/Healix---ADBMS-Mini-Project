// src/pages/patient/Profile.jsx
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { patientsApi, authApi } from '../../api/services.js';
import toast from 'react-hot-toast';

export default function PatientProfile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '',
    date_of_birth: '', gender: '', blood_type: '',
    allergies: '', emergency_contact_name: '', emergency_contact_phone: '',
  });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });

  useEffect(() => {
    patientsApi.getProfile('me').then(r => {
      const d = r.data.data;
      if (!d) return;
      setForm({
        first_name: d.first_name || '',
        last_name:  d.last_name  || '',
        phone:      d.phone      || '',
        date_of_birth: d.date_of_birth?.slice(0,10) || '',
        gender:     d.gender     || '',
        blood_type: d.blood_type || '',
        allergies:  (d.allergies || []).join(', '),
        emergency_contact_name:  d.emergency_contact_name  || '',
        emergency_contact_phone: d.emergency_contact_phone || '',
      });
    }).catch(() => {});
  }, []);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => patientsApi.updateProfile({
      ...form,
      allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
    }),
    onSuccess: () => {
      updateUser({ first_name: form.first_name, last_name: form.last_name });
      toast.success('Profile updated');
    },
    onError: err => toast.error(err.response?.data?.message || 'Update failed'),
  });

  const { mutate: changePassword, isPending: changingPw } = useMutation({
    mutationFn: () => authApi.changePassword({
      current_password: pw.current_password,
      new_password: pw.new_password,
    }),
    onSuccess: () => {
      toast.success('Password changed');
      setPw({ current_password: '', new_password: '', confirm: '' });
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setPwField = k => e => setPw(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6" style={{ maxWidth: 560 }}>
      <h1 className="page-title">My Profile</h1>

      <div className="card">
        <div className="card-header"><h2 className="section-title">Personal Information</h2></div>
        <div className="card-body space-y-4">
          <div className="grid-2">
            <div className="input-group"><label>First name</label><input value={form.first_name} onChange={set('first_name')} /></div>
            <div className="input-group"><label>Last name</label><input value={form.last_name} onChange={set('last_name')} /></div>
          </div>
          <div className="input-group"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
          <div className="grid-2">
            <div className="input-group"><label>Date of birth</label><input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></div>
            <div className="input-group">
              <label>Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group"><label>Blood type</label><input placeholder="A+" value={form.blood_type} onChange={set('blood_type')} /></div>
            <div className="input-group"><label>Allergies (comma-separated)</label><input placeholder="Penicillin, Dust" value={form.allergies} onChange={set('allergies')} /></div>
          </div>
          <div className="grid-2">
            <div className="input-group"><label>Emergency contact name</label><input value={form.emergency_contact_name} onChange={set('emergency_contact_name')} /></div>
            <div className="input-group"><label>Emergency contact phone</label><input value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} /></div>
          </div>
        </div>
        <div className="card-footer flex justify-end">
          <button className="btn btn-primary" disabled={saving} onClick={() => save()}>
            {saving ? 'Saving...' : 'Save changes'}
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
          <button
            className="btn btn-primary"
            disabled={changingPw || !pw.new_password || pw.new_password !== pw.confirm}
            onClick={() => changePassword()}
          >
            {changingPw ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}