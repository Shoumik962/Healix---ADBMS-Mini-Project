// src/pages/admin/Appointments.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadge } from '../../utils/formatters.js';

export default function AdminAppointments() {
    const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '', page: 1 });

    const { data, isLoading } = useQuery({
        queryKey: ['admin-appts', filters],
        queryFn: () => appointmentsApi.adminAll({
            status: filters.status || undefined,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            page: filters.page,
            page_size: 15,
        }).then(r => r.data),
    });

    const appointments = data?.data || [];
    const pagination = data?.pagination || {};
    const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

    return (
        <div className="space-y-6">
            <h1 className="page-title">All Appointments</h1>

            <div className="card card-body">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <select className="input" value={filters.status} onChange={set('status')}>
                        <option value="">All statuses</option>
                        {['pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                    </select>
                    <div>
                        <label className="label text-xs">From</label>
                        <input type="date" className="input" value={filters.date_from} onChange={set('date_from')} />
                    </div>
                    <div>
                        <label className="label text-xs">To</label>
                        <input type="date" className="input" value={filters.date_to} onChange={set('date_to')} />
                    </div>
                    <button className="btn-secondary self-end"
                        onClick={() => setFilters({ status: '', date_from: '', date_to: '', page: 1 })}>
                        Clear filters
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-2">{Array(8).fill(0).map((_, i) =>
                    <div key={i} className="card card-body animate-pulse h-16 bg-gray-50" />
                )}</div>
            ) : (
                <div className="card">
                    <div className="table-wrapper rounded-xl">
                        <table className="table">
                            <thead><tr>
                                <th>Patient</th><th>Doctor</th><th>Date & Time</th><th>Status</th><th>Room</th>
                            </tr></thead>
                            <tbody>
                                {!appointments.length ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">No appointments found</td></tr>
                                ) : appointments.map(a => (
                                    <tr key={a.id}>
                                        <td>
                                            <p className="font-medium text-sm text-gray-800">{a.patient_name}</p>
                                            <p className="text-xs text-gray-400">{a.patient_email}</p>
                                        </td>
                                        <td>
                                            <p className="text-sm text-gray-700">{a.doctor_name}</p>
                                            <p className="text-xs text-gray-400">{a.specialization_name}</p>
                                        </td>
                                        <td className="text-sm text-gray-700">{formatDateTime(a.appointment_dt)}</td>
                                        <td><span className={statusBadge(a.status)}>{a.status}</span></td>
                                        <td>
                                            {a.meeting_room_id
                                                ? <span className="font-mono text-xs text-gray-500">{a.meeting_room_id}</span>
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {pagination.total_pages > 1 && (
                        <div className="card-footer flex items-center justify-between">
                            <span className="text-sm text-gray-500">{pagination.total_count} total</span>
                            <div className="flex gap-2">
                                <button className="btn-secondary btn-sm" disabled={!pagination.has_prev}
                                    onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>← Prev</button>
                                <button className="btn-secondary btn-sm" disabled={!pagination.has_next}
                                    onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next →</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}