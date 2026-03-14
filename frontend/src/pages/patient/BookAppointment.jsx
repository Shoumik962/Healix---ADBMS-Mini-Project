// src/pages/patient/BookAppointment.jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { doctorsApi, appointmentsApi } from '../../api/services.js';
import { format, addDays } from 'date-fns';
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
    onSuccess: () => {
      toast.success('Appointment booked');
      navigate('/patient/appointments');
    },
    onError: err => toast.error(err.response?.data?.message || 'Booking failed'),
  });

  const dateOptions = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(new Date(), i + 1);
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE, MMM d') };
  });

  return (
    <div className="space-y-6" style={{ maxWidth: 560 }}>
      <div>
        <h1 className="page-title">Book Appointment</h1>
        <p className="page-subtitle">Select a date and time slot</p>
      </div>

      {/* Doctor info */}
      {doctor && (
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="avatar" style={{ width: 48, height: 48, fontSize: '1rem' }}>
              {doctor.first_name?.[0]}{doctor.last_name?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Dr. {doctor.first_name} {doctor.last_name}</p>
              <p className="text-sm text-muted mt-1">{doctor.specialization_name}</p>
              {doctor.hospital_name && <p className="text-xs text-tertiary mt-1">{doctor.hospital_name}</p>}
            </div>
            {doctor.consultation_fee && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="font-bold text-sm">${doctor.consultation_fee}</p>
                <p className="text-xs text-muted">per session</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date */}
      <div className="card">
        <div className="card-header"><h2 className="section-title">Select Date</h2></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
            {dateOptions.slice(0, 10).map(({ value, label }) => (
              <button
                key={value} type="button"
                onClick={() => { setSelectedDate(value); setSelectedSlot(null); }}
                style={{
                  padding: '8px 4px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: selectedDate === value ? 'var(--accent)' : 'var(--border-light)',
                  background: selectedDate === value ? 'var(--accent-muted)' : 'var(--bg-secondary)',
                  color: selectedDate === value ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all var(--t)',
                }}
              >
                {label.split(',')[0]}<br />
                <span style={{ fontWeight: 700 }}>{label.split(',')[1]?.trim()}</span>
              </button>
            ))}
          </div>
          <select value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); }}>
            {dateOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {/* Time slots */}
      <div className="card">
        <div className="card-header">
          <h2 className="section-title">Available Times</h2>
          {availableSlots.length > 0 && (
            <span className="text-xs text-muted">{availableSlots.length} slots available</span>
          )}
        </div>
        <div className="card-body">
          {loadingSlots ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {[...Array(12)].map((_, i) => <div key={i} className="skeleton" style={{ height: 36 }} />)}
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <p className="empty-state-title">No slots available</p>
              <p className="empty-state-sub">Try a different date</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {availableSlots.map(slot => {
                const timeLabel = format(new Date(slot.slot_start), 'HH:mm');
                const isSelected = selectedSlot === slot.slot_start;
                return (
                  <button
                    key={slot.slot_start} type="button"
                    onClick={() => setSelectedSlot(slot.slot_start)}
                    style={{
                      padding: '8px 0',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border-light)',
                      background: isSelected ? 'var(--accent-muted)' : 'var(--bg-secondary)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all var(--t)',
                    }}
                  >
                    {timeLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Reason + confirm */}
      {selectedSlot && (
        <div className="card">
          <div className="card-header">
            <h2 className="section-title">Reason for Visit</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="info-banner">
              Selected: {format(new Date(selectedSlot), 'EEEE, MMMM d — HH:mm')}
            </div>
            <div className="input-group">
              <label>Describe your symptoms or reason</label>
              <textarea
                rows={3}
                placeholder="e.g. Persistent headaches for the past week"
                value={reason}
                onChange={e => setReason(e.target.value)}
                minLength={5}
                maxLength={500}
              />
              <span className="input-hint">{reason.length}/500</span>
            </div>
          </div>
          <div className="card-footer flex justify-end">
            <button
              className="btn btn-primary"
              disabled={isPending || reason.trim().length < 5}
              onClick={() => book()}
            >
              {isPending ? 'Booking...' : `Confirm — $${doctor?.consultation_fee}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}