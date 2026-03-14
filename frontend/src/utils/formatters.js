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

/** Returns CSS class for appointment status badge using design system classes */
export function statusBadgeClass(status) {
  const map = {
    pending:   'badge-warning',
    confirmed: 'badge-accent',
    completed: 'badge-success',
    cancelled: 'badge-danger',
    no_show:   'badge-neutral',
    INSERT:    'badge-success',
    UPDATE:    'badge-accent',
    DELETE:    'badge-danger',
  };
  return map[status] || 'badge-neutral';
}

// Alias for backward compatibility
export const statusBadge = statusBadgeClass;

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}