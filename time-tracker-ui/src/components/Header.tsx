import React from 'react';

interface HeaderProps {
  isLive: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onExportCsv: () => void;
  onOpenUpload: (mode?: 'events' | 'overrides') => void;
  activeMonthLabel: string;
}

export const Header: React.FC<HeaderProps> = ({
  isLive,
  isLoading,
  onRefresh,
  onExportCsv,
  onOpenUpload,
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
