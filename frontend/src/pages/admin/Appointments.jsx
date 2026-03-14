// src/pages/admin/Appointments.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/services.js';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters.js';

export default function AdminAppointments() {
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '', page: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-appts', filters],
    queryFn: () => adminApi.appointments({
      status:    filters.status    || undefined,
      date_from: filters.date_from || undefined,
      date_to:   filters.date_to   || undefined,
      page:      filters.page,
      page_size: 20,
    }).then(r => r.data),
  });

  const appointments = data?.data || [];
  const pagination = data?.pagination || {};
  const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Appointments</h1>
        <p className="page-subtitle">System-wide appointment overview</p>
      </div>

      <div className="filter-bar">
        <select value={filters.status} onChange={set('status')} style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          {['pending','confirmed','completed','cancelled','no_show'].map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <input type="date" value={filters.date_from} onChange={set('date_from')} style={{ maxWidth: 160 }} />
        <input type="date" value={filters.date_to}   onChange={set('date_to')}   style={{ maxWidth: 160 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ status: '', date_from: '', date_to: '', page: 1 })}>Clear</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Patient</th><th>Doctor</th><th>Date & Time</th><th>Status</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : !appointments.length ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>No appointments found</td></tr>
            ) : appointments.map(appt => (
              <tr key={appt.id}>
                <td className="font-semibold">{appt.patient_name}</td>
                <td className="text-muted">Dr. {appt.doctor_name}</td>
                <td className="text-muted">{formatDateTime(appt.appointment_dt)}</td>
                <td><span className={`badge ${statusBadgeClass(appt.status)}`}>{appt.status}</span></td>
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