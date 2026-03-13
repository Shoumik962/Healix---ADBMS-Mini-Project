// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { SocketProvider } from './contexts/SocketContext.jsx';

// ── Layouts ───────────────────────────────────────────────────
import AppLayout from './components/layout/AppLayout.jsx';

// ── Auth pages ────────────────────────────────────────────────
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';

// ── Patient pages ─────────────────────────────────────────────
import PatientDashboard from './pages/patient/Dashboard.jsx';
import FindDoctors from './pages/patient/FindDoctors.jsx';
import BookAppointment from './pages/patient/BookAppointment.jsx';
import MyAppointments from './pages/patient/MyAppointments.jsx';
import MyPrescriptions from './pages/patient/MyPrescriptions.jsx';
import PatientProfile from './pages/patient/Profile.jsx';
import MeetingRoom from './pages/shared/MeetingRoom.jsx';

// ── Doctor pages ──────────────────────────────────────────────
import DoctorDashboard from './pages/doctor/Dashboard.jsx';
import DoctorSchedule from './pages/doctor/Schedule.jsx';
import DoctorAppointments from './pages/doctor/Appointments.jsx';
import DoctorProfile from './pages/doctor/Profile.jsx';
import IssuePrescription from './pages/doctor/IssuePrescription.jsx';

// ── Admin pages ───────────────────────────────────────────────
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import AdminDoctors from './pages/admin/Doctors.jsx';
import AdminAppointments from './pages/admin/Appointments.jsx';
import AdminLogs from './pages/admin/ActivityLogs.jsx';

// ── Shared pages ──────────────────────────────────────────────
import NotificationsPage from './pages/shared/Notifications.jsx';
import NotFoundPage from './pages/shared/NotFound.jsx';

// ── Route guards ──────────────────────────────────────────────
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Root redirect by role ─────────────────────────────────────
function RoleRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Routes>
          {/* ── Public routes ────────────────────────────── */}
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

          {/* ── Patient routes ───────────────────────────── */}
          <Route path="/patient" element={
            <RequireRole role="patient"><AppLayout /></RequireRole>
          }>
            <Route index element={<PatientDashboard />} />
            <Route path="find-doctors" element={<FindDoctors />} />
            <Route path="book/:doctorId" element={<BookAppointment />} />
            <Route path="appointments" element={<MyAppointments />} />
            <Route path="prescriptions" element={<MyPrescriptions />} />
            <Route path="profile" element={<PatientProfile />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="meeting/:roomId" element={<MeetingRoom />} />
          </Route>

          {/* ── Doctor routes ────────────────────────────── */}
          <Route path="/doctor" element={
            <RequireRole role="doctor"><AppLayout /></RequireRole>
          }>
            <Route index element={<DoctorDashboard />} />
            <Route path="appointments" element={<DoctorAppointments />} />
            <Route path="schedule" element={<DoctorSchedule />} />
            <Route path="profile" element={<DoctorProfile />} />
            <Route path="prescribe/:apptId" element={<IssuePrescription />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="meeting/:roomId" element={<MeetingRoom />} />
          </Route>

          {/* ── Admin routes ─────────────────────────────── */}
          <Route path="/admin" element={
            <RequireRole role="admin"><AppLayout /></RequireRole>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="doctors" element={<AdminDoctors />} />
            <Route path="appointments" element={<AdminAppointments />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>

          {/* ── Fallbacks ─────────────────────────────────── */}
          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SocketProvider>
    </AuthProvider>
  );
}