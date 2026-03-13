// src/pages/doctor/Dashboard.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { appointmentsApi } from '../../api/services.js';
import { formatTime, statusBadge } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

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
        refetchInterval: 60_000,   // refresh every minute
    });

    const { mutate: complete } = useMutation({
        mutationFn: (id) => appointmentsApi.complete(id, {}),
        onSuccess: () => {
            toast.success('Appointment marked complete');
            qc.invalidateQueries({ queryKey: ['today-appts'] });
            qc.invalidateQueries({ queryKey: ['appt-stats'] });
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">
                    Good {getTimeOfDay()}, Dr. {user?.last_name}!
                </h1>
                <p className="page-subtitle">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Today's patients", value: stats?.today_count || 0, color: 'text-brand-700', icon: '🏥' },
                    { label: 'Upcoming', value: stats?.upcoming || 0, color: 'text-green-600', icon: '📅' },
                    { label: 'Total completed', value: stats?.completed || 0, color: 'text-gray-700', icon: '✅' },
                    { label: 'Pending review', value: stats?.pending || 0, color: 'text-amber-600', icon: '⏳' },
                ].map(({ label, value, color, icon }) => (
                    <div key={label} className="card card-body">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{icon}</span>
                            <div>
                                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                                <p className="text-xs text-gray-500">{label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Today's schedule */}
            <div className="card">
                <div className="card-header">
                    <h2 className="section-title">Today's Schedule</h2>
                    <Link to="/doctor/appointments" className="text-sm text-brand-600 hover:underline">
                        All appointments →
                    </Link>
                </div>

                {isLoading ? (
                    <div className="card-body space-y-3">
                        {Array(3).fill(0).map((_, i) => (
                            <div key={i} className="animate-pulse h-20 bg-gray-50 rounded-lg" />
                        ))}
                    </div>
                ) : !today.length ? (
                    <div className="card-body py-12 text-center text-gray-400">
                        <p className="text-4xl mb-2">☀️</p>
                        <p className="font-medium">No appointments scheduled for today</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {today.map(appt => (
                            <div key={appt.id} className="px-6 py-4 flex items-center gap-4">
                                {/* Time */}
                                <div className="text-center w-16 flex-shrink-0">
                                    <p className="text-sm font-bold text-gray-800">{formatTime(appt.appointment_dt)}</p>
                                    <p className="text-xs text-gray-400">{formatTime(appt.end_dt)}</p>
                                </div>

                                {/* Status bar */}
                                <div className={`w-1 h-12 rounded-full flex-shrink-0 ${appt.status === 'completed' ? 'bg-green-400' :
                                        appt.status === 'confirmed' ? 'bg-brand-400' :
                                            appt.status === 'pending' ? 'bg-amber-400' : 'bg-gray-300'
                                    }`} />

                                {/* Patient info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-800">{appt.patient_name}</p>
                                    <p className="text-xs text-gray-500 truncate">{appt.reason}</p>
                                    {appt.allergies?.length > 0 && (
                                        <p className="text-xs text-red-500 mt-0.5">
                                            ⚠️ Allergies: {appt.allergies.join(', ')}
                                        </p>
                                    )}
                                </div>

                                {/* Blood group */}
                                {appt.blood_group && (
                                    <span className="badge-red flex-shrink-0">{appt.blood_group}</span>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2 flex-shrink-0">
                                    {appt.status === 'confirmed' && appt.meeting_room_id && (
                                        <Link to={`/doctor/meeting/${appt.meeting_room_id}`}
                                            className="btn-primary btn-sm">
                                            Start 🎥
                                        </Link>
                                    )}
                                    {['pending', 'confirmed'].includes(appt.status) && (
                                        <button className="btn-secondary btn-sm"
                                            onClick={() => complete(appt.id)}>
                                            ✓ Complete
                                        </button>
                                    )}
                                    {appt.status === 'completed' && !appt.has_prescription && (
                                        <Link to={`/doctor/prescribe/${appt.id}`}
                                            className="btn-secondary btn-sm">
                                            💊 Prescribe
                                        </Link>
                                    )}
                                    <span className={statusBadge(appt.status)}>{appt.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function getTimeOfDay() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
}