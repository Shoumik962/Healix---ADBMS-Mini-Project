// src/components/layout/AppLayout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import toast from 'react-hot-toast';

// ── Per-role nav config ───────────────────────────────────────
const NAV = {
    patient: [
        { to: '/patient', label: 'Dashboard', icon: '🏠' },
        { to: '/patient/find-doctors', label: 'Find Doctors', icon: '🔍' },
        { to: '/patient/appointments', label: 'Appointments', icon: '📅' },
        { to: '/patient/prescriptions', label: 'Prescriptions', icon: '💊' },
        { to: '/patient/profile', label: 'My Profile', icon: '👤' },
    ],
    doctor: [
        { to: '/doctor', label: 'Dashboard', icon: '🏠' },
        { to: '/doctor/appointments', label: 'Appointments', icon: '📅' },
        { to: '/doctor/schedule', label: 'My Schedule', icon: '🗓️' },
        { to: '/doctor/profile', label: 'My Profile', icon: '👤' },
    ],
    admin: [
        { to: '/admin', label: 'Dashboard', icon: '🏠' },
        { to: '/admin/users', label: 'Users', icon: '👥' },
        { to: '/admin/doctors', label: 'Doctors', icon: '🩺' },
        { to: '/admin/appointments', label: 'Appointments', icon: '📅' },
        { to: '/admin/logs', label: 'Activity Logs', icon: '📋' },
    ],
};

export default function AppLayout() {
    const { user, logout } = useAuth();
    const { unreadCount } = useSocket();
    const navigate = useNavigate();
    const navItems = NAV[user?.role] || [];

    async function handleLogout() {
        await logout();
        navigate('/login');
        toast.success('Logged out');
    }

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">

            {/* ── Sidebar ─────────────────────────────────────── */}
            <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

                {/* Logo */}
                <div className="px-6 py-5 border-b border-gray-100">
                    <span className="text-xl font-bold text-brand-700">HEALIX</span>
                    <span className="ml-2 text-xs text-gray-400 font-medium uppercase tracking-wide">
                        {user?.role}
                    </span>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navItems.map(({ to, label, icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to.split('/').length === 2}    // exact match for root role path
                            className={({ isActive }) =>
                                `nav-link ${isActive ? 'nav-link-active' : ''}`
                            }
                        >
                            <span className="text-base">{icon}</span>
                            <span>{label}</span>
                        </NavLink>
                    ))}

                    {/* Notifications link with badge */}
                    <NavLink
                        to={`/${user?.role}/notifications`}
                        className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                    >
                        <span className="text-base">🔔</span>
                        <span className="flex-1">Notifications</span>
                        {unreadCount > 0 && (
                            <span className="ml-auto bg-brand-600 text-white text-xs font-bold
                               px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </NavLink>
                </nav>

                {/* User panel + logout */}
                <div className="px-3 py-4 border-t border-gray-100">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 mb-2">
                        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center
                            text-white text-sm font-bold flex-shrink-0">
                            {user?.first_name?.[0]}{user?.last_name?.[0]}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                                {user?.first_name} {user?.last_name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="w-full btn-ghost text-sm py-2 rounded-lg">
                        🚪 Sign out
                    </button>
                </div>
            </aside>

            {/* ── Main content ─────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto px-6 py-8">
                    <Outlet />
                </div>
            </main>

        </div>
    );
}