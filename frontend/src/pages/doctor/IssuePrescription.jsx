// src/pages/doctor/IssuePrescription.jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { prescriptionsApi } from '../../api/services.js';
import toast from 'react-hot-toast';

const EMPTY_MED = { medication_name: '', dosage: '', frequency: '', duration: '', instructions: '' };

export default function IssuePrescription() {
  const { apptId } = useParams();
  const navigate = useNavigate();

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState(30);
  const [meds, setMeds] = useState([{ ...EMPTY_MED }]);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => prescriptionsApi.issue({
      appointment_id: apptId,
      diagnosis,
      notes,
      valid_days: parseInt(validDays),
      medications: meds.filter(m => m.medication_name),
    }),
    onSuccess: () => {
      toast.success('Prescription issued');
      navigate('/doctor/appointments');
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const updateMed = (i, field, val) => setMeds(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  const addMed = () => setMeds(ms => [...ms, { ...EMPTY_MED }]);
  const removeMed = i => setMeds(ms => ms.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6" style={{ maxWidth: 600 }}>
      <div>
        <h1 className="page-title">Issue Prescription</h1>
        <p className="page-subtitle">Record diagnosis and prescribe medications</p>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="section-title">Clinical Notes</h2></div>
        <div className="card-body space-y-4">
          <div className="input-group">
            <label>Diagnosis *</label>
            <input required value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Primary diagnosis..." />
          </div>
          <div className="input-group">
            <label>Doctor's Notes</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes for the patient..." />
          </div>
          <div className="input-group" style={{ maxWidth: 160 }}>
            <label>Valid for (days)</label>
            <input type="number" min="1" max="365" value={validDays} onChange={e => setValidDays(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="section-title">Medications</h2>
          <button className="btn btn-outline btn-sm" type="button" onClick={addMed}>+ Add</button>
        </div>

        <div>
          {meds.map((med, i) => (
            <div key={i} style={{ padding: '16px 20px', borderTop: i > 0 ? '1px solid var(--border)' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="text-sm font-semibold text-muted">Medication {i + 1}</span>
                {meds.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeMed(i)}>
                    Remove
                  </button>
                )}
              </div>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div className="input-group"><label>Medication name *</label><input placeholder="e.g. Paracetamol" value={med.medication_name} onChange={e => updateMed(i, 'medication_name', e.target.value)} /></div>
                <div className="input-group"><label>Dosage</label><input placeholder="e.g. 500mg" value={med.dosage} onChange={e => updateMed(i, 'dosage', e.target.value)} /></div>
              </div>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div className="input-group"><label>Frequency</label><input placeholder="e.g. Twice daily" value={med.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} /></div>
                <div className="input-group"><label>Duration</label><input placeholder="e.g. 7 days" value={med.duration} onChange={e => updateMed(i, 'duration', e.target.value)} /></div>
              </div>
              <div className="input-group">
                <label>Special instructions</label>
                <input placeholder="e.g. Take after meals" value={med.instructions} onChange={e => updateMed(i, 'instructions', e.target.value)} />
              </div>
            </div>
          ))}
        </div>

        <div className="card-footer flex justify-end">
          <button
            className="btn btn-primary"
            disabled={isPending || !diagnosis.trim()}
            onClick={() => submit()}
          >
            {isPending ? 'Issuing...' : 'Issue Prescription'}
          </button>
        </div>
      </div>
    </div>
  );
}