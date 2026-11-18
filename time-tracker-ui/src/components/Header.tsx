import React, { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  isLoading: boolean;
  onRefresh: () => void;
  onExportCsv: () => void;
  onOpenUpload: (mode?: 'events' | 'overrides') => void;
  onOpenVacation: () => void;
  onOpenCustomWorkDay: () => void;
  activeMonthLabel: string;
}

export const Header: React.FC<HeaderProps> = ({
  isLoading,
  onRefresh,
  onExportCsv,
  onOpenUpload,
  onOpenVacation,
  onOpenCustomWorkDay,
  activeMonthLabel,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-logo">
          <svg
            className="brand-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="brand-text">
          <h1>TimeTracker</h1>
        </div>
      </div>

      <div className="header-right">
        <button
          className="btn btn-secondary"
          onClick={onOpenCustomWorkDay}
          title="Add a custom day of work from scratch"
        >
          <svg
            className="btn-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="12" y1="14" x2="12" y2="18" />
            <line x1="10" y1="16" x2="14" y2="16" />
          </svg>
          <span>Add Work Day</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={onOpenVacation}
          title="Enter vacation by single day or period"
        >
          <svg
            className="btn-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
          <span>Vacation</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Events from Windows logs"
        >
          <svg
            className={`btn-icon ${isLoading ? 'spinning' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
        </button>

        <button
          className="btn btn-primary"
          onClick={onExportCsv}
          title={`Export ${activeMonthLabel} as CSV`}
        >
          <svg
            className="btn-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span>Export CSV</span>
        </button>

        <div className="header-menu-wrapper" ref={menuRef}>
          <button
            type="button"
            className="btn btn-secondary btn-more"
            onClick={() => setMenuOpen((prev) => !prev)}
            title="More options"
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            <svg
              className="btn-icon"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
            >
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {menuOpen && (
            <div className="header-dropdown-menu" role="menu">
              <button
                type="button"
                className="header-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenUpload('events');
                }}
              >
                <svg
                  className="btn-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span>Upload Log</span>
              </button>

              <button
                type="button"
                className="header-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenUpload('overrides');
                }}
              >
                <svg
                  className="btn-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Upload Overrides</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
