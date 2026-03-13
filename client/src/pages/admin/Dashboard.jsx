// src/pages/admin/Dashboard.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/services.js';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
    const qc = useQueryClient();

    const { data: dash } = useQuery({
        queryKey: ['admin-dash'],
        queryFn: () => adminApi.dashboard().then(r => r.data.data),
    });

    const { data: pending = [] } = useQuery({
        queryKey: ['pending-doctors'],
        queryFn: () => adminApi.pendingDoctors().then(r => r.data.data),
    });

    const { mutate: decide } = useMutation({
        mutationFn: ({ id, status }) => adminApi.setDoctorStatus(id, { status }),
        onSuccess: (_, { status }) => {
            toast.success(`Doctor ${status}`);
            qc.invalidateQueries({ queryKey: ['pending-doctors'] });
            qc.invalidateQueries({ queryKey: ['admin-dash'] });
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Action failed'),
    });

    const stats = [
        { label: 'Total users', value: dash?.total_users || 0, icon: '👥', color: 'text-brand-700' },
        { label: 'Active doctors', value: dash?.active_doctors || 0, icon: '🩺', color: 'text-green-600' },
        { label: "Today's appointments", value: dash?.today_appointments || 0, icon: '📅', color: 'text-amber-600' },
        { label: 'Pending approvals', value: pending.length, icon: '⏳', color: 'text-red-600' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Admin Dashboard</h1>
                <p className="page-subtitle">Platform overview</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map(({ label, value, icon, color }) => (
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

            {/* Quick links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { to: '/admin/users', icon: '👥', label: 'Manage Users' },
                    { to: '/admin/doctors', icon: '🩺', label: 'Manage Doctors' },
                    { to: '/admin/appointments', icon: '📅', label: 'All Appointments' },
                    { to: '/admin/logs', icon: '📋', label: 'Activity Logs' },
                ].map(({ to, icon, label }) => (
                    <Link key={to} to={to}
                        className="card card-body flex flex-col items-center gap-2 text-center
                       hover:border-brand-300 hover:shadow-md transition-all">
                        <span className="text-3xl">{icon}</span>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                    </Link>
                ))}
            </div>

            {/* Pending doctors */}
            {pending.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <h2 className="section-title">Pending Doctor Approvals</h2>
                        <span className="badge-amber">{pending.length} pending</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {pending.map(doc => (
                            <div key={doc.id} className="px-6 py-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center
                                justify-center text-brand-700 font-bold flex-shrink-0">
                                    {doc.first_name?.[0]}{doc.last_name?.[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-800">
                                        Dr. {doc.first_name} {doc.last_name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {doc.specialization_name} · {doc.license_number}
                                    </p>
                                    <p className="text-xs text-gray-400">{doc.email}</p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button className="btn-primary btn-sm"
                                        onClick={() => decide({ id: doc.id, status: 'approved' })}>
                                        ✓ Approve
                                    </button>
                                    <button className="btn-danger btn-sm"
                                        onClick={() => decide({ id: doc.id, status: 'rejected' })}>
                                        ✗ Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Metric cards if report data available */}
            {dash && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Total patients', value: dash.total_patients || 0 },
                        { label: 'Total appointments', value: dash.total_appointments || 0 },
                        { label: 'Completed sessions', value: dash.completed_appointments || 0 },
                    ].map(({ label, value }) => (
                        <div key={label} className="card card-body text-center">
                            <p className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</p>
                            <p className="text-sm text-gray-500 mt-1">{label}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}