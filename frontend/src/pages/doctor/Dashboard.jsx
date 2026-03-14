// src/pages/doctor/Dashboard.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { appointmentsApi } from '../../api/services.js';
import { formatTime, statusBadgeClass } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const STATUS_BAR = {
  completed: 'var(--success)',
  confirmed: 'var(--accent)',
  pending:   'var(--warning)',
};

export default function DoctorDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['appt-stats'],
    queryFn: () => appointmentsApi.stats().then(r => r.data.data),
  });

  const { data: today = [], isLoading } = useQuery({
    queryKey: ['today-appts'],
    queryFn: () => appointmentsApi.todayList().then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const { mutate: complete } = useMutation({
    mutationFn: id => appointmentsApi.complete(id, {}),
    onSuccess: () => {
      toast.success('Marked complete');
      qc.invalidateQueries({ queryKey: ['today-appts'] });
      qc.invalidateQueries({ queryKey: ['appt-stats'] });
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const tiles = [
    { label: "Today's Patients", value: stats?.today_count || 0, accent: true },
    { label: 'Upcoming',          value: stats?.upcoming    || 0 },
    { label: 'Completed',         value: stats?.completed   || 0 },
    { label: 'Pending',           value: stats?.pending     || 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{getGreeting()}, Dr. {user?.last_name}</h1>
        <p className="page-subtitle">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="stat-grid">
        {tiles.map(({ label, value, accent }) => (
          <div key={label} className="stat-tile">
            <p className="stat-label">{label}</p>
            <p className="stat-value" style={accent ? { color: 'var(--accent)' } : {}}>{value}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="section-title">Today's Schedule</h2>
          <Link to="/doctor/appointments" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
            All appointments
          </Link>
        </div>

        {isLoading ? (
          <div className="card-body space-y-3">
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        ) : !today.length ? (
          <div className="card-body empty-state">
            <p className="empty-state-title">No appointments today</p>
            <p className="empty-state-sub">Enjoy your free day or update your schedule</p>
          </div>
        ) : (
          <div>
            {today.map((appt, i) => (
              <div
                key={appt.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}
              >
                {/* Time */}
                <div style={{ textAlign: 'center', width: 52, flexShrink: 0 }}>
                  <p className="font-semibold" style={{ fontSize: 'var(--text-sm)' }}>{formatTime(appt.appointment_dt)}</p>
                </div>

                {/* Status bar */}
                <div style={{
                  width: 3, height: 48, borderRadius: 4, flexShrink: 0,
                  background: STATUS_BAR[appt.status] || 'var(--border)',
                }} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{appt.patient_name}</p>
                  <p className="text-xs text-muted mt-1 truncate">{appt.reason}</p>
                  {appt.allergies?.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                      Allergies: {appt.allergies.join(', ')}
                    </p>
                  )}
                </div>

                {appt.blood_group && (
                  <span className="badge badge-danger" style={{ flexShrink: 0 }}>{appt.blood_group}</span>
                )}

                {/* Actions */}
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  {appt.status === 'confirmed' && appt.meeting_room_id && (
                    <Link to={`/doctor/meeting/${appt.meeting_room_id}`} className="btn btn-accent btn-sm">Start</Link>
                  )}
                  {['pending','confirmed'].includes(appt.status) && (
                    <button className="btn btn-outline btn-sm" onClick={() => complete(appt.id)}>Complete</button>
                  )}
                  {appt.status === 'completed' && !appt.has_prescription && (
                    <Link to={`/doctor/prescribe/${appt.id}`} className="btn btn-outline btn-sm">Prescribe</Link>
                  )}
                  <span className={`badge ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}