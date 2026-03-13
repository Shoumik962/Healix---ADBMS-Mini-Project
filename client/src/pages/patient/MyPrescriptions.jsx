// src/pages/patient/MyPrescriptions.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { prescriptionsApi } from '../../api/services.js';
import { formatDate } from '../../utils/formatters.js';

export default function MyPrescriptions() {
    const [selected, setSelected] = useState(null);
    const [page, setPage] = useState(1);

    const { data, isLoading } = useQuery({
        queryKey: ['my-prescriptions', page],
        queryFn: () => prescriptionsApi.myList({ page, page_size: 10 }).then(r => r.data),
    });

    const prescriptions = data?.data || [];
    const pagination = data?.pagination || {};

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">My Prescriptions</h1>
                <p className="page-subtitle">All prescriptions issued by your doctors</p>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {Array(4).fill(0).map((_, i) => (
                        <div key={i} className="card card-body animate-pulse h-24 bg-gray-50" />
                    ))}
                </div>
            ) : !prescriptions.length ? (
                <div className="card card-body text-center py-16 text-gray-400">
                    <p className="text-4xl mb-2">💊</p>
                    <p className="font-medium">No prescriptions yet</p>
                    <p className="text-sm mt-1">Prescriptions will appear here after a completed appointment</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {prescriptions.map(rx => (
                        <div key={rx.id}
                            className="card card-body cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
                            onClick={() => setSelected(rx)}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl mt-0.5">💊</span>
                                    <div>
                                        <p className="font-semibold text-gray-800">{rx.diagnosis}</p>
                                        <p className="text-sm text-gray-500 mt-0.5">Prescribed by {rx.doctor_name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(rx.created_at)}</p>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <span className={`badge ${new Date(rx.valid_until) > new Date() ? 'badge-green' : 'badge-gray'}`}>
                                        {new Date(rx.valid_until) > new Date() ? 'Active' : 'Expired'}
                                    </span>
                                    <p className="text-xs text-gray-400 mt-1">{rx.medications?.length || 0} medication(s)</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {pagination.total_pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button className="btn-secondary btn-sm" disabled={!pagination.has_prev} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.total_pages}</span>
                    <button className="btn-secondary btn-sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            )}

            {selected && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
                    <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <div>
                                <h3 className="section-title">{selected.diagnosis}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">{selected.doctor_name} · {formatDate(selected.created_at)}</p>
                            </div>
                            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                        </div>
                        <div className="card-body space-y-4">
                            {selected.notes && (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                                    <p className="text-xs font-medium text-blue-700 mb-1">Doctor's notes</p>
                                    <p className="text-sm text-blue-800">{selected.notes}</p>
                                </div>
                            )}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medications</p>
                                {selected.medications?.map((med, i) => (
                                    <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex items-start justify-between">
                                            <p className="font-medium text-gray-800">{med.medication_name}</p>
                                            <span className="badge-blue ml-2 flex-shrink-0">{med.dosage}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{med.frequency}{med.duration && ` · ${med.duration}`}</p>
                                        {med.instructions && <p className="text-xs text-gray-500 mt-1 italic">{med.instructions}</p>}
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                                <span>Valid until: {formatDate(selected.valid_until)}</span>
                                <span className={new Date(selected.valid_until) > new Date() ? 'text-green-600 font-medium' : 'text-gray-400'}>
                                    {new Date(selected.valid_until) > new Date() ? '● Active' : '○ Expired'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}