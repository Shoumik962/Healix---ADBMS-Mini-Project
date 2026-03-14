// src/pages/admin/Doctors.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import toast from 'react-hot-toast';

const STATUS_BADGE = {
  approved: 'badge-success',
  pending:  'badge-warning',
  rejected: 'badge-danger',
  suspended:'badge-danger',
};

export default function AdminDoctors() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: '', search: '', page: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-doctors', filters],
    queryFn: () => adminApi.doctors({
      status: filters.status || undefined,
      q:      filters.search || undefined,
      page:   filters.page,
      page_size: 20,
    }).then(r => r.data),
  });

  const mutOpts = msg => ({
    onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ['admin-doctors'] }); },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const { mutate: approve  } = useMutation({ mutationFn: id => adminApi.approveDoctor(id),  ...mutOpts('Doctor approved') });
  const { mutate: reject   } = useMutation({ mutationFn: id => adminApi.rejectDoctor(id),   ...mutOpts('Doctor rejected') });
  const { mutate: suspend  } = useMutation({ mutationFn: id => adminApi.suspendDoctor(id),  ...mutOpts('Doctor suspended') });

  const doctors = data?.data || [];
  const pagination = data?.pagination || {};
  const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Doctors</h1>
        <p className="page-subtitle">Manage doctor approvals and status</p>
      </div>

      <div className="filter-bar">
        <input placeholder="Search name..." value={filters.search} onChange={set('search')} />
        <select value={filters.status} onChange={set('status')} style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          {['pending','approved','rejected','suspended'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Doctor</th><th>Specialization</th><th>License</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : !doctors.length ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>No doctors found</td></tr>
            ) : doctors.map(doc => (
              <tr key={doc.id}>
                <td>
                  <p className="font-semibold">Dr. {doc.first_name} {doc.last_name}</p>
                  <p className="text-xs text-muted">{doc.email}</p>
                </td>
                <td className="text-muted">{doc.specialization_name || '—'}</td>
                <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>{doc.license_number || '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[doc.status] || 'badge-default'}`}>{doc.status}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                    {doc.status === 'pending_approval' && <>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} onClick={() => approve(doc.id)}>Approve</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}  onClick={() => reject(doc.id)}>Reject</button>
                    </>}
                    {doc.status === 'approved' && (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => suspend(doc.id)}>Suspend</button>
                    )}
                    {['rejected','suspended'].includes(doc.status) && (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} onClick={() => approve(doc.id)}>Reinstate</button>
                    )}
                  </div>
                </td>
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