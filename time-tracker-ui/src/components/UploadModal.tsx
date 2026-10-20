import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  parsePipeDelimitedEvents,
  parsePipeDelimitedOverrides,
} from '../utils/eventProcessor';

export type UploadMode = 'events' | 'overrides';

interface UploadModalProps {
  isOpen: boolean;
  initialMode?: UploadMode;
  onClose: () => void;
  onUpload: (content: string, clearAll: boolean, mode: UploadMode) => Promise<void>;
  isLoading: boolean;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  initialMode = 'events',
  onClose,
  onUpload,
  isLoading,
}) => {
  const [mode, setMode] = useState<UploadMode>(initialMode);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [clearAll, setClearAll] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);

  const parsedPreview = useMemo(() => {
    if (!fileContent.trim()) return null;
    if (mode === 'overrides') {
      const { overridesByDate, months, lineCount } = parsePipeDelimitedOverrides(fileContent);
      const dayCount = Object.keys(overridesByDate).length;
      return {
        months,
        totalCount: lineCount,
        dayCount,
        kind: 'overrides' as const,
      };
    } else {
      const map = parsePipeDelimitedEvents(fileContent);
      const months = Object.keys(map);
      const totalCount = Object.values(map).reduce((acc, list) => acc + list.length, 0);
      return {
        months,
        totalCount,
        dayCount: 0,
        kind: 'events' as const,
      };
    }
  }, [fileContent, mode]);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setFileContent(text);
        // Auto-detect if user dropped an override file in events mode or vice versa
        const overrideCheck = parsePipeDelimitedOverrides(text);
        const eventCheck = parsePipeDelimitedEvents(text);
        const eventCount = Object.values(eventCheck).reduce((a, l) => a + l.length, 0);
        if (overrideCheck.lineCount > 0 && eventCount === 0) {
          setMode('overrides');
        } else if (eventCount > 0 && overrideCheck.lineCount === 0) {
          setMode('events');
        }
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!fileContent.trim()) {
      setError('Please choose a file first.');
      return;
    }
    if (!parsedPreview || parsedPreview.totalCount === 0) {
      setError(
        mode === 'overrides'
          ? 'No valid overrides found. Expected OVERRIDE_IN|date|time, OVERRIDE_OUT|date|time, or date|start|end.'
          : 'No valid events found. Expected format: STARTUP|YYYY-MM-DD HH:mm:ss'
      );
      return;
    }

    try {
      await onUpload(fileContent, clearAll, mode);
      onClose();
      setFileContent('');
      setFileName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            <div>
              <h3>{mode === 'overrides' ? 'Import Overrides & Breaks' : 'Import Custom Log File'}</h3>
              <p className="modal-subtitle">
                {mode === 'overrides'
                  ? 'Upload start/end overrides and custom breaks (.exception, .log, .txt)'
                  : 'Upload your startup/shutdown logs to overwrite existing events'}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'events' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                setMode('events');
                setError(null);
              }}
            >
              Startup / Shutdown Events
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'overrides' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                setMode('overrides');
                setError(null);
              }}
            >
              User Overrides &amp; Breaks
            </button>
          </div>

          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".exception,.log,.txt,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            <svg className="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9m-4-4 4-4 4 4" />
            </svg>

            {fileName ? (
              <div className="file-selected-info">
                <span className="file-name">{fileName}</span>
                <span className="file-change-hint">Click or drop another file to replace</span>
              </div>
            ) : (
              <div className="drop-hint">
                <p><strong>Click to choose a file</strong> or drag and drop here</p>
                <span>Supports .exception, .log, .txt format files</span>
              </div>
            )}
          </div>

          <div className="format-info-box">
            <span className="format-title">Expected File Format:</span>
            {mode === 'overrides' ? (
              <pre className="format-code">
{`2026-09-03|17:00:00|18:20:00
OVERRIDE_IN|2026-09-09|07:49:05
OVERRIDE_OUT|2026-09-09|17:18:00
VACATION|2026-09-15
VACATION|2026-09-21|2026-09-25`}
              </pre>
            ) : (
              <pre className="format-code">
{`STARTUP|2026-07-07 17:20:04
SHUTDOWN|2026-07-07 17:27:35
STARTUP|2026-07-08 06:45:43
SHUTDOWN|2026-07-08 18:55:02`}
              </pre>
            )}
          </div>

          {parsedPreview && parsedPreview.totalCount > 0 && (
            <div className="preview-card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="preview-icon">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div>
                {parsedPreview.kind === 'overrides' ? (
                  <strong>
                    Ready to import {parsedPreview.totalCount} override rules across {parsedPreview.dayCount} day(s)
                  </strong>
                ) : (
                  <strong>Ready to import {parsedPreview.totalCount} events</strong>
                )}
                <p>Detected months: {parsedPreview.months.join(', ')}</p>
              </div>
            </div>
          )}

          <div className="option-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={clearAll}
                onChange={(e) => setClearAll(e.target.checked)}
              />
              <span>
                {mode === 'overrides'
                  ? 'Clear all existing override files before importing'
                  : 'Replace entire database (wipe all other months)'}
              </span>
            </label>
            <span className="option-hint">
              {clearAll
                ? 'All existing months will be deleted and replaced with this file'
                : 'Only matching months will be overwritten; other months remain safe'}
            </span>
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isLoading || !fileContent.trim()}
          >
            {isLoading ? 'Importing...' : 'Import & Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
