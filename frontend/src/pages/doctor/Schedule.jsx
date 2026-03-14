// src/pages/doctor/Schedule.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doctorsApi } from '../../api/services.js';
import toast from 'react-hot-toast';

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

const DEFAULT_AVAIL = DAYS.map(day => ({
  day_of_week: day,
  start_time: '09:00',
  end_time: '17:00',
  is_available: ['monday','tuesday','wednesday','thursday','friday'].includes(day),
  slot_duration: 30,
}));

export default function DoctorSchedule() {
  const qc = useQueryClient();
  const [slots, setSlots] = useState(DEFAULT_AVAIL);

  useQuery({
    queryKey: ['my-schedule'],
    queryFn: () => doctorsApi.mySchedule().then(r => {
      const data = r.data.data;
      if (data?.length) {
        setSlots(DAYS.map(day => {
          const existing = data.find(s => s.day_of_week === day);
          return existing || DEFAULT_AVAIL.find(d => d.day_of_week === day);
        }));
      }
      return data;
    }),
    retry: false,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => doctorsApi.setAvailability({ availability: slots.filter(s => s.is_available) }),
    onSuccess: () => { toast.success('Schedule saved'); qc.invalidateQueries({ queryKey: ['my-schedule'] }); },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  });

  const update = (day, field, val) => setSlots(ss => ss.map(s => s.day_of_week === day ? { ...s, [field]: val } : s));

  return (
    <div className="space-y-6" style={{ maxWidth: 600 }}>
      <div>
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">Set your weekly availability for appointments</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="section-title">Weekly Availability</h2>
          <span className="text-xs text-muted">{slots.filter(s => s.is_available).length} days / week</span>
        </div>

        <div>
          {slots.map((slot, i) => (
            <div
              key={slot.day_of_week}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 20px',
                borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                opacity: slot.is_available ? 1 : 0.5,
              }}
            >
              {/* Day toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 120, flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={slot.is_available}
                  onChange={e => update(slot.day_of_week, 'is_available', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span className="font-semibold text-sm" style={{ textTransform: 'capitalize' }}>{slot.day_of_week}</span>
              </label>

              {slot.is_available ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                  <input
                    type="time" value={slot.start_time}
                    onChange={e => update(slot.day_of_week, 'start_time', e.target.value)}
                    style={{ width: 110 }}
                  />
                  <span className="text-xs text-muted">to</span>
                  <input
                    type="time" value={slot.end_time}
                    onChange={e => update(slot.day_of_week, 'end_time', e.target.value)}
                    style={{ width: 110 }}
                  />
                  <select
                    value={slot.slot_duration}
                    onChange={e => update(slot.day_of_week, 'slot_duration', parseInt(e.target.value))}
                    style={{ width: 90 }}
                  >
                    {[15,20,30,45,60].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-muted" style={{ fontStyle: 'italic' }}>Not available</span>
              )}
            </div>
          ))}
        </div>

        <div className="card-footer flex justify-end">
          <button className="btn btn-primary" onClick={() => save()} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}