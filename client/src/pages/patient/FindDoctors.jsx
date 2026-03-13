// src/pages/patient/FindDoctors.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { doctorsApi } from '../../api/services.js';

export default function FindDoctors() {
    const [filters, setFilters] = useState({
        q: '', specialization_id: '', city: '',
        min_rating: '', max_fee: '', available_day: '',
        page: 1, page_size: 12,
    });

    const { data: specs } = useQuery({
        queryKey: ['specializations'],
        queryFn: () => doctorsApi.specializations().then(r => r.data.data),
        staleTime: Infinity,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['doctors-search', filters],
        queryFn: () => doctorsApi.search(filters).then(r => r.data),
        keepPreviousData: true,
    });

    const doctors = data?.data || [];
    const pagination = data?.pagination || {};
    const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Find a Doctor</h1>
                <p className="page-subtitle">Search across {pagination.total_count || '—'} verified doctors</p>
            </div>

            {/* ── Filters ── */}
            <div className="card card-body">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <input className="input col-span-2" placeholder="🔍 Name, hospital, keyword…"
                        value={filters.q} onChange={set('q')} />

                    <select className="input" value={filters.specialization_id}
                        onChange={set('specialization_id')}>
                        <option value="">All specializations</option>
                        {specs?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <input className="input" placeholder="City" value={filters.city} onChange={set('city')} />

                    <select className="input" value={filters.available_day} onChange={set('available_day')}>
                        <option value="">Any day</option>
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                            .map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                    </select>

                    <input type="number" className="input" placeholder="Max fee ($)"
                        value={filters.max_fee} onChange={set('max_fee')} min="0" />
                </div>
            </div>

            {/* ── Results ── */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array(6).fill(0).map((_, i) => (
                        <div key={i} className="card card-body animate-pulse space-y-3">
                            <div className="flex gap-3">
                                <div className="w-14 h-14 bg-gray-200 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                                </div>
                            </div>
                            <div className="h-3 bg-gray-200 rounded" />
                            <div className="h-8 bg-gray-200 rounded-lg" />
                        </div>
                    ))}
                </div>
            ) : !doctors.length ? (
                <div className="card card-body text-center py-16 text-gray-400">
                    <p className="text-5xl mb-3">🩺</p>
                    <p className="font-medium">No doctors found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {doctors.map(doc => (
                        <DoctorCard key={doc.id} doc={doc} />
                    ))}
                </div>
            )}

            {/* ── Pagination ── */}
            {pagination.total_pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button className="btn-secondary btn-sm"
                        disabled={!pagination.has_prev}
                        onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>
                        ← Prev
                    </button>
                    <span className="text-sm text-gray-600">
                        Page {pagination.page} of {pagination.total_pages}
                    </span>
                    <button className="btn-secondary btn-sm"
                        disabled={!pagination.has_next}
                        onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}

function DoctorCard({ doc }) {
    const stars = Math.round(doc.rating || 0);

    return (
        <div className="card hover:shadow-md hover:border-brand-200 transition-all flex flex-col">
            <div className="card-body flex-1 space-y-3">
                {/* Avatar + name */}
                <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center
                          justify-center text-brand-700 text-xl font-bold flex-shrink-0">
                        {doc.first_name?.[0]}{doc.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">
                            Dr. {doc.first_name} {doc.last_name}
                        </p>
                        <p className="text-xs text-brand-600 font-medium">{doc.specialization_name}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{doc.hospital_name}</p>
                    </div>
                </div>

                {/* Rating + fee */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-amber-500">
                        {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
                        <span className="text-gray-500 ml-1">({doc.total_reviews || 0})</span>
                    </span>
                    <span className="font-semibold text-gray-700">${doc.consultation_fee}</span>
                </div>

                {/* Meta */}
                <div className="text-xs text-gray-500 space-y-1">
                    {doc.city && <p>📍 {doc.city}{doc.state ? `, ${doc.state}` : ''}</p>}
                    {doc.years_of_experience > 0 && <p>🎓 {doc.years_of_experience} years experience</p>}
                </div>

                {doc.bio && (
                    <p className="text-xs text-gray-500 line-clamp-2">{doc.bio}</p>
                )}
            </div>

            <div className="card-footer flex gap-2">
                <Link to={`/patient/book/${doc.id}`} className="btn-primary btn-sm flex-1 text-center">
                    Book Appointment
                </Link>
            </div>
        </div>
    );
}