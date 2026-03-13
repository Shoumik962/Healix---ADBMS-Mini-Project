// src/api/client.js
// =============================================================
// Axios instance with:
//   - Base URL pointing to /api/v1
//   - Authorization header injected from localStorage
//   - 401 interceptor: auto-refresh token, retry once, then logout
// =============================================================
import axios from 'axios';

const BASE_URL = '/api/v1';

export const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,           // send httpOnly refresh cookie
    headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ──────────────────
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('healix_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// ── Response interceptor: silent token refresh on 401 ─────────
let isRefreshing = false;
let refreshQueue = [];           // queued requests while refresh in flight

function processQueue(error, token = null) {
    refreshQueue.forEach(({ resolve, reject }) =>
        error ? reject(error) : resolve(token)
    );
    refreshQueue = [];
}

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;

        // Only intercept 401 on non-auth, non-retry requests
        if (
            error.response?.status === 401 &&
            !original._retry &&
            !original.url?.includes('/auth/refresh') &&
            !original.url?.includes('/auth/login')
        ) {
            if (isRefreshing) {
                // Queue this request until refresh resolves
                return new Promise((resolve, reject) => {
                    refreshQueue.push({ resolve, reject });
                }).then((token) => {
                    original.headers.Authorization = `Bearer ${token}`;
                    return api(original);
                });
            }

            original._retry = true;
            isRefreshing = true;

            try {
                const { data } = await axios.post(
                    `${BASE_URL}/auth/refresh`,
                    {},
                    { withCredentials: true }
                );
                const newToken = data.data.access_token;
                localStorage.setItem('healix_access_token', newToken);
                api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
                processQueue(null, newToken);
                original.headers.Authorization = `Bearer ${newToken}`;
                return api(original);
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                localStorage.removeItem('healix_access_token');
                localStorage.removeItem('healix_user');
                // Redirect to login — use window to avoid circular import with router
                window.location.href = '/login';
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;