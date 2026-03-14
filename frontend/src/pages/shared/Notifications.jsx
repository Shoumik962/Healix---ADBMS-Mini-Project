// src/pages/shared/Notifications.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { notificationsApi } from '../../api/services.js';
import { formatDateTime } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { setUnreadCount } = useSocket();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ page: 1, page_size: 30 }).then(r => r.data),
  });

  const { mutate: markRead } = useMutation({
    mutationFn: id => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
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
      toast.success('All notifications marked as read');
    },
  });

  const notifications = data?.data || [];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6" style={{ maxWidth: 600 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Notifications</h1>
          {unreadCount > 0 && <p className="page-subtitle">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-outline btn-sm" onClick={() => markAll()}>
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 64 }} />)}
        </div>
      ) : !notifications.length ? (
        <div className="empty-state">
          <p className="empty-state-title">No notifications</p>
          <p className="empty-state-sub">You're all caught up</p>
        </div>
      ) : (
        <div>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              className="card-row clickable"
              style={{
                borderTop: i === 0 ? '1px solid var(--border)' : undefined,
                background: !n.is_read ? 'var(--accent-muted)' : undefined,
                borderLeft: !n.is_read ? '3px solid var(--accent)' : '3px solid transparent',
              }}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm" style={{ fontWeight: n.is_read ? 400 : 600 }}>{n.title}</p>
                  <span className="text-xs text-muted" style={{ flexShrink: 0 }}>{formatDateTime(n.created_at)}</span>
                </div>
                <p className="text-xs text-muted mt-1">{n.message}</p>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}