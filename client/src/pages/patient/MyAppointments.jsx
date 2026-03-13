// src/pages/patient/MyAppointments.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadge } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const STATUS_TABS = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

export default function MyAppointments() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('all');
    const [page, setPage] = useState(1);
    const [cancelling, setCancelling] = useState(null);
    const [cancelReason, setCancelReason] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['my-appts', tab, page],
        queryFn: () => appointmentsApi.myList({
            status: tab === 'all' ? undefined : tab,
            page, page_size: 10,
        }).then(r => r.data),
    });

    const { mutate: cancel, isPending: cancelling_ } = useMutation({
        mutationFn: ({ id, reason }) => appointmentsApi.cancel(id, { cancel_reason: reason }),
        onSuccess: () => {
            toast.success('Appointment cancelled');
            qc.invalidateQueries({ queryKey: ['my-appts'] });
            qc.invalidateQueries({ queryKey: ['appt-stats'] });
            setCancelling(null);
            setCancelReason('');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Cancel failed'),
    });

    const appointments = data?.data || [];
    const pagination = data?.pagination || {};

    return (
        <div className="space-y-6">
            <h1 className="page-title">My Appointments</h1>

            {/* Status tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {STATUS_TABS.map(s => (
                    <button key={s} onClick={() => { setTab(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors
              ${tab === s ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                        {s}
                    </button>
                ))}
            </div>

            {/* List */}
            {isLoading ? (
                <div className="space-y-3">
                    {Array(4).fill(0).map((_, i) => (
                        <div key={i} className="card card-body animate-pulse h-24 bg-gray-50" />
                    ))}
                </div>
            ) : !appointments.length ? (
                <div className="card card-body text-center py-16 text-gray-400">
                    <p className="text-4xl mb-2">📅</p>
                    <p>No {tab === 'all' ? '' : tab} appointments</p>
                    {tab === 'all' && (
                        <Link to="/patient/find-doctors" className="mt-3 inline-block btn-primary btn-sm">
                            Book your first appointment
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {appointments.map(appt => (
                        <div key={appt.id} className="card card-body">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                {/* Doctor info */}
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center
                                  justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                                        {appt.doctor_name?.split(' ').filter(Boolean).pop()?.[0] || '?'}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-800 truncate">{appt.doctor_name}</p>
                                        <p className="text-xs text-gray-500">{appt.specialization_name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5 truncate">{appt.reason}</p>
                                    </div>
                                </div>

                                {/* Date + status */}
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    <p className="text-sm font-medium text-gray-700">
                                        {formatDateTime(appt.appointment_dt)}
                                    </p>
                                    <span className={statusBadge(appt.status)}>{appt.status}</span>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 flex-shrink-0">
                                    {appt.status === 'confirmed' && appt.meeting_room_id && (
                                        <Link to={`/patient/meeting/${appt.meeting_room_id}`}
                                            className="btn-primary btn-sm">
                                            Join 🎥
                                        </Link>
                                    )}
                                    {['pending', 'confirmed'].includes(appt.status) && (
                                        <button className="btn-danger btn-sm"
                                            onClick={() => setCancelling(appt)}>
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.total_pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button className="btn-secondary btn-sm" disabled={!pagination.has_prev}
                        onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span className="text-sm text-gray-600">
                        Page {pagination.page} of {pagination.total_pages}
                    </span>
                    <button className="btn-secondary btn-sm" disabled={!pagination.has_next}
                        onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            )}

            {/* Cancel modal */}
            {cancelling && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-md">
                        <div className="card-header">
                            <h3 className="section-title">Cancel Appointment</h3>
                        </div>
                        <div className="card-body space-y-4">
                            <p className="text-sm text-gray-600">
                                Cancel your appointment with <strong>{cancelling.doctor_name}</strong> on{' '}
                                <strong>{formatDateTime(cancelling.appointment_dt)}</strong>?
                            </p>
                            <div>
                                <label className="label">Reason (optional)</label>
                                <textarea className="input" rows={2}
                                    value={cancelReason}
                                    onChange={e => setCancelReason(e.target.value)}
                                    placeholder="Why are you cancelling?" />
                            </div>
                        </div>
                        <div className="card-footer flex gap-2 justify-end">
                            <button className="btn-secondary" onClick={() => setCancelling(null)}>
                                Keep it
                            </button>
                            <button className="btn-danger"
                                disabled={cancelling_}
                                onClick={() => cancel({ id: cancelling.id, reason: cancelReason })}>
                                {cancelling_ ? 'Cancelling…' : 'Yes, cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}