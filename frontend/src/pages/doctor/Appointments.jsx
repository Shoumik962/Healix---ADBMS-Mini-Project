// src/pages/doctor/Appointments.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const TABS = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

export default function DoctorAppointments() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['doctor-appts', tab, page],
    queryFn: () => appointmentsApi.doctorList({
      status: tab === 'all' ? undefined : tab,
      page, page_size: 12,
    }).then(r => r.data),
  });

  const mutOpts = (msg) => ({
    onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ['doctor-appts'] }); },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const { mutate: confirm  } = useMutation({ mutationFn: id => appointmentsApi.confirm(id),        ...mutOpts('Confirmed') });
  const { mutate: complete } = useMutation({ mutationFn: id => appointmentsApi.complete(id, {}),   ...mutOpts('Marked complete') });
  const { mutate: noShow   } = useMutation({ mutationFn: id => appointmentsApi.noShow(id),         ...mutOpts('Marked no-show') });

  const appointments = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-6">
      <h1 className="page-title">Appointments</h1>

      <div className="tab-row">
        {TABS.map(s => (
          <button key={s} className={`tab ${tab === s ? 'active' : ''}`} onClick={() => { setTab(s); setPage(1); }}>
            {s.replace('_', ' ')}
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
        </div>
      ) : (
        <div>
          {appointments.map((appt, i) => (
            <div
              key={appt.id}
              className="card-row"
              style={{ borderTop: i === 0 ? '1px solid var(--border)' : undefined }}
            >
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 'var(--text-xs)', flexShrink: 0 }}>
                {appt.patient_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{appt.patient_name}</p>
                <p className="text-xs text-muted mt-1 truncate">{appt.reason}</p>
                <p className="text-xs text-tertiary mt-1">{formatDateTime(appt.appointment_dt)}</p>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span className={`badge ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
                {appt.status === 'pending' && (
                  <button className="btn btn-accent btn-sm" onClick={() => confirm(appt.id)}>Confirm</button>
                )}
                {appt.status === 'confirmed' && appt.meeting_room_id && (
                  <Link to={`/doctor/meeting/${appt.meeting_room_id}`} className="btn btn-accent btn-sm">Start</Link>
                )}
                {['pending','confirmed'].includes(appt.status) && (
                  <button className="btn btn-outline btn-sm" onClick={() => complete(appt.id)}>Complete</button>
                )}
                {appt.status === 'confirmed' && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => noShow(appt.id)}>No-show</button>
                )}
                {appt.status === 'completed' && !appt.has_prescription && (
                  <Link to={`/doctor/prescribe/${appt.id}`} className="btn btn-outline btn-sm">Prescribe</Link>
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