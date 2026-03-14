// src/pages/admin/Dashboard.jsx
import { useQuery } from '@tanstack/react-query';
import { adminApi, appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters.js';

export default function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.stats().then(r => r.data.data),
  });

  const { data: recentAppts } = useQuery({
    queryKey: ['recent-appts'],
    queryFn: () => appointmentsApi.adminAll({ page: 1, page_size: 5 }).then(r => r.data.data),
  });

  const tiles = [
    { label: 'Total Users',       value: stats?.total_active_users      || 0 },
    { label: 'Approved Doctors',  value: stats?.total_approved_doctors   || 0 },
    { label: 'Appointments Today',value: stats?.appointments_today       || 0 },
    { label: 'Pending Approvals', value: stats?.pending_doctor_approvals || 0, accent: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">System overview</p>
      </div>

      <div className="stat-grid">
        {tiles.map(({ label, value, accent }) => (
          <div key={label} className="stat-tile">
            <p className="stat-label">{label}</p>
            <p className="stat-value" style={accent && value > 0 ? { color: 'var(--warning)' } : {}}>{value}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h2 className="section-title">Recent Appointments</h2></div>
        {!recentAppts?.length ? (
          <div className="card-body empty-state">
            <p className="empty-state-title">No recent appointments</p>
          </div>
        ) : (
          <div>
            {recentAppts.map((appt, i) => (
              <div key={appt.id} className="card-row" style={{ borderTop: i === 0 ? '1px solid var(--border)' : undefined }}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{appt.patient_name} &rarr; Dr. {appt.doctor_name}</p>
                  <p className="text-xs text-muted mt-1">{formatDateTime(appt.appointment_dt)}</p>
                </div>
                <span className={`badge ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}