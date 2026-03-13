// src/pages/doctor/IssuePrescription.jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { appointmentsApi, prescriptionsApi } from '../../api/services.js';
import { formatDateTime } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const EMPTY_MED = { medication_name: '', dosage: '', frequency: '', duration: '', instructions: '' };

export default function IssuePrescription() {
    const { apptId } = useParams();
    const navigate = useNavigate();

    const [diagnosis, setDiagnosis] = useState('');
    const [notes, setNotes] = useState('');
    const [meds, setMeds] = useState([{ ...EMPTY_MED }]);

    const { data: appt } = useQuery({
        queryKey: ['appt', apptId],
        queryFn: () => appointmentsApi.get(apptId).then(r => r.data.data),
    });

    const { mutate: issue, isPending } = useMutation({
        mutationFn: () => prescriptionsApi.issue({
            appointment_id: apptId,
            diagnosis: diagnosis.trim(),
            notes: notes.trim() || null,
            medications: meds.filter(m => m.medication_name.trim()),
        }),
        onSuccess: () => {
            toast.success('Prescription issued');
            navigate('/doctor/appointments');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to issue prescription'),
    });

    function updateMed(idx, field, val) {
        setMeds(ms => ms.map((m, i) => i === idx ? { ...m, [field]: val } : m));
    }
    function addMed() { setMeds(ms => [...ms, { ...EMPTY_MED }]); }
    function removeMed(idx) { setMeds(ms => ms.filter((_, i) => i !== idx)); }

    const canSubmit = diagnosis.trim().length > 0
        && meds.some(m => m.medication_name.trim() && m.dosage.trim() && m.frequency.trim());

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="page-title">Issue Prescription</h1>
                {appt && (
                    <p className="page-subtitle">
                        For {appt.patient_name} · {formatDateTime(appt.appointment_dt)}
                    </p>
                )}
            </div>

            {/* Diagnosis */}
            <div className="card card-body space-y-4">
                <h2 className="section-title">Diagnosis & Notes</h2>
                <div>
                    <label className="label">Diagnosis <span className="text-red-500">*</span></label>
                    <input className="input" required
                        value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                        placeholder="Primary diagnosis" />
                </div>
                <div>
                    <label className="label">Clinical notes</label>
                    <textarea className="input" rows={3}
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Additional observations, follow-up instructions…" />
                </div>
            </div>

            {/* Medications */}
            <div className="card">
                <div className="card-header">
                    <h2 className="section-title">Medications</h2>
                    <button className="btn-secondary btn-sm" onClick={addMed}>+ Add medication</button>
                </div>
                <div className="card-body space-y-4">
                    {meds.map((med, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 rounded-xl space-y-3 relative">
                            {meds.length > 1 && (
                                <button onClick={() => removeMed(idx)}
                                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-lg leading-none">
                                    ×
                                </button>
                            )}
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Medication {idx + 1}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="label">Name <span className="text-red-500">*</span></label>
                                    <input className="input" value={med.medication_name}
                                        onChange={e => updateMed(idx, 'medication_name', e.target.value)}
                                        placeholder="e.g. Amoxicillin 500mg" />
                                </div>
                                <div>
                                    <label className="label">Dosage <span className="text-red-500">*</span></label>
                                    <input className="input" value={med.dosage}
                                        onChange={e => updateMed(idx, 'dosage', e.target.value)}
                                        placeholder="e.g. 500mg" />
                                </div>
                                <div>
                                    <label className="label">Frequency <span className="text-red-500">*</span></label>
                                    <input className="input" value={med.frequency}
                                        onChange={e => updateMed(idx, 'frequency', e.target.value)}
                                        placeholder="e.g. Twice daily" />
                                </div>
                                <div>
                                    <label className="label">Duration</label>
                                    <input className="input" value={med.duration}
                                        onChange={e => updateMed(idx, 'duration', e.target.value)}
                                        placeholder="e.g. 7 days" />
                                </div>
                            </div>
                            <div>
                                <label className="label">Special instructions</label>
                                <input className="input" value={med.instructions}
                                    onChange={e => updateMed(idx, 'instructions', e.target.value)}
                                    placeholder="e.g. Take after meals" />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="card-footer flex justify-end gap-3">
                    <button className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
                    <button className="btn-primary" disabled={!canSubmit || isPending}
                        onClick={() => issue()}>
                        {isPending ? 'Issuing…' : 'Issue Prescription 💊'}
                    </button>
                </div>
            </div>
        </div>
    );
}