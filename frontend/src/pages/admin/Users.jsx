// src/pages/admin/Users.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import { formatDate } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: '', role: '', page: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', filters],
    queryFn: () => adminApi.users({
      q:      filters.search || undefined,
      role:   filters.role   || undefined,
      page:   filters.page,
      page_size: 20,
    }).then(r => r.data),
  });

  const mutOpts = msg => ({
    onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const { mutate: activate  } = useMutation({ mutationFn: id => adminApi.activateUser(id),  ...mutOpts('User activated') });
  const { mutate: suspend   } = useMutation({ mutationFn: id => adminApi.suspendUser(id),   ...mutOpts('User suspended') });

  const users = data?.data || [];
  const pagination = data?.pagination || {};
  const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Manage all registered accounts</p>
      </div>

      <div className="filter-bar">
        <input placeholder="Search name or email..." value={filters.search} onChange={set('search')} />
        <select value={filters.role} onChange={set('role')} style={{ maxWidth: 160 }}>
          <option value="">All roles</option>
          <option value="patient">Patient</option>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : !users.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>No users found</td></tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td className="font-semibold">{u.first_name} {u.last_name}</td>
                <td className="text-muted">{u.email}</td>
                <td><span className="badge badge-default" style={{ textTransform: 'capitalize' }}>{u.role}</span></td>
                <td className="text-muted">{formatDate(u.created_at)}</td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {u.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {u.is_active
                    ? <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => suspend(u.id)}>Suspend</button>
                    : <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} onClick={() => activate(u.id)}>Activate</button>
                  }
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