// src/utils/formatters.js
import { format, parseISO, isValid } from 'date-fns';

export function formatDateTime(dt) {
    if (!dt) return '—';
    try {
        const d = typeof dt === 'string' ? parseISO(dt) : dt;
        return isValid(d) ? format(d, 'MMM d, yyyy · h:mm a') : '—';
    } catch { return '—'; }
}

export function formatDate(dt) {
    if (!dt) return '—';
    try {
        const d = typeof dt === 'string' ? parseISO(dt) : dt;
        return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
    } catch { return '—'; }
}

export function formatTime(dt) {
    if (!dt) return '—';
    try {
        const d = typeof dt === 'string' ? parseISO(dt) : dt;
        return isValid(d) ? format(d, 'h:mm a') : '—';
    } catch { return '—'; }
}

// Returns Tailwind badge class for a given appointment status
export function statusBadge(status) {
    const map = {
        pending: 'badge-amber',
        confirmed: 'badge-blue',
        completed: 'badge-green',
        cancelled: 'badge-red',
        no_show: 'badge-gray',
    };
    return map[status] || 'badge-gray';
}

export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}