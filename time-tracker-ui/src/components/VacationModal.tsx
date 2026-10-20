import React, { useState, useMemo, useEffect } from 'react';
import { expandVacationDateRange } from '../utils/eventProcessor';
import type { DayOverride } from '../types';

interface VacationModalProps {
  isOpen: boolean;
  onClose: () => void;
  startWorkDate?: string;
  userOverrides: Record<string, DayOverride>;
  onSaveVacation: (
    startDate: string,
    endDate: string,
    excludeWeekends: boolean,
    vacation: boolean
  ) => Promise<void>;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const VacationModal: React.FC<VacationModalProps> = ({
  isOpen,
  onClose,
  startWorkDate = '',
  userOverrides,
  onSaveVacation,
}) => {
  const [mode, setMode] = useState<'day' | 'period'>('day');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [excludeWeekends, setExcludeWeekends] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      setStartDate(today);
      setEndDate(today);
      setError(null);
    }
  }, [isOpen]);

  const effectiveEndDate = mode === 'day' ? startDate : endDate;

  const previewDates = useMemo(() => {
    if (!DATE_REGEX.test(startDate)) return [];
    if (mode === 'period' && !DATE_REGEX.test(endDate)) return [];
    return expandVacationDateRange(
      startDate,
      effectiveEndDate,
      mode === 'period' ? excludeWeekends : false,
      startWorkDate
    );
  }, [startDate, endDate, effectiveEndDate, mode, excludeWeekends, startWorkDate]);

  const existingVacationDates = useMemo(() => {
    return Object.entries(userOverrides)
      .filter(([dateKey, ov]) => Boolean(ov?.vacation) && (!startWorkDate || dateKey >= startWorkDate))
      .map(([dateKey]) => dateKey)
      .sort((a, b) => b.localeCompare(a));
  }, [userOverrides, startWorkDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!DATE_REGEX.test(startDate)) {
      setError('Please select a valid date (YYYY-MM-DD).');
      return;
    }
    if (mode === 'period' && !DATE_REGEX.test(endDate)) {
      setError('Please select a valid end date (YYYY-MM-DD).');
      return;
    }
    if (startWorkDate && startDate < startWorkDate && effectiveEndDate < startWorkDate) {
      setError(`Vacation dates cannot be earlier than your start work date (${startWorkDate}).`);
      return;
    }
    if (previewDates.length === 0) {
      setError('No valid workdays in the selected range.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSaveVacation(
        startDate,
        effectiveEndDate,
        mode === 'period' ? excludeWeekends : false,
        true
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save vacation.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveSingleVacation = async (dateStr: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await onSaveVacation(dateStr, dateStr, false, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove vacation day.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div
              className="modal-icon-badge"
              style={{
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#a78bfa',
                borderColor: 'rgba(139, 92, 246, 0.35)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </div>
            <div>
              <h3>Manage Vacation Days</h3>
              <p className="modal-subtitle">
                Mark a single day or a date period as vacation in user overrides
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${mode === 'day' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  setMode('day');
                  setError(null);
                }}
              >
                Single Day
              </button>
              <button
                type="button"
                className={`btn btn-sm ${mode === 'period' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  setMode('period');
                  if (!endDate || endDate < startDate) {
                    setEndDate(startDate);
                  }
                  setError(null);
                }}
              >
                Period (Date Range)
              </button>
            </div>

            {mode === 'day' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label
                  htmlFor="vacation-single-date"
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Vacation Date
                </label>
                <input
                  id="vacation-single-date"
                  type="date"
                  min={startWorkDate || undefined}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setEndDate(e.target.value);
                    setError(null);
                  }}
                  required
                  style={{
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-focus)',
                    background: 'var(--surface-primary)',
                    color: 'var(--text-white)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.92rem',
                    colorScheme: 'dark',
                  }}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label
                    htmlFor="vacation-start-date"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    From Date
                  </label>
                  <input
                    id="vacation-start-date"
                    type="date"
                    min={startWorkDate || undefined}
                    value={startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStartDate(val);
                      if (endDate && val > endDate) {
                        setEndDate(val);
                      }
                      setError(null);
                    }}
                    required
                    style={{
                      padding: '0.6rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-focus)',
                      background: 'var(--surface-primary)',
                      color: 'var(--text-white)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.9rem',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label
                    htmlFor="vacation-end-date"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    To Date
                  </label>
                  <input
                    id="vacation-end-date"
                    type="date"
                    min={startDate || startWorkDate || undefined}
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setError(null);
                    }}
                    required
                    style={{
                      padding: '0.6rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-focus)',
                      background: 'var(--surface-primary)',
                      color: 'var(--text-white)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.9rem',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
              </div>
            )}

            {mode === 'period' && (
              <div className="option-row" style={{ marginTop: 0 }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={excludeWeekends}
                    onChange={(e) => setExcludeWeekends(e.target.checked)}
                  />
                  <span>Skip weekends (Saturday &amp; Sunday)</span>
                </label>
              </div>
            )}

            {previewDates.length > 0 && (
              <div
                className="preview-card"
                style={{
                  background: 'rgba(139, 92, 246, 0.12)',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                  color: '#c4b5fd',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="preview-icon"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <strong>
                    Will mark {previewDates.length} {previewDates.length === 1 ? 'day' : 'days'} as
                    vacation
                  </strong>
                  <p>
                    {previewDates.length <= 5
                      ? previewDates.join(', ')
                      : `${previewDates[0]} → ${previewDates[previewDates.length - 1]}`}
                  </p>
                </div>
              </div>
            )}

            {existingVacationDates.length > 0 && (
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '0.9rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Recorded Vacation Days ({existingVacationDates.length})
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                    maxHeight: '130px',
                    overflowY: 'auto',
                    paddingRight: '0.2rem',
                  }}
                >
                  {existingVacationDates.map((dStr) => (
                    <span key={dStr} className="vacation-chip">
                      <span className="timestamp-mono">{dStr}</span>
                      <button
                        type="button"
                        className="remove-break-btn"
                        onClick={() => handleRemoveSingleVacation(dStr)}
                        disabled={isSaving}
                        title={`Remove vacation on ${dStr}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || previewDates.length === 0}
            >
              {isSaving
                ? 'Saving...'
                : `Mark ${previewDates.length} ${previewDates.length === 1 ? 'Day' : 'Days'} as Vacation`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

