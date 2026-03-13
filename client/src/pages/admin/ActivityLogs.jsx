// src/pages/admin/ActivityLogs.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import { formatDateTime } from '../../utils/formatters.js';

const ACTION_COLORS = {
    INSERT: 'badge-green',
    UPDATE: 'badge-blue',
    DELETE: 'badge-red',
    LOGIN: 'badge-purple',
    LOGOUT: 'badge-gray',
};

export default function AdminLogs() {
    const [filters, setFilters] = useState({ table_name: '', action: '', page: 1 });

    const { data, isLoading } = useQuery({
        queryKey: ['activity-logs', filters],
        queryFn: () => adminApi.activityLogs({
            table_name: filters.table_name || undefined,
            action: filters.action || undefined,
            page: filters.page,
            page_size: 20,
        }).then(r => r.data),
        refetchInterval: 30_000,
    });

    const logs = data?.data || [];
    const pagination = data?.pagination || {};
    const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Activity Logs</h1>
                <p className="page-subtitle">All database changes and actions tracked by triggers</p>
            </div>

            <div className="card card-body">
                <div className="flex gap-3">
                    <input className="input flex-1" placeholder="Filter by table (e.g. appointments)…"
                        value={filters.table_name} onChange={set('table_name')} />
                    <select className="input w-36" value={filters.action} onChange={set('action')}>
                        <option value="">All actions</option>
                        {['INSERT', 'UPDATE', 'DELETE'].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button className="btn-secondary"
                        onClick={() => setFilters({ table_name: '', action: '', page: 1 })}>Clear</button>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-2">{Array(10).fill(0).map((_, i) =>
                    <div key={i} className="card card-body animate-pulse h-14 bg-gray-50" />
                )}</div>
            ) : (
                <div className="card">
                    <div className="table-wrapper rounded-xl">
                        <table className="table">
                            <thead><tr>
                                <th>Time</th><th>Table</th><th>Action</th><th>Record ID</th><th>User</th>
                            </tr></thead>
                            <tbody>
                                {!logs.length ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">No logs found</td></tr>
                                ) : logs.map(log => (
                                    <tr key={log.id}>
                                        <td className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(log.changed_at)}</td>
                                        <td><span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{log.table_name}</span></td>
                                        <td><span className={`badge ${ACTION_COLORS[log.action] || 'badge-gray'}`}>{log.action}</span></td>
                                        <td className="font-mono text-xs text-gray-500">{log.record_id?.slice(0, 8)}…</td>
                                        <td className="text-xs text-gray-500">{log.user_email || log.changed_by || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {pagination.total_pages > 1 && (
                        <div className="card-footer flex items-center justify-between">
                            <span className="text-sm text-gray-500">{pagination.total_count} entries</span>
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