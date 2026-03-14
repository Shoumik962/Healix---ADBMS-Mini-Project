// src/pages/admin/ActivityLogs.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters.js';

export default function AdminLogs() {
  const [filters, setFilters] = useState({ table_name: '', action: '', page: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs', filters],
    queryFn: () => adminApi.activityLogs({
      table_name: filters.table_name || undefined,
      action:     filters.action     || undefined,
      page:       filters.page,
      page_size:  20,
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
        <p className="page-subtitle">Database changes tracked by system triggers</p>
      </div>

      <div className="filter-bar">
        <input placeholder="Table name (e.g. appointments)..." value={filters.table_name} onChange={set('table_name')} />
        <select value={filters.action} onChange={set('action')} style={{ maxWidth: 160 }}>
          <option value="">All actions</option>
          {['INSERT','UPDATE','DELETE'].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ table_name: '', action: '', page: 1 })}>Clear</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Table</th><th>Action</th><th>Record ID</th><th>User</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : !logs.length ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>No logs found</td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.changed_at)}</td>
                <td>
                  <code style={{
                    background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                    padding: '2px 6px', borderRadius: 4, fontSize: 'var(--text-xs)',
                  }}>
                    {log.table_name}
                  </code>
                </td>
                <td><span className={`badge ${statusBadgeClass(log.action)}`}>{log.action}</span></td>
                <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>
                  {log.record_id?.slice(0, 8)}...
                </td>
                <td className="text-muted">{log.user_email || log.changed_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn btn-outline btn-sm" disabled={!pagination.has_prev} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Prev</button>
          <span className="page-info">Page {pagination.page} of {pagination.total_pages}</span>
          <button className="btn btn-outline btn-sm" disabled={!pagination.has_next} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
        </div>
      )}
    </div>
  );
}