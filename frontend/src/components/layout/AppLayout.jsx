// src/components/layout/AppLayout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import toast from 'react-hot-toast';

/* ── SVG icon set (inline, no emoji) ─────────────────────── */
const Icon = {
  home:    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>,
  search:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  cal:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  pill:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v6"/><path d="M14 20h7M14 17h7M14 14h4"/></svg>,
  user:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  bell:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  clock:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  users:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  steth:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 6.375a4.125 4.125 0 118.25 0v3.75a6.375 6.375 0 01-12.75 0v-3.75"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M12.75 10.5V18a2.5 2.5 0 005 0"/></svg>,
  list:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  logout:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const NAV = {
  patient: [
    { to: '/patient',              label: 'Dashboard',      icon: Icon.home,   end: true },
    { to: '/patient/find-doctors', label: 'Find Doctors',   icon: Icon.search },
    { to: '/patient/appointments', label: 'Appointments',   icon: Icon.cal },
    { to: '/patient/prescriptions',label: 'Prescriptions',  icon: Icon.pill },
    { to: '/patient/profile',      label: 'Profile',        icon: Icon.user },
  ],
  doctor: [
    { to: '/doctor',              label: 'Dashboard',      icon: Icon.home,  end: true },
    { to: '/doctor/appointments', label: 'Appointments',   icon: Icon.cal },
    { to: '/doctor/schedule',     label: 'Schedule',       icon: Icon.clock },
    { to: '/doctor/profile',      label: 'Profile',        icon: Icon.user },
  ],
  admin: [
    { to: '/admin',              label: 'Dashboard',      icon: Icon.home,  end: true },
    { to: '/admin/users',        label: 'Users',          icon: Icon.users },
    { to: '/admin/doctors',      label: 'Doctors',        icon: Icon.steth },
    { to: '/admin/appointments', label: 'Appointments',   icon: Icon.cal },
    { to: '/admin/logs',         label: 'Activity Logs',  icon: Icon.list },
  ],
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { unreadCount } = useSocket();
  const navigate = useNavigate();
  const navItems = NAV[user?.role] || [];
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`;

  async function handleLogout() {
    await logout();
    navigate('/login');
    toast.success('Signed out');
  }

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">HEALIX</span>
          <span className="sidebar-logo-role">{user?.role}</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}

          {/* Notifications */}
          <NavLink
            to={`/${user?.role}/notifications`}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{Icon.bell}</span>
            <span className="nav-label">Notifications</span>
            {unreadCount > 0 && (
              <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </NavLink>
        </nav>

        {/* User panel */}
        <div className="sidebar-footer">
          <div className="user-panel">
            <div className="avatar">{initials}</div>
            <div className="user-panel-info min-w-0">
              <p className="user-name">{user?.first_name} {user?.last_name}</p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <span className="nav-icon">{Icon.logout}</span>
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <main className="main-content">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}