// src/pages/shared/Notifications.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { notificationsApi } from '../../api/services.js';
import { formatDateTime } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const ICONS = {
    appointment_booked: '📅',
    appointment_cancelled: '❌',
    appointment_completed: '✅',
    prescription_issued: '💊',
    doctor_status_changed: '🩺',
    meeting_started: '🎥',
    default: '🔔',
};

export default function NotificationsPage() {
    const qc = useQueryClient();
    const { setUnreadCount } = useSocket();

    const { data, isLoading } = useQuery({
        queryKey: ['notifications'],
        queryFn: () => notificationsApi.list({ page: 1, page_size: 30 }).then(r => r.data),
    });

    const { mutate: markRead } = useMutation({
        mutationFn: (id) => notificationsApi.markRead(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['notifications'] });
            // recalc unread count
            qc.fetchQuery({ queryKey: ['notifications'] }).then(d => {
                setUnreadCount(d?.data?.filter(n => !n.is_read).length || 0);
            });
        },
    });

    const { mutate: markAll } = useMutation({
        mutationFn: () => Promise.all(
            (data?.data || []).filter(n => !n.is_read).map(n => notificationsApi.markRead(n.id))
        ),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['notifications'] });
            setUnreadCount(0);
            toast.success('All marked as read');
        },
    });

    const notifications = data?.data || [];
    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Notifications</h1>
                    {unreadCount > 0 && (
                        <p className="page-subtitle">{unreadCount} unread</p>
                    )}
                </div>
                {unreadCount > 0 && (
                    <button className="btn-secondary btn-sm" onClick={() => markAll()}>
                        Mark all read
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-2">{Array(6).fill(0).map((_, i) =>
                    <div key={i} className="card card-body animate-pulse h-16 bg-gray-50" />
                )}</div>
            ) : !notifications.length ? (
                <div className="card card-body text-center py-16 text-gray-400">
                    <p className="text-4xl mb-2">🔔</p>
                    <p className="font-medium">No notifications yet</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {notifications.map(n => (
                        <div key={n.id}
                            className={`card card-body flex items-start gap-3 cursor-pointer transition-all
                ${!n.is_read ? 'border-brand-300 bg-brand-50/30' : 'hover:border-gray-300'}`}
                            onClick={() => !n.is_read && markRead(n.id)}>
                            <span className="text-xl flex-shrink-0 mt-0.5">
                                {ICONS[n.type] || ICONS.default}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                        {n.title}
                                    </p>
                                    <span className="text-xs text-gray-400 flex-shrink-0">
                                        {formatDateTime(n.created_at)}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                            </div>
                            {!n.is_read && (
                                <span className="w-2 h-2 rounded-full bg-brand-600 flex-shrink-0 mt-2" />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}