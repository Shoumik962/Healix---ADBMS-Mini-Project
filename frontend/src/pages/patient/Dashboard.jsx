// src/pages/patient/Dashboard.jsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters.js';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function PatientDashboard() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['appt-stats'],
    queryFn: () => appointmentsApi.stats().then(r => r.data.data),
  });

  const { data: upcoming } = useQuery({
    queryKey: ['upcoming-appts'],
    queryFn: () => appointmentsApi.upcoming(3).then(r => r.data.data),
  });

  const tiles = [
    { label: 'Total Visits',  value: stats?.total     || 0 },
    { label: 'Upcoming',      value: stats?.upcoming   || 0, accent: true },
    { label: 'Completed',     value: stats?.completed  || 0 },
    { label: 'Cancelled',     value: stats?.cancelled  || 0 },
  ];

  const quickLinks = [
    { to: '/patient/find-doctors',  label: 'Find a Doctor' },
    { to: '/patient/appointments',  label: 'Appointments' },
    { to: '/patient/prescriptions', label: 'Prescriptions' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{getGreeting()}, {user?.first_name}</h1>
        <p className="page-subtitle">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {tiles.map(({ label, value, accent }) => (
          <div key={label} className="stat-tile">
            <p className="stat-label">{label}</p>
            <p className="stat-value" style={accent ? { color: 'var(--accent)' } : {}}>{value}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {quickLinks.map(({ to, label }) => (
          <Link key={to} to={to} className="card card-body text-center" style={{ textDecoration: 'none' }}>
            <p className="section-title" style={{ color: 'var(--text-primary)' }}>{label}</p>
          </Link>
        ))}
      </div>

      {/* Upcoming appointments */}
      <div className="card">
        <div className="card-header">
          <h2 className="section-title">Upcoming Appointments</h2>
          <Link to="/patient/appointments" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
            View all
          </Link>
        </div>

        {!upcoming?.length ? (
          <div className="card-body empty-state">
            <p className="empty-state-title">No upcoming appointments</p>
            <p className="empty-state-sub">Book a session with a doctor to get started</p>
            <Link to="/patient/find-doctors" className="btn btn-accent btn-sm" style={{ marginTop: 14, display: 'inline-flex' }}>
              Find a Doctor
            </Link>
          </div>
        ) : (
          <div>
            {upcoming.map((appt, i) => (
              <div
                key={appt.id}
                className="card-row"
                style={{ borderTop: i === 0 ? '1px solid var(--border)' : undefined }}
              >
                <div className="avatar" style={{ width: 36, height: 36, fontSize: 'var(--text-xs)', flexShrink: 0 }}>
                  {appt.doctor_name?.split(' ').slice(-1)[0]?.[0] || 'D'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{appt.doctor_name}</p>
                  <p className="text-xs text-muted mt-1">{formatDateTime(appt.appointment_dt)}</p>
                </div>
                <span className={`badge ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
                {appt.meeting_room_id && appt.status === 'confirmed' && (
                  <Link to={`/patient/meeting/${appt.meeting_room_id}`} className="btn btn-accent btn-sm">
                    Join
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}