// src/pages/doctor/Appointments.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadge } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const TABS = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

export default function DoctorAppointments() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('all');
    const [page, setPage] = useState(1);

    const { data, isLoading } = useQuery({
        queryKey: ['doctor-appts', tab, page],
        queryFn: () => appointmentsApi.doctorList({
            status: tab === 'all' ? undefined : tab,
            page, page_size: 12,
        }).then(r => r.data),
    });

    const { mutate: confirm } = useMutation({
        mutationFn: (id) => appointmentsApi.confirm(id),
        onSuccess: () => { toast.success('Appointment confirmed'); qc.invalidateQueries({ queryKey: ['doctor-appts'] }); },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
    });

    const { mutate: complete } = useMutation({
        mutationFn: (id) => appointmentsApi.complete(id, {}),
        onSuccess: () => { toast.success('Marked complete'); qc.invalidateQueries({ queryKey: ['doctor-appts'] }); },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
    });

    const { mutate: noShow } = useMutation({
        mutationFn: (id) => appointmentsApi.noShow(id),
        onSuccess: () => { toast.success('Marked no-show'); qc.invalidateQueries({ queryKey: ['doctor-appts'] }); },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
    });

    const appointments = data?.data || [];
    const pagination = data?.pagination || {};

    return (
        <div className="space-y-6">
            <h1 className="page-title">Appointments</h1>

            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
                {TABS.map(s => (
                    <button key={s} onClick={() => { setTab(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors
              ${tab === s ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                        {s.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="space-y-3">{Array(5).fill(0).map((_, i) => (
                    <div key={i} className="card card-body animate-pulse h-20 bg-gray-50" />
                ))}</div>
            ) : !appointments.length ? (
                <div className="card card-body text-center py-16 text-gray-400">
                    <p className="text-4xl mb-2">📅</p>
                    <p>No {tab === 'all' ? '' : tab} appointments</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {appointments.map(appt => (
                        <div key={appt.id} className="card card-body">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center
                                  justify-center text-green-700 font-bold text-sm flex-shrink-0">
                                        {appt.patient_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-800">{appt.patient_name}</p>
                                        <p className="text-xs text-gray-500 truncate">{appt.reason}</p>
                                        <p className="text-xs text-gray-400">{formatDateTime(appt.appointment_dt)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                    <span className={statusBadge(appt.status)}>{appt.status}</span>
                                    {appt.status === 'pending' && (
                                        <button className="btn-primary btn-sm" onClick={() => confirm(appt.id)}>Confirm</button>
                                    )}
                                    {appt.status === 'confirmed' && appt.meeting_room_id && (
                                        <Link to={`/doctor/meeting/${appt.meeting_room_id}`} className="btn-primary btn-sm">Start 🎥</Link>
                                    )}
                                    {['pending', 'confirmed'].includes(appt.status) && (
                                        <button className="btn-secondary btn-sm" onClick={() => complete(appt.id)}>✓ Complete</button>
                                    )}
                                    {appt.status === 'confirmed' && (
                                        <button className="btn-ghost btn-sm text-amber-600" onClick={() => noShow(appt.id)}>No-show</button>
                                    )}
                                    {appt.status === 'completed' && !appt.has_prescription && (
                                        <Link to={`/doctor/prescribe/${appt.id}`} className="btn-secondary btn-sm">💊 Prescribe</Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {pagination.total_pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button className="btn-secondary btn-sm" disabled={!pagination.has_prev} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.total_pages}</span>
                    <button className="btn-secondary btn-sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            )}
        </div>
    );
}