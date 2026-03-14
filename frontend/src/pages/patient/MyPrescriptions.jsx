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

  const isActive = rx => new Date(rx.valid_until) > new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Prescriptions</h1>
        <p className="page-subtitle">All prescriptions issued by your doctors</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : !prescriptions.length ? (
        <div className="empty-state">
          <p className="empty-state-title">No prescriptions yet</p>
          <p className="empty-state-sub">Prescriptions appear here after a completed visit</p>
        </div>
      ) : (
        <div>
          {prescriptions.map((rx, i) => (
            <div
              key={rx.id}
              className="card-row clickable"
              style={{ borderTop: i === 0 ? '1px solid var(--border)' : undefined }}
              onClick={() => setSelected(rx)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{rx.diagnosis}</p>
                <p className="text-xs text-muted mt-1">Dr. {rx.doctor_name} &middot; {formatDate(rx.created_at)}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span className={`badge ${isActive(rx) ? 'badge-success' : 'badge-neutral'}`}>
                  {isActive(rx) ? 'Active' : 'Expired'}
                </span>
                <p className="text-xs text-muted mt-1">{rx.medications?.length || 0} med(s)</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn btn-outline btn-sm" disabled={!pagination.has_prev} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="page-info">Page {pagination.page} of {pagination.total_pages}</span>
          <button className="btn btn-outline btn-sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* Prescription detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-title">{selected.diagnosis}</p>
                <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                  Dr. {selected.doctor_name} &middot; {formatDate(selected.created_at)}
                </p>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="card-body space-y-4">
              {selected.notes && (
                <div className="info-banner">{selected.notes}</div>
              )}

              <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Medications
              </p>

              <div className="space-y-3">
                {selected.medications?.map((med, i) => (
                  <div key={i} className="card" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="card-body" style={{ padding: '12px 16px' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm">{med.medication_name}</p>
                        <span className="badge badge-accent" style={{ flexShrink: 0 }}>{med.dosage}</span>
                      </div>
                      <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                        {med.frequency}{med.duration ? ` · ${med.duration}` : ''}
                      </p>
                      {med.instructions && (
                        <p className="text-xs text-tertiary" style={{ marginTop: 4, fontStyle: 'italic' }}>{med.instructions}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-muted" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span>Valid until {formatDate(selected.valid_until)}</span>
                <span style={{ color: new Date(selected.valid_until) > new Date() ? 'var(--success)' : undefined }}>
                  {new Date(selected.valid_until) > new Date() ? 'Active' : 'Expired'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}