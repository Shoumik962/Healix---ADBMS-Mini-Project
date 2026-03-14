// src/pages/patient/MyAppointments.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const TABS = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

export default function MyAppointments() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['patient-appts', tab, page],
    queryFn: () => appointmentsApi.list({
      status: tab === 'all' ? undefined : tab,
      page, page_size: 10,
    }).then(r => r.data),
  });

  const { mutate: cancel } = useMutation({
    mutationFn: id => appointmentsApi.cancel(id, { reason: 'Cancelled by patient' }),
    onSuccess: () => { toast.success('Appointment cancelled'); qc.invalidateQueries({ queryKey: ['patient-appts'] }); },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const appointments = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-6">
      <h1 className="page-title">My Appointments</h1>

      <div className="tab-row">
        {TABS.map(s => (
          <button key={s} className={`tab ${tab === s ? 'active' : ''}`} onClick={() => { setTab(s); setPage(1); }}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72 }} />)}
        </div>
      ) : !appointments.length ? (
        <div className="empty-state">
          <p className="empty-state-title">No {tab === 'all' ? '' : tab} appointments</p>
          <Link to="/patient/find-doctors" className="btn btn-accent btn-sm" style={{ marginTop: 14, display: 'inline-flex' }}>
            Find a doctor
          </Link>
        </div>
      ) : (
        <div>
          {appointments.map((appt, i) => (
            <div
              key={appt.id}
              className="card-row"
              style={{ borderTop: i === 0 ? '1px solid var(--border)' : undefined }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">Dr. {appt.doctor_name}</p>
                <p className="text-xs text-muted mt-1 truncate">{appt.reason}</p>
                <p className="text-xs text-tertiary mt-1">{formatDateTime(appt.appointment_dt)}</p>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span className={`badge ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
                {appt.status === 'confirmed' && appt.meeting_room_id && (
                  <Link to={`/patient/meeting/${appt.meeting_room_id}`} className="btn btn-accent btn-sm">Join</Link>
                )}
                {['pending', 'confirmed'].includes(appt.status) && (
                  <button className="btn btn-danger btn-sm" onClick={() => cancel(appt.id)}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn btn-outline btn-sm" disabled={!pagination.has_prev} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="page-info">Page {pagination.page} of {pagination.total_pages}</span>
          <button className="btn btn-outline btn-sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}