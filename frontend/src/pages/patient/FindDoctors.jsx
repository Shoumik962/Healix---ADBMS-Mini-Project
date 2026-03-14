// src/pages/patient/FindDoctors.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { doctorsApi } from '../../api/services.js';

export default function FindDoctors() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ name: '', specialization_id: '', city: '', page: 1 });

  const { data: specs = [] } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => doctorsApi.specializations().then(r => r.data.data),
    staleTime: Infinity,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['doctors', filters],
    queryFn: () => doctorsApi.list({
      name:               filters.name              || undefined,
      specialization_id:  filters.specialization_id || undefined,
      city:               filters.city              || undefined,
      page:               filters.page,
      page_size:          9,
    }).then(r => r.data),
  });

  const doctors = data?.data || [];
  const pagination = data?.pagination || {};
  const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Find a Doctor</h1>
        <p className="page-subtitle">Browse verified healthcare professionals</p>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          placeholder="Search by name..."
          value={filters.name}
          onChange={set('name')}
          style={{ minWidth: 160 }}
        />
        <select value={filters.specialization_id} onChange={set('specialization_id')} style={{ minWidth: 160 }}>
          <option value="">All specializations</option>
          {specs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          placeholder="City..."
          value={filters.city}
          onChange={set('city')}
          style={{ minWidth: 120, maxWidth: 180 }}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setFilters({ name: '', specialization_id: '', city: '', page: 1 })}
        >
          Clear
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 140 }} />)}
        </div>
      ) : !doctors.length ? (
        <div className="empty-state">
          <p className="empty-state-title">No doctors found</p>
          <p className="empty-state-sub">Try adjusting your filters</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {doctors.map(doc => (
            <div key={doc.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/patient/book/${doc.id}`)}>
              <div className="card-body">
                <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                  <div className="avatar">
                    {doc.first_name?.[0]}{doc.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">Dr. {doc.first_name} {doc.last_name}</p>
                    <p className="text-xs text-muted mt-1">{doc.specialization_name}</p>
                  </div>
                </div>

                {doc.hospital_name && (
                  <p className="text-xs text-muted truncate" style={{ marginBottom: 4 }}>{doc.hospital_name}</p>
                )}
                {doc.city && (
                  <p className="text-xs text-tertiary truncate">{doc.city}{doc.country ? `, ${doc.country}` : ''}</p>
                )}

                <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
                  <div>
                    {doc.consultation_fee && (
                      <p className="font-semibold" style={{ fontSize: 'var(--text-sm)' }}>${doc.consultation_fee}</p>
                    )}
                    {doc.years_of_experience > 0 && (
                      <p className="text-xs text-muted">{doc.years_of_experience} yr exp.</p>
                    )}
                  </div>
                  <button className="btn btn-accent btn-sm">Book</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.total_pages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-outline btn-sm"
            disabled={!pagination.has_prev}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
          >
            Prev
          </button>
          <span className="page-info">Page {pagination.page} of {pagination.total_pages}</span>
          <button
            className="btn btn-outline btn-sm"
            disabled={!pagination.has_next}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}