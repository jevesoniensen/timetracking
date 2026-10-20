import React from 'react';

interface HeaderProps {
  isLive: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onExportCsv: () => void;
  onOpenUpload: (mode?: 'events' | 'overrides') => void;
  onOpenVacation: () => void;
  onOpenCustomWorkDay: () => void;
  activeMonthLabel: string;
}

export const Header: React.FC<HeaderProps> = ({
  isLive,
  isLoading,
  onRefresh,
  onExportCsv,
  onOpenUpload,
  onOpenVacation,
  onOpenCustomWorkDay,
  activeMonthLabel,
}) => {
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
          <p className="subtitle">Windows Startup &amp; Shutdown Work Hours</p>
        </div>
      </div>

      <div className="header-right">
        <div className={`status-badge ${isLive ? 'live' : 'fallback'}`}>
          <span className="status-dot"></span>
          <span>{isLive ? 'Local Server Connected' : 'Sample Mode'}</span>
        </div>

        <button
          className="btn btn-accent"
          onClick={() => onOpenUpload('events')}
          title="Upload custom startup/shutdown log file"
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
          onClick={() => onOpenUpload('overrides')}
          title="Upload user overrides and custom breaks (.exception, .log, .txt)"
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
      </div>
    </header>
  );
};
