import React, { useState, useEffect } from 'react';
import type { CustomBreak, DayOverride } from '../types';
import { normalize24hTime } from '../utils/eventProcessor';

interface CustomWorkDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  startWorkDate?: string;
  userOverrides: Record<string, DayOverride>;
  onSaveWorkDay: (
    date: string,
    start: string | null,
    end: string | null,
    breaks: CustomBreak[] | null
  ) => Promise<void>;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function time24ToSeconds(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export const CustomWorkDayModal: React.FC<CustomWorkDayModalProps> = ({
  isOpen,
  onClose,
  startWorkDate = '',
  userOverrides,
  onSaveWorkDay,
}) => {
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('08:30');
  const [endTime, setEndTime] = useState<string>('17:30');
  const [breaks, setBreaks] = useState<CustomBreak[]>([]);
  const [newBreakStart, setNewBreakStart] = useState<string>('15:00');
  const [newBreakEnd, setNewBreakEnd] = useState<string>('15:30');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      setDate(today);

      const existing = userOverrides[today];
      setStartTime(existing?.start ? normalize24hTime(existing.start) : '08:30');
      setEndTime(existing?.end ? normalize24hTime(existing.end) : '17:30');
      setBreaks(existing?.breaks ? [...existing.breaks] : []);
      setError(null);
    }
  }, [isOpen, userOverrides]);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setError(null);
    const existing = userOverrides[newDate];
    if (existing) {
      if (existing.start) setStartTime(normalize24hTime(existing.start));
      if (existing.end) setEndTime(normalize24hTime(existing.end));
      setBreaks(existing.breaks ? [...existing.breaks] : []);
    }
  };

  if (!isOpen) return null;

  const handleAddBreak = () => {
    const s = newBreakStart.trim();
    const e = newBreakEnd.trim();
    if (!TIME_24H_REGEX.test(s) || !TIME_24H_REGEX.test(e)) {
      setError('Custom break times must use 24h format HH:mm (e.g. 15:00 to 15:30).');
      return;
    }
    if (time24ToSeconds(e) <= time24ToSeconds(s)) {
      setError('Break end time must be after break start time.');
      return;
    }
    setBreaks((prev) => [...prev, { start: normalize24hTime(s), end: normalize24hTime(e) }]);
    setError(null);
  };

  const handleRemoveBreak = (idx: number) => {
    setBreaks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dTrim = date.trim();
    const sTrim = startTime.trim();
    const eTrim = endTime.trim();

    if (!DATE_REGEX.test(dTrim)) {
      setError('Please select a valid date (YYYY-MM-DD).');
      return;
    }
    if (startWorkDate && dTrim < startWorkDate) {
      setError(`Date cannot be earlier than your start work date (${startWorkDate}).`);
      return;
    }
    if (!sTrim || !TIME_24H_REGEX.test(sTrim)) {
      setError('Please enter a valid start time in 24h HH:mm format (hours and minutes only).');
      return;
    }
    if (eTrim && !TIME_24H_REGEX.test(eTrim)) {
      setError('Please enter a valid end time in 24h HH:mm format (or leave empty).');
      return;
    }
    if (eTrim && time24ToSeconds(eTrim) <= time24ToSeconds(sTrim)) {
      setError('End work time must be after start work time.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSaveWorkDay(
        dTrim,
        normalize24hTime(sTrim),
        eTrim ? normalize24hTime(eTrim) : null,
        breaks.length > 0 ? breaks : null
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save custom work day.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="12" y1="14" x2="12" y2="18" />
                <line x1="10" y1="16" x2="14" y2="16" />
              </svg>
            </div>
            <div>
              <h3>Add Custom Work Day</h3>
              <p className="modal-subtitle">
                Create or override a work day from scratch in user overrides
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="custom-workday-date"
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Work Date
              </label>
              <input
                id="custom-workday-date"
                type="date"
                min={startWorkDate || undefined}
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label
                  htmlFor="custom-workday-start"
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Start Time (24h)
                </label>
                <input
                  id="custom-workday-start"
                  type="text"
                  placeholder="08:30"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setError(null);
                  }}
                  required
                  style={{
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-primary)',
                    color: 'var(--text-white)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.92rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label
                  htmlFor="custom-workday-end"
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  End Time (24h)
                </label>
                <input
                  id="custom-workday-end"
                  type="text"
                  placeholder="17:30 (or empty if active)"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setError(null);
                  }}
                  style={{
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-primary)',
                    color: 'var(--text-white)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.92rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Optional Custom Breaks
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="override-time-input"
                  style={{ width: '95px' }}
                  placeholder="15:00"
                  value={newBreakStart}
                  onChange={(e) => setNewBreakStart(e.target.value)}
                />
                <span className="break-sep">–</span>
                <input
                  type="text"
                  className="override-time-input"
                  style={{ width: '95px' }}
                  placeholder="15:30"
                  value={newBreakEnd}
                  onChange={(e) => setNewBreakEnd(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddBreak}
                >
                  + Add Break
                </button>
              </div>

              {breaks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.25rem' }}>
                  {breaks.map((cb, idx) => (
                    <div key={idx} className="time-pill custom-break">
                      <span className="timestamp-mono">
                        {cb.start} – {cb.end}
                      </span>
                      <button
                        type="button"
                        className="remove-break-btn"
                        onClick={() => handleRemoveBreak(idx)}
                        title="Remove break"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Work Day'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

