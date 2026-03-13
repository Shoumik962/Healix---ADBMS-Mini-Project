// src/pages/admin/Users.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import { formatDate } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

export default function AdminUsers() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [role, setRole] = useState('');
    const [page, setPage] = useState(1);
    const [managing, setManaging] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['admin-users', search, role, page],
        queryFn: () => adminApi.listUsers({ q: search, role, page, page_size: 15 }).then(r => r.data),
    });

    const { mutate: manage } = useMutation({
        mutationFn: ({ id, action }) => adminApi.manageUser(id, { action }),
        onSuccess: (_, { action }) => {
            toast.success(`User ${action}d`);
            qc.invalidateQueries({ queryKey: ['admin-users'] });
            setManaging(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Action failed'),
    });

    const users = data?.data || [];
    const pagination = data?.pagination || {};

    return (
        <div className="space-y-6">
            <h1 className="page-title">Manage Users</h1>

            <div className="card card-body">
                <div className="flex gap-3">
                    <input className="input flex-1" placeholder="Search by name or email…"
                        value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                    <select className="input w-36" value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
                        <option value="">All roles</option>
                        <option value="patient">Patient</option>
                        <option value="doctor">Doctor</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="card"><div className="divide-y">{Array(8).fill(0).map((_, i) =>
                    <div key={i} className="px-6 py-4 animate-pulse h-14 bg-gray-50" />
                )}</div></div>
            ) : (
                <div className="card">
                    <div className="table-wrapper rounded-xl">
                        <table className="table">
                            <thead><tr>
                                <th>User</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th>
                            </tr></thead>
                            <tbody>
                                {!users.length ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">No users found</td></tr>
                                ) : users.map(u => (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center
                                        justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                                                    {u.first_name?.[0]}{u.last_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-800 text-sm">{u.first_name} {u.last_name}</p>
                                                    <p className="text-xs text-gray-400">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span className={`badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'doctor' ? 'badge-blue' : 'badge-gray'}`}>{u.role}</span></td>
                                        <td className="text-gray-500 text-sm">{formatDate(u.created_at)}</td>
                                        <td>
                                            <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                                                {u.is_active ? 'Active' : 'Suspended'}
                                            </span>
                                        </td>
                                        <td>
                                            {u.role !== 'admin' && (
                                                <button
                                                    className={`btn-sm ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                                                    onClick={() => setManaging(u)}>
                                                    {u.is_active ? 'Suspend' : 'Activate'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {pagination.total_pages > 1 && (
                        <div className="card-footer flex items-center justify-between">
                            <span className="text-sm text-gray-500">{pagination.total_count} users total</span>
                            <div className="flex gap-2">
                                <button className="btn-secondary btn-sm" disabled={!pagination.has_prev} onClick={() => setPage(p => p - 1)}>← Prev</button>
                                <button className="btn-secondary btn-sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)}>Next →</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {managing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-sm">
                        <div className="card-header"><h3 className="section-title">{managing.is_active ? 'Suspend' : 'Activate'} User</h3></div>
                        <div className="card-body">
                            <p className="text-sm text-gray-600">
                                {managing.is_active
                                    ? `Suspend ${managing.first_name} ${managing.last_name}? They won't be able to log in.`
                                    : `Reactivate ${managing.first_name} ${managing.last_name}'s account?`}
                            </p>
                        </div>
                        <div className="card-footer flex gap-2 justify-end">
                            <button className="btn-secondary" onClick={() => setManaging(null)}>Cancel</button>
                            <button
                                className={managing.is_active ? 'btn-danger' : 'btn-primary'}
                                onClick={() => manage({ id: managing.id, action: managing.is_active ? 'suspend' : 'activate' })}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}