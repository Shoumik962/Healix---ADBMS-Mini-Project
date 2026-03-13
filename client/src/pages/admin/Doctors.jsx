// src/pages/admin/Doctors.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import { formatDate } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const STATUS_TABS = ['all', 'pending', 'approved', 'rejected', 'suspended'];

export default function AdminDoctors() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['admin-doctors', tab, search, page],
        queryFn: () => adminApi.listUsers({
            role: 'doctor',
            approval_status: tab === 'all' ? undefined : tab,
            q: search, page, page_size: 12,
        }).then(r => r.data),
    });

    const { mutate: decide } = useMutation({
        mutationFn: ({ id, status, reason }) => adminApi.setDoctorStatus(id, { status, rejection_reason: reason }),
        onSuccess: (_, { status }) => {
            toast.success(`Doctor ${status}`);
            qc.invalidateQueries({ queryKey: ['admin-doctors'] });
            qc.invalidateQueries({ queryKey: ['admin-dash'] });
            setSelected(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Action failed'),
    });

    const doctors = data?.data || [];
    const pagination = data?.pagination || {};

    const statusColor = s => ({
        pending: 'badge-amber',
        approved: 'badge-green',
        rejected: 'badge-red',
        suspended: 'badge-gray',
    }[s] || 'badge-gray');

    return (
        <div className="space-y-6">
            <h1 className="page-title">Manage Doctors</h1>

            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
                {STATUS_TABS.map(s => (
                    <button key={s} onClick={() => { setTab(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors
              ${tab === s ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                        {s}
                    </button>
                ))}
            </div>

            <div className="card card-body">
                <input className="input" placeholder="Search by name, email, license…"
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array(6).fill(0).map((_, i) => <div key={i} className="card card-body animate-pulse h-32 bg-gray-50" />)}
                </div>
            ) : !doctors.length ? (
                <div className="card card-body text-center py-16 text-gray-400">
                    <p className="text-4xl mb-2">🩺</p>
                    <p>No {tab === 'all' ? '' : tab} doctors found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {doctors.map(doc => (
                        <div key={doc.id} className="card card-body space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center
                                  justify-center text-brand-700 font-bold flex-shrink-0">
                                        {doc.first_name?.[0]}{doc.last_name?.[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-800 truncate">Dr. {doc.first_name} {doc.last_name}</p>
                                        <p className="text-xs text-gray-500 truncate">{doc.email}</p>
                                    </div>
                                </div>
                                <span className={`badge flex-shrink-0 ${statusColor(doc.approval_status)}`}>
                                    {doc.approval_status}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                                <p>🩺 {doc.specialization_name || 'No specialization'}</p>
                                <p>📋 {doc.license_number || 'No license'}</p>
                                <p>📅 Joined {formatDate(doc.created_at)}</p>
                            </div>
                            {doc.approval_status === 'pending' && (
                                <div className="flex gap-2 pt-1">
                                    <button className="btn-primary btn-sm flex-1"
                                        onClick={() => decide({ id: doc.id, status: 'approved' })}>
                                        ✓ Approve
                                    </button>
                                    <button className="btn-danger btn-sm flex-1"
                                        onClick={() => decide({ id: doc.id, status: 'rejected' })}>
                                        ✗ Reject
                                    </button>
                                </div>
                            )}
                            {doc.approval_status === 'approved' && (
                                <button className="btn-secondary btn-sm w-full text-amber-600"
                                    onClick={() => decide({ id: doc.id, status: 'suspended' })}>
                                    Suspend
                                </button>
                            )}
                            {doc.approval_status === 'suspended' && (
                                <button className="btn-secondary btn-sm w-full text-green-600"
                                    onClick={() => decide({ id: doc.id, status: 'approved' })}>
                                    Reinstate
                                </button>
                            )}
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