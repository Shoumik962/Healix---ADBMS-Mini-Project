// src/pages/patient/BookAppointment.jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { doctorsApi, appointmentsApi } from '../../api/services.js';
import { format, addDays, startOfDay } from 'date-fns';
import toast from 'react-hot-toast';

export default function BookAppointment() {
    const { doctorId } = useParams();
    const navigate = useNavigate();

    const [selectedDate, setSelectedDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [reason, setReason] = useState('');

    const { data: doctor } = useQuery({
        queryKey: ['doctor', doctorId],
        queryFn: () => doctorsApi.getProfile(doctorId).then(r => r.data.data),
    });

    const { data: slots, isLoading: loadingSlots } = useQuery({
        queryKey: ['slots', doctorId, selectedDate],
        queryFn: () => doctorsApi.getSchedule(doctorId, { date: selectedDate }).then(r => r.data.data),
        enabled: !!selectedDate,
    });

    const availableSlots = (slots || []).filter(s => s.is_available);

    const { mutate: book, isPending } = useMutation({
        mutationFn: () => appointmentsApi.book({
            doctor_id: doctorId,
            appointment_dt: selectedSlot,
            reason: reason.trim(),
        }),
        onSuccess: (res) => {
            toast.success('Appointment booked successfully!');
            navigate('/patient/appointments');
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Booking failed');
        },
    });

    // Date pickers: today + 30 days
    const dateOptions = Array.from({ length: 30 }, (_, i) => {
        const d = addDays(new Date(), i + 1);
        return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE, MMM d') };
    });

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="page-title">Book Appointment</h1>
                <p className="page-subtitle">Choose a date and time slot</p>
            </div>

            {/* Doctor info */}
            {doctor && (
                <div className="card card-body flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center
                          justify-center text-brand-700 text-xl font-bold flex-shrink-0">
                        {doctor.first_name?.[0]}{doctor.last_name?.[0]}
                    </div>
                    <div>
                        <p className="font-semibold text-gray-800">Dr. {doctor.first_name} {doctor.last_name}</p>
                        <p className="text-sm text-brand-600">{doctor.specialization_name}</p>
                        <p className="text-sm text-gray-500">{doctor.hospital_name}</p>
                    </div>
                    <div className="ml-auto text-right">
                        <p className="text-lg font-bold text-gray-800">${doctor.consultation_fee}</p>
                        <p className="text-xs text-gray-400">consultation fee</p>
                    </div>
                </div>
            )}

            {/* Date selector */}
            <div className="card card-body space-y-3">
                <h2 className="section-title">Select Date</h2>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {dateOptions.slice(0, 10).map(({ value, label }) => (
                        <button key={value} type="button"
                            onClick={() => { setSelectedDate(value); setSelectedSlot(null); }}
                            className={`py-2 px-1 rounded-lg text-xs font-medium border transition-colors
                ${selectedDate === value
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <select className="input" value={selectedDate}
                    onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); }}>
                    {dateOptions.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </div>

            {/* Time slots */}
            <div className="card card-body space-y-3">
                <h2 className="section-title">
                    Available Slots
                    {availableSlots.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            ({availableSlots.length} available)
                        </span>
                    )}
                </h2>

                {loadingSlots ? (
                    <div className="grid grid-cols-4 gap-2">
                        {Array(8).fill(0).map((_, i) => (
                            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : availableSlots.length === 0 ? (
                    <div className="py-8 text-center text-gray-400">
                        <p>No available slots for this date</p>
                        <p className="text-xs mt-1">Try a different day</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {availableSlots.map(slot => {
                            const timeLabel = format(new Date(slot.slot_start), 'HH:mm');
                            const isSelected = selectedSlot === slot.slot_start;
                            return (
                                <button key={slot.slot_start} type="button"
                                    onClick={() => setSelectedSlot(slot.slot_start)}
                                    className={`py-2 rounded-lg text-sm font-medium border transition-colors
                    ${isSelected
                                            ? 'bg-brand-600 text-white border-brand-600'
                                            : 'bg-white text-gray-700 border-gray-200 hover:border-brand-400'}`}>
                                    {timeLabel}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Reason + confirm */}
            {selectedSlot && (
                <div className="card card-body space-y-4">
                    <h2 className="section-title">Reason for Visit</h2>

                    <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 text-sm">
                        <span className="font-medium text-brand-800">Selected: </span>
                        <span className="text-brand-700">
                            {format(new Date(selectedSlot), 'EEEE, MMMM d — HH:mm')}
                        </span>
                    </div>

                    <div>
                        <label className="label">Describe your symptoms or reason</label>
                        <textarea className="input" rows={3}
                            placeholder="e.g. Persistent headaches for the past week…"
                            value={reason} onChange={e => setReason(e.target.value)}
                            minLength={5} maxLength={500} required />
                        <p className="text-xs text-gray-400 mt-1">{reason.length}/500</p>
                    </div>

                    <button
                        className="btn-primary w-full"
                        disabled={isPending || reason.trim().length < 5}
                        onClick={() => book()}>
                        {isPending ? 'Booking…' : `Confirm Booking — $${doctor?.consultation_fee}`}
                    </button>
                </div>
            )}
        </div>
    );
}