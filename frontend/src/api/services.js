// src/api/services.js
// One file per domain — thin wrappers over the axios client.
import api from './client.js';

// ── Auth ───────────────────────────────────────────────────────
export const authApi = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    logout: () => api.post('/auth/logout'),
    logoutAll: () => api.post('/auth/logout-all'),
    refresh: () => api.post('/auth/refresh'),
    me: () => api.get('/auth/me'),
    sessions: () => api.get('/auth/sessions'),
    changePassword: (data) => api.post('/auth/change-password', data),
};

// ── Appointments ───────────────────────────────────────────────
export const appointmentsApi = {
    book: (data) => api.post('/appointments', data),
    reschedule: (id, data) => api.post(`/appointments/${id}/reschedule`, data),
    cancel: (id, data) => api.put(`/appointments/${id}/cancel`, data),
    confirm: (id) => api.put(`/appointments/${id}/confirm`),
    complete: (id, data) => api.put(`/appointments/${id}/complete`, data),
    noShow: (id) => api.put(`/appointments/${id}/no-show`),
    get: (id) => api.get(`/appointments/${id}`),
    myList: (params) => api.get('/appointments/my', { params }),
    doctorList: (params) => api.get('/appointments/doctor', { params }),
    todayList: () => api.get('/appointments/doctor/today'),
    upcoming: (limit = 3) => api.get('/appointments/upcoming', { params: { limit } }),
    stats: () => api.get('/appointments/stats'),
    list: (params) => api.get('/appointments/my', { params }),            // alias used by MyAppointments
    adminAll: (params) => api.get('/appointments/admin/all', { params }),
};

// ── Doctors ────────────────────────────────────────────────────
export const doctorsApi = {
    search: (params) => api.get('/doctors/search', { params }),
    list: ({ name, ...rest } = {}) =>                                      // alias used by FindDoctors (name → q)
        api.get('/doctors/search', { params: { q: name || undefined, ...rest } }),
    getProfile: (id) => api.get(`/doctors/${id}`),
    getSchedule: (id, params) => api.get(`/doctors/${id}/schedule`, { params }),
    mySchedule: (params) => api.get('/doctors/me/schedule', { params }),   // used by doctor/Schedule.jsx
    getSlots: (id, params) => api.get(`/doctors/${id}/available-slots`, { params }),
    updateProfile: (data) => api.put('/doctors/profile', data),
    setAvailability: (data) => api.put('/doctors/availability', data),
    specializations: () => api.get('/doctors/specializations'),
};

// ── Patients ───────────────────────────────────────────────────
export const patientsApi = {
    getProfile: () => api.get('/patients/profile'),
    updateProfile: (data) => api.put('/patients/profile', data),
    getById: (userId) => api.get(`/patients/${userId}`),
};

// ── Prescriptions ──────────────────────────────────────────────
export const prescriptionsApi = {
    issue: (data) => api.post('/prescriptions', data),
    get: (id) => api.get(`/prescriptions/${id}`),
    myList: (params) => api.get('/prescriptions/my', { params }),
};

// ── Admin ──────────────────────────────────────────────────────
export const adminApi = {
    dashboard: () => api.get('/admin/dashboard'),
    stats: () => api.get('/admin/dashboard'),                           // alias used by AdminDashboard
    report: (params) => api.get('/admin/report', { params }),
    listUsers: (params) => api.get('/admin/users', { params }),
    users: (params) => api.get('/admin/users', { params }),             // alias used by Users.jsx
    doctors: (params) => api.get('/admin/doctors', { params }),               // dedicated doctors endpoint
    pendingDoctors: () => api.get('/admin/doctors/pending'),
    approveDoctor: (id) => api.put(`/admin/doctors/${id}/status`, { status: 'approved' }),
    rejectDoctor: (id) => api.put(`/admin/doctors/${id}/status`, { status: 'rejected' }),
    suspendDoctor: (id) => api.put(`/admin/doctors/${id}/status`, { status: 'suspended' }),
    setDoctorStatus: (id, data) => api.put(`/admin/doctors/${id}/status`, data),
    manageUser: (id, data) => api.put(`/admin/users/${id}/manage`, data),
    suspendUser: (id) => api.put(`/admin/users/${id}/manage`, { action: 'suspend' }),
    activateUser: (id) => api.put(`/admin/users/${id}/manage`, { action: 'activate' }),
    appointments: (params) => api.get('/appointments/admin/all', { params }), // used by AdminAppointments
    activityLogs: (params) => api.get('/admin/activity-logs', { params }),
};

// ── Notifications ──────────────────────────────────────────────
export const notificationsApi = {
    list: (params) => api.get('/notifications', { params }),
    markRead: (id) => api.put(`/notifications/${id}/read`),
};