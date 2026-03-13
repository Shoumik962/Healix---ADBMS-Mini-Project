// src/pages/patient/Dashboard.jsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { appointmentsApi } from '../../api/services.js';
import { formatDateTime, statusBadge } from '../../utils/formatters.js';

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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="page-title">Good morning, {user?.first_name}!</h1>
                <p className="page-subtitle">Here's your health overview</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total visits', value: stats?.total || 0, color: 'text-brand-700' },
                    { label: 'Upcoming', value: stats?.upcoming || 0, color: 'text-green-600' },
                    { label: 'Completed', value: stats?.completed || 0, color: 'text-gray-700' },
                    { label: 'Cancelled', value: stats?.cancelled || 0, color: 'text-red-600' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="card card-body text-center">
                        <p className={`text-3xl font-bold ${color}`}>{value}</p>
                        <p className="text-sm text-gray-500 mt-1">{label}</p>
                    </div>
                ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                    { to: '/patient/find-doctors', icon: '🔍', label: 'Find a Doctor' },
                    { to: '/patient/appointments', icon: '📅', label: 'My Appointments' },
                    { to: '/patient/prescriptions', icon: '💊', label: 'My Prescriptions' },
                ].map(({ to, icon, label }) => (
                    <Link key={to} to={to}
                        className="card card-body flex flex-col items-center gap-2
                       hover:border-brand-300 hover:shadow-md transition-all cursor-pointer">
                        <span className="text-3xl">{icon}</span>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                    </Link>
                ))}
            </div>

            {/* Upcoming appointments */}
            <div className="card">
                <div className="card-header">
                    <h2 className="section-title">Upcoming Appointments</h2>
                    <Link to="/patient/appointments" className="text-sm text-brand-600 hover:underline">
                        View all →
                    </Link>
                </div>
                <div className="card-body divide-y divide-gray-100">
                    {!upcoming?.length ? (
                        <div className="py-8 text-center text-gray-400">
                            <p className="text-4xl mb-2">📅</p>
                            <p>No upcoming appointments</p>
                            <Link to="/patient/find-doctors" className="mt-3 inline-block btn-primary btn-sm">
                                Book now
                            </Link>
                        </div>
                    ) : upcoming.map(appt => (
                        <div key={appt.id} className="py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center
                                justify-center text-brand-700 font-bold text-sm">
                                    {appt.doctor_name?.split(' ').slice(-1)[0]?.[0]}
                                </div>
                                <div>
                                    <p className="font-medium text-gray-800 text-sm">{appt.doctor_name}</p>
                                    <p className="text-xs text-gray-500">{appt.specialization}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-700">
                                    {formatDateTime(appt.appointment_dt)}
                                </p>
                                <span className={statusBadge(appt.status)}>{appt.status}</span>
                            </div>
                            {appt.meeting_room_id && appt.status === 'confirmed' && (
                                <Link to={`/patient/meeting/${appt.meeting_room_id}`}
                                    className="btn-primary btn-sm flex-shrink-0">
                                    Join 🎥
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}