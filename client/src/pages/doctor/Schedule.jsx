// src/pages/doctor/Schedule.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doctorsApi } from '../../api/services.js';
import toast from 'react-hot-toast';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DEFAULT_AVAIL = DAYS.map(day => ({
    day_of_week: day,
    start_time: '09:00',
    end_time: '17:00',
    is_available: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day),
    slot_duration: 30,
}));

export default function DoctorSchedule() {
    const qc = useQueryClient();
    const [slots, setSlots] = useState(DEFAULT_AVAIL);
    const [loaded, setLoaded] = useState(false);

    useQuery({
        queryKey: ['my-schedule'],
        queryFn: () => doctorsApi.getSchedule('me').then(r => {
            const data = r.data.data;
            if (data?.length) {
                setSlots(DAYS.map(day => {
                    const existing = data.find(s => s.day_of_week === day);
                    return existing || DEFAULT_AVAIL.find(d => d.day_of_week === day);
                }));
            }
            setLoaded(true);
            return data;
        }),
        retry: false,
    });

    const { mutate: save, isPending } = useMutation({
        mutationFn: () => doctorsApi.setAvailability({ availability: slots.filter(s => s.is_available) }),
        onSuccess: () => { toast.success('Schedule saved'); qc.invalidateQueries({ queryKey: ['my-schedule'] }); },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
    });

    const update = (day, field, val) => setSlots(ss =>
        ss.map(s => s.day_of_week === day ? { ...s, [field]: val } : s)
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="page-title">My Schedule</h1>
                <p className="page-subtitle">Set your weekly availability for appointments</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="section-title">Weekly Availability</h2>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />Available
                        <span className="w-3 h-3 rounded-full bg-gray-200 inline-block ml-2" />Off
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    {slots.map(slot => (
                        <div key={slot.day_of_week} className={`px-6 py-4 flex items-center gap-4
              ${!slot.is_available ? 'opacity-50' : ''}`}>
                            <div className="w-28 flex-shrink-0">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox"
                                        checked={slot.is_available}
                                        onChange={e => update(slot.day_of_week, 'is_available', e.target.checked)}
                                        className="w-4 h-4 rounded accent-brand-600"
                                    />
                                    <span className="text-sm font-medium text-gray-700 capitalize">{slot.day_of_week}</span>
                                </label>
                            </div>

                            {slot.is_available ? (
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="flex items-center gap-2">
                                        <input type="time" className="input w-28 text-sm py-1.5"
                                            value={slot.start_time}
                                            onChange={e => update(slot.day_of_week, 'start_time', e.target.value)} />
                                        <span className="text-gray-400 text-sm">to</span>
                                        <input type="time" className="input w-28 text-sm py-1.5"
                                            value={slot.end_time}
                                            onChange={e => update(slot.day_of_week, 'end_time', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-2 ml-auto">
                                        <span className="text-xs text-gray-500">Slot:</span>
                                        <select className="input w-24 text-sm py-1.5"
                                            value={slot.slot_duration}
                                            onChange={e => update(slot.day_of_week, 'slot_duration', parseInt(e.target.value))}>
                                            <option value={15}>15 min</option>
                                            <option value={20}>20 min</option>
                                            <option value={30}>30 min</option>
                                            <option value={45}>45 min</option>
                                            <option value={60}>60 min</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-400 italic">Not available</span>
                            )}
                        </div>
                    ))}
                </div>
                <div className="card-footer flex justify-between items-center">
                    <p className="text-xs text-gray-400">
                        {slots.filter(s => s.is_available).length} days available per week
                    </p>
                    <button className="btn-primary" onClick={() => save()} disabled={isPending}>
                        {isPending ? 'Saving…' : 'Save schedule'}
                    </button>
                </div>
            </div>
        </div>
    );
}