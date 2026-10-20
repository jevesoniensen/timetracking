import React, { useState, useEffect } from 'react';

interface StartWorkDateModalProps {
  isOpen: boolean;
  defaultSuggestedDate?: string;
  onSave: (startWorkDate: string) => Promise<void>;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const StartWorkDateModal: React.FC<StartWorkDateModalProps> = ({
  isOpen,
  defaultSuggestedDate,
  onSave,
}) => {
  const [dateValue, setDateValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (defaultSuggestedDate && DATE_REGEX.test(defaultSuggestedDate)) {
        setDateValue(defaultSuggestedDate);
      } else {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        setDateValue(`${yyyy}-${mm}-01`);
      }
      setError(null);
    }
  }, [isOpen, defaultSuggestedDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = dateValue.trim();
    if (!DATE_REGEX.test(trimmed)) {
      setError('Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save start work date.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div>
              <h3>Set Your Start Work Date</h3>
              <p className="modal-subtitle">
                Configure when your time tracking and saldo calculation should begin
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Please select your <strong>Start Work Date</strong>. Days prior to this date will not be
              counted toward your monthly or general work hours saldo. Once saved to{' '}
              <code>config.properties</code>, you won&apos;t be asked again.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label
                htmlFor="start-work-date-input"
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-white)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Start Work Date (YYYY-MM-DD)
              </label>
              <input
                id="start-work-date-input"
                type="date"
                value={dateValue}
                onChange={(e) => {
                  setDateValue(e.target.value);
                  setError(null);
                }}
                required
                autoFocus
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-focus)',
                  background: 'var(--surface-primary)',
                  color: 'var(--text-white)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.95rem',
                  colorScheme: 'dark',
                }}
              />
            </div>

            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || !dateValue.trim()}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isSaving ? 'Saving...' : 'Save Start Work Date'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

