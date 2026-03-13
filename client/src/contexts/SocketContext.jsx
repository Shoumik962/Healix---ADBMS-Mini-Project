// src/contexts/SocketContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import toast from 'react-hot-toast';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const { user, isAuthenticated } = useAuth();
    const meetingRef = useRef(null);
    const notifyRef = useRef(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            // Disconnect existing sockets when logged out
            meetingRef.current?.disconnect();
            notifyRef.current?.disconnect();
            meetingRef.current = null;
            notifyRef.current = null;
            setConnected(false);
            setUnreadCount(0);
            return;
        }

        const token = localStorage.getItem('healix_access_token');
        const opts = {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        };

        // ── /notifications namespace ──────────────────────────
        const notify = io('/notifications', opts);
        notifyRef.current = notify;

        notify.on('connect', () => setConnected(true));
        notify.on('disconnect', () => setConnected(false));

        notify.on('notification:unread_count', ({ count }) => {
            setUnreadCount(count);
        });

        notify.on('notification:new', (payload) => {
            setUnreadCount((n) => n + 1);
            toast(payload.message || payload.title, {
                icon: payload.type === 'appointment_booked' ? '📅'
                    : payload.type === 'prescription_issued' ? '💊'
                        : payload.type === 'meeting_started' ? '🎥'
                            : '🔔',
            });
        });

        notify.on('connect_error', (err) => {
            if (err.message.startsWith('SOCKET_AUTH')) {
                notify.disconnect();
            }
        });

        // ── /meeting namespace (always connected, join room on demand) ──
        const meeting = io('/meeting', opts);
        meetingRef.current = meeting;

        meeting.on('connect_error', (err) => {
            if (err.message.startsWith('SOCKET_AUTH')) meeting.disconnect();
        });

        return () => {
            notify.disconnect();
            meeting.disconnect();
        };
    }, [isAuthenticated]);

    return (
        <SocketContext.Provider value={{
            meetingSocket: meetingRef,
            notifySocket: notifyRef,
            unreadCount,
            connected,
            setUnreadCount,
        }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
    return ctx;
}   