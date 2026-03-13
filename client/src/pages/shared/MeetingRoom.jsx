// src/pages/shared/MeetingRoom.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import toast from 'react-hot-toast';

export default function MeetingRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { meetingSocket } = useSocket();

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [roomStatus, setRoomStatus] = useState('connecting');  // connecting | waiting | active | ended
    const [participants, setParticipants] = useState({ doctor: null, patient: null });
    const [isTyping, setIsTyping] = useState(false);
    const [peerTyping, setPeerTyping] = useState(false);

    const messagesEndRef = useRef(null);
    const typingTimer = useRef(null);
    const socket = meetingSocket.current;

    useEffect(() => {
        if (!socket) return;

        // Join or start the room
        if (user?.role === 'doctor') {
            socket.emit('meeting:start', { roomId });
        } else {
            socket.emit('meeting:join', { roomId });
        }

        // ── Event listeners ───────────────────────────────────
        socket.on('meeting:started', (data) => {
            setRoomStatus('active');
            toast.success('Meeting started');
        });

        socket.on('meeting:joined', (data) => {
            setRoomStatus('active');
            toast.success(`Joined meeting with ${data.doctor_name}`);
        });

        socket.on('meeting:waiting', (data) => {
            setRoomStatus('waiting');
            toast('Waiting for the doctor to start the meeting…', { icon: '⏳' });
        });

        socket.on('meeting:participant_joined', (data) => {
            setParticipants(prev => ({ ...prev, [data.role]: data }));
            toast.success(`${data.name} joined`);
        });

        socket.on('meeting:participant_left', (data) => {
            toast(`${data.name} left the meeting`, { icon: '👋' });
        });

        socket.on('meeting:status', (data) => {
            setRoomStatus(data.status);
            if (data.participants) setParticipants(data.participants);
        });

        socket.on('meeting:message_received', (msg) => {
            setMessages(prev => [...prev, msg]);
        });

        socket.on('meeting:typing', ({ name, isTyping: typing, role }) => {
            if (role !== user?.role) setPeerTyping(typing);
        });

        socket.on('meeting:ended', (data) => {
            setRoomStatus('ended');
            toast('Meeting has ended', { icon: '🔴' });
            setTimeout(() => navigate(-1), 3000);
        });

        socket.on('meeting:error', (err) => {
            toast.error(err.message || 'Meeting error');
            if (err.code === 'INVALID_ROOM') navigate(-1);
        });

        return () => {
            socket.off('meeting:started');
            socket.off('meeting:joined');
            socket.off('meeting:waiting');
            socket.off('meeting:participant_joined');
            socket.off('meeting:participant_left');
            socket.off('meeting:status');
            socket.off('meeting:message_received');
            socket.off('meeting:typing');
            socket.off('meeting:ended');
            socket.off('meeting:error');
            socket.emit('meeting:leave', { roomId });
        };
    }, [socket, roomId, user?.role]);

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function sendMessage(e) {
        e.preventDefault();
        if (!input.trim() || !socket) return;
        socket.emit('meeting:message', { roomId, text: input.trim() });
        setInput('');
    }

    function handleTyping(val) {
        setInput(val);
        if (!socket) return;
        clearTimeout(typingTimer.current);
        if (!isTyping) {
            setIsTyping(true);
            socket.emit('meeting:typing', { roomId, isTyping: true });
        }
        typingTimer.current = setTimeout(() => {
            setIsTyping(false);
            socket.emit('meeting:typing', { roomId, isTyping: false });
        }, 1500);
    }

    function endMeeting() {
        if (!socket) return;
        socket.emit('meeting:end', { roomId });
    }

    function leaveRoom() {
        if (socket) socket.emit('meeting:leave', { roomId });
        navigate(-1);
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 rounded-t-xl">
                <div className="flex items-center gap-3">
                    <div className={`status-dot ${roomStatus === 'active' ? 'bg-green-500' :
                            roomStatus === 'waiting' ? 'bg-amber-500' :
                                roomStatus === 'ended' ? 'bg-red-500' : 'bg-gray-400'
                        }`} />
                    <div>
                        <p className="font-semibold text-gray-800 text-sm">Room: {roomId}</p>
                        <p className="text-xs text-gray-500 capitalize">{roomStatus}</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {user?.role === 'doctor' && roomStatus === 'active' && (
                        <button className="btn-danger btn-sm" onClick={endMeeting}>
                            End Meeting
                        </button>
                    )}
                    <button className="btn-secondary btn-sm" onClick={leaveRoom}>
                        Leave
                    </button>
                </div>
            </div>

            {/* Status overlay */}
            {roomStatus !== 'active' && (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                    <div className="text-center space-y-3">
                        {roomStatus === 'waiting' && (
                            <>
                                <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent
                                rounded-full animate-spin mx-auto" />
                                <p className="font-medium text-gray-700">Waiting for the doctor…</p>
                                <p className="text-sm text-gray-400">You'll be connected automatically</p>
                            </>
                        )}
                        {roomStatus === 'connecting' && (
                            <>
                                <div className="w-12 h-12 border-4 border-gray-300 border-t-brand-600
                                rounded-full animate-spin mx-auto" />
                                <p className="text-gray-600">Connecting…</p>
                            </>
                        )}
                        {roomStatus === 'ended' && (
                            <>
                                <p className="text-4xl">🔴</p>
                                <p className="font-medium text-gray-700">Meeting has ended</p>
                                <p className="text-sm text-gray-400">Returning in a moment…</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Chat area (shown when active) */}
            {roomStatus === 'active' && (
                <>
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-400 text-sm py-8">
                                <p>🔒 This conversation is private</p>
                                <p className="text-xs mt-1">Messages are not stored after the session ends</p>
                            </div>
                        )}

                        {messages.map(msg => {
                            const isMine = msg.senderId === user?.id;
                            return (
                                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${isMine
                                            ? 'bg-brand-600 text-white rounded-br-sm'
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                                        }`}>
                                        {!isMine && (
                                            <p className="text-xs font-medium mb-1 text-brand-600">
                                                {msg.senderName}
                                            </p>
                                        )}
                                        <p className="break-words">{msg.text}</p>
                                        <p className={`text-xs mt-1 ${isMine ? 'text-brand-200' : 'text-gray-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}

                        {peerTyping && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2">
                                    <div className="flex gap-1 items-center">
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Message input */}
                    <form onSubmit={sendMessage}
                        className="flex gap-2 px-4 py-3 bg-white border-t border-gray-200 rounded-b-xl">
                        <input
                            className="input flex-1"
                            placeholder="Type a message…"
                            value={input}
                            onChange={e => handleTyping(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="btn-primary flex-shrink-0"
                            disabled={!input.trim()}>
                            Send
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}