import React, { useState } from 'react';
import type { DaySummary, DayStatus, LunchConfig, CustomBreak, TrackerEvent } from '../types';
import { normalize24hTime, formatTime, isStartEvent, isEndEvent } from '../utils/eventProcessor';

interface WorkHoursTableProps {
  days: DaySummary[];
  monthLabel: string;
  lunchConfig?: LunchConfig;
  onSaveOverride?: (
    date: string,
    start: string | null,
    end: string | null,
    breaks?: CustomBreak[] | null,
    vacation?: boolean | null
  ) => void;
  onOpenVacation?: () => void;
  onOpenCustomWorkDay?: () => void;
}

const HOURS_OPTIONS = Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function time24ToSeconds(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

type SortField = 'date' | 'day' | 'start' | 'end' | 'duration' | 'saldo';
type SortDirection = 'asc' | 'desc';

export const WorkHoursTable: React.FC<WorkHoursTableProps> = ({
  days,
  monthLabel,
  lunchConfig,
  onSaveOverride,
  onOpenVacation,
  onOpenCustomWorkDay,
}) => {
  const nowDate = new Date();
  const todayStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(nowDate.getDate()).padStart(2, '0')}`;
  const [filterQuery, setFilterQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    date: string;
    field: 'start' | 'end';
  } | null>(null);
  const [editHour, setEditHour] = useState('');
  const [editMinute, setEditMinute] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'hour' | 'minute' | null>(null);
  const hourInputRef = React.useRef<HTMLInputElement | null>(null);
  const minuteInputRef = React.useRef<HTMLInputElement | null>(null);

  // State for adding a custom break
  const [addingBreakDate, setAddingBreakDate] = useState<string | null>(null);
  const [newBreakStart, setNewBreakStart] = useState('15:00');
  const [newBreakEnd, setNewBreakEnd] = useState('15:30');
  const [breakError, setBreakError] = useState<string | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span className="sort-icon inactive">↕</span>;
    }
    return (
      <span className="sort-icon active">
        {sortDirection === 'desc' ? '↓' : '↑'}
      </span>
    );
  };

  const toggleExpand = (date: string) => {
    setExpandedDay((prev) => (prev === date ? null : date));
  };

  const startEditing = (
    e: React.MouseEvent,
    day: DaySummary,
    field: 'start' | 'end'
  ) => {
    e.stopPropagation();
    const currentVal =
      field === 'start'
        ? day.startWorkTime !== '—'
          ? normalize24hTime(day.startWorkTime)
          : '08:30'
        : day.endWorkTime !== '—' && day.endWorkTime !== 'In Progress'
        ? normalize24hTime(day.endWorkTime)
        : '17:30';
    const parts = currentVal.split(':');
    const h = (parts[0] || '08').padStart(2, '0');
    const m = (parts[1] || '00').slice(0, 2).padStart(2, '0');

    setEditingCell({ date: day.date, field });
    setEditHour(h);
    setEditMinute(m);
    setEditError(null);
  };

  const cancelEditing = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCell(null);
    setEditHour('');
    setEditMinute('');
    setEditError(null);
  };

  const commitEditing = (day: DaySummary, field: 'start' | 'end') => {
    if (!onSaveOverride) {
      setEditingCell(null);
      return;
    }

    const hTrim = editHour.trim();
    const mTrim = editMinute.trim();

    if (!hTrim && !mTrim) {
      resetOverride(undefined as any, day, field);
      cancelEditing();
      return;
    }

    const hNum = parseInt(hTrim, 10);
    const mNum = parseInt(mTrim, 10);

    if (isNaN(hNum) || hNum < 0 || hNum > 23) {
      setEditError('Hour must be 00–23');
      return;
    }
    if (isNaN(mNum) || mNum < 0 || mNum > 59) {
      setEditError('Minute must be 00–59');
      return;
    }

    const formatted = `${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;

    const newStart = field === 'start' ? formatted : currentStartOverride;
    const newEnd = field === 'end' ? formatted : currentEndOverride;

    onSaveOverride(day.date, newStart, newEnd, day.customBreaks, day.isVacation);
    setEditingCell(null);
    setEditHour('');
    setEditMinute('');
    setEditError(null);
  };

  const resetOverride = (
    e: React.MouseEvent | undefined,
    day: DaySummary,
    field: 'start' | 'end' | 'both' | 'all'
  ) => {
    if (e) e.stopPropagation();
    if (!onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;

    if (field === 'all') {
      onSaveOverride(day.date, null, null, null, null);
    } else if (field === 'both') {
      onSaveOverride(day.date, null, null, day.customBreaks, day.isVacation);
    } else if (field === 'start') {
      onSaveOverride(day.date, null, currentEndOverride, day.customBreaks, day.isVacation);
    } else {
      onSaveOverride(day.date, currentStartOverride, null, day.customBreaks, day.isVacation);
    }
    setEditingCell(null);
  };

  const toggleDayVacation = (e: React.MouseEvent, day: DaySummary) => {
    e.stopPropagation();
    if (!onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;
    onSaveOverride(
      day.date,
      currentStartOverride,
      currentEndOverride,
      day.customBreaks,
      !day.isVacation
    );
  };

  const startWorkDayNow = (e: React.MouseEvent, day: DaySummary) => {
    e.stopPropagation();
    if (!onSaveOverride) return;
    const now = new Date();
    const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;
    onSaveOverride(day.date, nowHHmm, currentEndOverride, day.customBreaks, day.isVacation);
  };

  const endWorkDayNow = (e: React.MouseEvent, day: DaySummary) => {
    e.stopPropagation();
    if (!onSaveOverride) return;
    const now = new Date();
    const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    onSaveOverride(day.date, currentStartOverride, nowHHmm, day.customBreaks, day.isVacation);
  };

  const selectEventAsStart = (e: React.MouseEvent, day: DaySummary, ev: TrackerEvent) => {
    e.stopPropagation();
    if (!onSaveOverride) return;
    const time = formatTime(ev.timestamp).slice(0, 5);
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;
    onSaveOverride(day.date, time, currentEndOverride, day.customBreaks, day.isVacation);
  };

  const selectEventAsEnd = (e: React.MouseEvent, day: DaySummary, ev: TrackerEvent) => {
    e.stopPropagation();
    if (!onSaveOverride) return;
    const time = formatTime(ev.timestamp).slice(0, 5);
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    onSaveOverride(day.date, currentStartOverride, time, day.customBreaks, day.isVacation);
  };

  const renderTimeEditor = (day: DaySummary, field: 'start' | 'end') => {
    return (
      <div className="override-edit-group split-time-group" onClick={(e) => e.stopPropagation()}>
        <div className="split-time-inputs">
          <div
            className={`split-field ${activeDropdown === 'hour' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveDropdown((prev) => (prev === 'hour' ? null : 'hour'));
            }}
          >
            <input
              ref={hourInputRef}
              type="text"
              className="split-input hour-input"
              value={editHour}
              placeholder="HH"
              maxLength={2}
              autoFocus
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdown('hour');
              }}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                setEditHour(val);
                setEditError(null);
                if (val.length === 2 && minuteInputRef.current) {
                  minuteInputRef.current.focus();
                  minuteInputRef.current.select();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEditing(day, field);
                if (e.key === 'Escape') cancelEditing();
                if (e.key === ':' || e.key === 'ArrowRight') {
                  if (minuteInputRef.current) {
                    e.preventDefault();
                    minuteInputRef.current.focus();
                    minuteInputRef.current.select();
                  }
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const cur = parseInt(editHour || '1', 10);
                  const next = cur >= 23 ? 1 : cur + 1;
                  setEditHour(String(next).padStart(2, '0'));
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const cur = parseInt(editHour || '1', 10);
                  const prev = cur <= 1 ? 23 : cur - 1;
                  setEditHour(String(prev).padStart(2, '0'));
                }
              }}
            />
            <span className="dropdown-arrow">▾</span>
          </div>

          <span className="split-time-sep">:</span>

          <div
            className={`split-field ${activeDropdown === 'minute' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveDropdown((prev) => (prev === 'minute' ? null : 'minute'));
            }}
          >
            <input
              ref={minuteInputRef}
              type="text"
              className="split-input minute-input"
              value={editMinute}
              placeholder="mm"
              maxLength={2}
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdown('minute');
              }}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                setEditMinute(val);
                setEditError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEditing(day, field);
                if (e.key === 'Escape') cancelEditing();
                if (e.key === 'Backspace' && !editMinute && hourInputRef.current) {
                  hourInputRef.current.focus();
                }
                if (e.key === 'ArrowLeft' && hourInputRef.current) {
                  hourInputRef.current.focus();
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const next = (parseInt(editMinute || '0', 10) + 1) % 60;
                  setEditMinute(String(next).padStart(2, '0'));
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const prev = (parseInt(editMinute || '0', 10) + 59) % 60;
                  setEditMinute(String(prev).padStart(2, '0'));
                }
              }}
            />
            <span className="dropdown-arrow">▾</span>
          </div>
        </div>

        <button
          type="button"
          className="override-action-btn save"
          onClick={() => commitEditing(day, field)}
          title="Save override (HH:mm)"
        >
          ✓
        </button>
        <button
          type="button"
          className="override-action-btn cancel"
          onClick={cancelEditing}
          title="Cancel"
        >
          ✕
        </button>
        {((field === 'start' && day.isStartOverridden) || (field === 'end' && day.isEndOverridden)) && (
          <button
            type="button"
            className="override-action-btn reset"
            onClick={(e) => resetOverride(e, day, field)}
            title="Reset to default event"
          >
            ↺
          </button>
        )}
        {editError && <span className="override-error">{editError}</span>}

        {activeDropdown === 'hour' && (
          <div className="time-picker-popover hour-popover">
            <div className="popover-header">
              <span>Select Hour (01–23)</span>
              <button
                type="button"
                className="popover-close-btn"
                onClick={() => setActiveDropdown(null)}
              >
                ✕
              </button>
            </div>
            <div className="popover-grid hours-grid">
              {HOURS_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`popover-chip ${editHour === h ? 'selected' : ''}`}
                  onClick={() => {
                    setEditHour(h);
                    setActiveDropdown('minute');
                    if (minuteInputRef.current) {
                      minuteInputRef.current.focus();
                      minuteInputRef.current.select();
                    }
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeDropdown === 'minute' && (
          <div className="time-picker-popover minute-popover">
            <div className="popover-header">
              <span>Select Minute (00–59)</span>
              <button
                type="button"
                className="popover-close-btn"
                onClick={() => setActiveDropdown(null)}
              >
                ✕
              </button>
            </div>
            <div className="popover-grid minutes-grid">
              {MINUTES_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`popover-chip ${editMinute === m ? 'selected' : ''}`}
                  onClick={() => {
                    setEditMinute(m);
                    setActiveDropdown(null);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const openAddBreak = (e: React.MouseEvent, date: string) => {
    e.stopPropagation();
    setAddingBreakDate(date);
    setNewBreakStart('15:00');
    setNewBreakEnd('15:30');
    setBreakError(null);
  };

  const cancelAddBreak = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAddingBreakDate(null);
    setBreakError(null);
  };

  const commitAddBreak = (day: DaySummary) => {
    if (!onSaveOverride) {
      setAddingBreakDate(null);
      return;
    }

    const s = newBreakStart.trim();
    const e = newBreakEnd.trim();

    if (!TIME_24H_REGEX.test(s) || !TIME_24H_REGEX.test(e)) {
      setBreakError('Use 24h format HH:mm (e.g. 15:00 to 15:30)');
      return;
    }
    if (time24ToSeconds(e) <= time24ToSeconds(s)) {
      setBreakError('Break end must be after break start');
      return;
    }

    const currentStartOverride = day.isStartOverridden ? day.startWorkTime : null;
    const currentEndOverride = day.isEndOverridden ? day.endWorkTime : null;
    const nextBreaks: CustomBreak[] = [...(day.customBreaks || []), { start: s, end: e }];

    onSaveOverride(day.date, currentStartOverride, currentEndOverride, nextBreaks, day.isVacation);
    setAddingBreakDate(null);
    setBreakError(null);
  };

  const removeCustomBreak = (e: React.MouseEvent, day: DaySummary, index: number) => {
    e.stopPropagation();
    if (!onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? day.startWorkTime : null;
    const currentEndOverride = day.isEndOverridden ? day.endWorkTime : null;
    const nextBreaks = day.customBreaks.filter((_, idx) => idx !== index);
    onSaveOverride(day.date, currentStartOverride, currentEndOverride, nextBreaks, day.isVacation);
  };

  const vacationDaysInMonth = days.filter((d) => d.isVacation).length;

  const filteredDays = days
    .filter((d) => {
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      return (
        d.date.includes(q) ||
        d.dayOfWeekFull.toLowerCase().includes(q) ||
        d.formattedDate.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q) ||
        (d.isVacation && 'vacation'.includes(q))
      );
    })
    .slice()
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'date':
          return a.date.localeCompare(b.date) * dir;
        case 'day': {
          const cmp = a.dayOfWeekFull.localeCompare(b.dayOfWeekFull);
          return cmp !== 0 ? cmp * dir : b.date.localeCompare(a.date);
        }
        case 'start': {
          const aEmpty = a.startWorkTime === '—';
          const bEmpty = b.startWorkTime === '—';
          if (aEmpty && bEmpty) return b.date.localeCompare(a.date);
          if (aEmpty) return 1;
          if (bEmpty) return -1;
          return a.startWorkTime.localeCompare(b.startWorkTime) * dir;
        }
        case 'end': {
          const aEmpty = a.endWorkTime === '—';
          const bEmpty = b.endWorkTime === '—';
          if (aEmpty && bEmpty) return b.date.localeCompare(a.date);
          if (aEmpty) return 1;
          if (bEmpty) return -1;
          return a.endWorkTime.localeCompare(b.endWorkTime) * dir;
        }
        case 'duration': {
          const diff = a.durationSeconds - b.durationSeconds;
          return diff !== 0 ? diff * dir : b.date.localeCompare(a.date);
        }
        case 'saldo': {
          const diff = a.workBalanceSeconds - b.workBalanceSeconds;
          return diff !== 0 ? diff * dir : b.date.localeCompare(a.date);
        }
      }
    });

  const getStatusBadge = (status: DayStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="badge badge-success">
            <span className="badge-dot"></span> Completed
          </span>
        );
      case 'in_progress':
        return (
          <span className="badge badge-warning pulse">
            <span className="badge-dot pulse-dot"></span> In Progress
          </span>
        );
      case 'no_shutdown':
        return (
          <span className="badge badge-info">
            <span className="badge-dot"></span> No Shutdown
          </span>
        );
      case 'no_startup':
        return (
          <span className="badge badge-muted">
            <span className="badge-dot"></span> Off
          </span>
        );
      case 'vacation':
        return (
          <span className="badge badge-vacation">
            <span className="badge-dot"></span> Vacation
          </span>
        );
    }
  };

  return (
    <div className="table-card">
      <div className="table-header-controls">
        <div className="table-title-group">
          <h2>Daily Work Log — {monthLabel}</h2>
          <span className="table-count-chip">
            Showing {filteredDays.length} {filteredDays.length === 1 ? 'entry' : 'entries'}
          </span>
          {lunchConfig && (
            <>
              <span className="table-count-chip" title="Default lunch interval deducted from work hours">
                Lunch: {lunchConfig.defaultLunchStart} – {lunchConfig.defaultLunchEnd}
              </span>
              <span className="table-count-chip" title="Configured daily work expectation">
                Target: {lunchConfig.defaultWorkHoursPerDay || 8}h/day
              </span>
              {lunchConfig.startWorkDate && (
                <span className="table-count-chip" title="Configured start work date in config.properties">
                  Start Date: {lunchConfig.startWorkDate}
                </span>
              )}
              {vacationDaysInMonth > 0 && (
                <span
                  className="table-count-chip vacation-count-chip"
                  title="Vacation days marked in overrides for this month"
                >
                  Vacation: {vacationDaysInMonth} {vacationDaysInMonth === 1 ? 'day' : 'days'}
                </span>
              )}
            </>
          )}
        </div>

        <div className="table-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          {onOpenCustomWorkDay && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenCustomWorkDay}
              title="Add a custom work day from scratch"
            >
              + Add Work Day
            </button>
          )}
          {onOpenVacation && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenVacation}
              title="Add or manage vacation by single day or period"
            >
              + Vacation
            </button>
          )}
          <div className="search-box">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Filter by date, weekday..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="search-input"
            />
            {filterQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setFilterQuery('')}
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="work-table">
          <thead>
            <tr>
              <th
                scope="col"
                className="sortable-th"
                style={{ width: '15%' }}
                onClick={() => toggleSort('date')}
                title="Sort by date"
              >
                <div className="th-content">
                  Date {renderSortIcon('date')}
                </div>
              </th>
              <th
                scope="col"
                className="sortable-th"
                style={{ width: '9%' }}
                onClick={() => toggleSort('day')}
                title="Sort by weekday"
              >
                <div className="th-content">
                  Day {renderSortIcon('day')}
                </div>
              </th>
              <th
                scope="col"
                className="sortable-th"
                style={{ width: '17%' }}
                onClick={() => toggleSort('start')}
                title="Sort by start time"
              >
                <div className="th-content">
                  <span className="th-indicator start"></span>
                  Start {renderSortIcon('start')}
                </div>
              </th>
              <th scope="col" style={{ width: '17%' }}>
                <div className="th-content">
                  <span className="th-indicator lunch"></span>
                  Lunch Break
                </div>
              </th>
              <th
                scope="col"
                className="sortable-th"
                style={{ width: '17%' }}
                onClick={() => toggleSort('end')}
                title="Sort by end time"
              >
                <div className="th-content">
                  <span className="th-indicator end"></span>
                  End {renderSortIcon('end')}
                </div>
              </th>
              <th
                scope="col"
                className="sortable-th"
                style={{ width: '11%' }}
                onClick={() => toggleSort('duration')}
                title="Sort by worked duration"
              >
                <div className="th-content">
                  Duration {renderSortIcon('duration')}
                </div>
              </th>
              <th
                scope="col"
                className="sortable-th"
                style={{ width: '10%' }}
                onClick={() => toggleSort('saldo')}
                title="Sort by daily saldo (worked vs. expected)"
              >
                <div className="th-content">
                  Saldo {renderSortIcon('saldo')}
                </div>
              </th>
              <th scope="col" style={{ width: '4%', textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state-cell">
                  <div className="empty-state">
                    <svg
                      className="empty-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p>No system work logs found for this period</p>
                    {filterQuery && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFilterQuery('')}
                      >
                        Clear search filter
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredDays.map((day) => {
                const isExpanded = expandedDay === day.date;
                const targetHours = lunchConfig?.defaultWorkHoursPerDay || 8;
                const targetSeconds = targetHours * 3600;
                const percentage = Math.min(100, Math.round((day.durationSeconds / targetSeconds) * 100));
                const isEditingStart =
                  editingCell?.date === day.date && editingCell?.field === 'start';
                const isEditingEnd =
                  editingCell?.date === day.date && editingCell?.field === 'end';
                const hasStart = day.firstStartup !== null || day.isStartOverridden;
                const hasEnd = day.lastShutdown !== null || day.isEndOverridden;

                return (
                  <React.Fragment key={day.date}>
                    <tr
                      className={`table-row ${day.isWeekend ? 'weekend-row' : ''} ${
                        day.isVacation ? 'vacation-row' : ''
                      } ${isExpanded ? 'row-expanded' : ''}`}
                      onClick={() => toggleExpand(day.date)}
                    >
                      <td className="cell-date">
                        <div className="date-chip">
                          <span className="date-primary">{day.formattedDate}</span>
                          <span className="date-raw">{day.date}</span>
                        </div>
                      </td>
                      <td className="cell-day" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span className={`weekday-pill ${day.isWeekend ? 'weekend' : 'workday'}`}>
                            {day.dayOfWeek}
                          </span>
                          {day.isVacation ? (
                            <span
                              className="vacation-pill"
                              title="Marked as Vacation in overrides — click ✕ to remove"
                            >
                              <span>Vacation</span>
                              <button
                                type="button"
                                className="remove-break-btn"
                                onClick={(e) => toggleDayVacation(e, day)}
                                title="Unmark vacation"
                              >
                                ✕
                              </button>
                            </span>
                          ) : (
                            !day.isWeekend && (
                              <button
                                type="button"
                                className="mark-vacation-row-btn"
                                onClick={(e) => toggleDayVacation(e, day)}
                                title="Mark this day as Vacation in overrides"
                              >
                                + Vacation
                              </button>
                            )
                          )}
                        </div>
                      </td>
                      <td className="cell-time" onClick={(e) => e.stopPropagation()}>
                        {isEditingStart ? (
                          renderTimeEditor(day, 'start')
                        ) : (
                          <div className="time-cell-wrapper">
                            {hasStart ? (
                              <div
                                className={`time-pill start editable ${day.isStartOverridden ? 'overridden' : ''}`}
                                onClick={(e) => startEditing(e, day, 'start')}
                                title={
                                  day.isStartOverridden
                                    ? 'User override (24h) — click to edit'
                                    : 'Click to override start time (24h)'
                                }
                              >
                                <svg className="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="4" />
                                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                                </svg>
                                <span className="timestamp-mono">{day.startWorkTime}</span>
                                {day.isStartOverridden && (
                                  <span className="override-dot" title="User overridden"></span>
                                )}
                              </div>
                            ) : (
                              <button
                                className="add-override-btn"
                                onClick={(e) => startEditing(e, day, 'start')}
                                title="Set manual start time (24h)"
                              >
                                — <span className="edit-hint">Edit</span>
                              </button>
                            )}
                            {day.date === todayStr && !day.isStartOverridden && (
                              <button
                                type="button"
                                className="quick-clock-btn start-now-btn"
                                onClick={(e) => startWorkDayNow(e, day)}
                                title="Start workday now (override start with current time)"
                                aria-label="Start workday now"
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                  <polygon points="6 4 20 12 6 20 6 4" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="cell-time" onClick={(e) => e.stopPropagation()}>
                        {hasStart || day.customBreaks.length > 0 || addingBreakDate === day.date ? (
                          <div className="breaks-cell-container">
                            <div className="breaks-pills-row">
                              {hasStart && (
                                <div
                                  className={`time-pill lunch ${day.lunchDeductedSeconds === 0 ? 'not-deducted' : ''}`}
                                  title={
                                    day.lunchDeductedSeconds > 0
                                      ? `Default lunch: deducted ${day.lunchDeductedFormatted} from worked hours`
                                      : 'Default lunch: no overlap with worked hours (0m deducted)'
                                  }
                                >
                                  <svg className="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                                    <line x1="6" y1="1" x2="6" y2="4" />
                                    <line x1="10" y1="1" x2="10" y2="4" />
                                    <line x1="14" y1="1" x2="14" y2="4" />
                                  </svg>
                                  <span className="timestamp-mono">{day.lunchWindow}</span>
                                </div>
                              )}

                              {day.customBreaks.map((cb, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="time-pill custom-break"
                                  title={`Custom break (${cb.start} – ${cb.end})`}
                                >
                                  <span className="timestamp-mono">
                                    {cb.start} – {cb.end}
                                  </span>
                                  <button
                                    type="button"
                                    className="remove-break-btn"
                                    onClick={(e) => removeCustomBreak(e, day, bIdx)}
                                    title="Remove custom break"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}

                              {addingBreakDate !== day.date && (
                                <button
                                  type="button"
                                  className="add-break-pill-btn"
                                  onClick={(e) => openAddBreak(e, day.date)}
                                  title="Add custom break (24h)"
                                >
                                  + Break
                                </button>
                              )}
                            </div>

                            {addingBreakDate === day.date && (
                              <div className="custom-break-editor">
                                <input
                                  type="text"
                                  className="override-time-input break-input"
                                  value={newBreakStart}
                                  placeholder="HH:mm"
                                  autoFocus
                                  onChange={(e) => {
                                    setNewBreakStart(e.target.value);
                                    setBreakError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitAddBreak(day);
                                    if (e.key === 'Escape') cancelAddBreak();
                                  }}
                                />
                                <span className="break-sep">–</span>
                                <input
                                  type="text"
                                  className="override-time-input break-input"
                                  value={newBreakEnd}
                                  placeholder="HH:mm"
                                  onChange={(e) => {
                                    setNewBreakEnd(e.target.value);
                                    setBreakError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitAddBreak(day);
                                    if (e.key === 'Escape') cancelAddBreak();
                                  }}
                                />
                                <button
                                  type="button"
                                  className="override-action-btn save"
                                  onClick={() => commitAddBreak(day)}
                                  title="Add custom break"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="override-action-btn cancel"
                                  onClick={cancelAddBreak}
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                                {breakError && <span className="override-error">{breakError}</span>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="add-override-btn"
                            onClick={(e) => openAddBreak(e, day.date)}
                            title="Add custom break (24h)"
                          >
                            — <span className="edit-hint">+ Break</span>
                          </button>
                        )}
                      </td>
                      <td className="cell-time" onClick={(e) => e.stopPropagation()}>
                        {isEditingEnd ? (
                          renderTimeEditor(day, 'end')
                        ) : (
                          <div className="time-cell-wrapper">
                            {hasEnd ? (
                              <div
                                className={`time-pill end editable ${day.isEndOverridden ? 'overridden' : ''}`}
                                onClick={(e) => startEditing(e, day, 'end')}
                                title={
                                  day.isEndOverridden
                                    ? 'User override (24h) — click to edit'
                                    : 'Click to override end time (24h)'
                                }
                              >
                                <svg className="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                                  <line x1="12" y1="2" x2="12" y2="12" />
                                </svg>
                                <span className="timestamp-mono">{day.endWorkTime}</span>
                                {day.isEndOverridden && (
                                  <span className="override-dot" title="User overridden"></span>
                                )}
                              </div>
                            ) : day.status === 'in_progress' ? (
                              <div
                                className="time-pill in-progress editable"
                                onClick={(e) => startEditing(e, day, 'end')}
                                title="Click to set manual end time (24h)"
                              >
                                <span className="pulsing-circle"></span>
                                <span className="active-tag">Active Today</span>
                              </div>
                            ) : (
                              <button
                                className="add-override-btn"
                                onClick={(e) => startEditing(e, day, 'end')}
                                title="Set manual end time (24h)"
                              >
                                — <span className="edit-hint">Edit</span>
                              </button>
                            )}
                            {day.date === todayStr && !day.isEndOverridden && (
                              <button
                                type="button"
                                className="quick-clock-btn end-now-btn"
                                onClick={(e) => endWorkDayNow(e, day)}
                                title="End workday now (override end with current time)"
                                aria-label="End workday now"
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                  <rect x="6" y="6" width="12" height="12" rx="2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="cell-duration">
                        <div className="duration-container">
                          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <span className="duration-text">{day.durationFormatted}</span>
                            {day.lunchDeductedSeconds > 0 && (
                              <span
                                className="date-raw"
                                title={`Lunch deducted: ${day.lunchDeductedFormatted}`}
                              >
                                (-{day.lunchDeductedFormatted} lunch)
                              </span>
                            )}
                            {day.customBreaksDeductedSeconds > 0 && (
                              <span
                                className="date-raw"
                                title={`Custom breaks deducted: ${day.customBreaksDeductedFormatted}`}
                              >
                                (-{day.customBreaksDeductedFormatted} breaks)
                              </span>
                            )}
                          </div>
                          {day.durationSeconds > 0 && (
                            <div className="progress-bar-bg" title={`${percentage}% of ${targetHours}h standard workday`}>
                              <div
                                className="progress-bar-fill"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="cell-duration">
                        <span
                          className="timestamp-mono"
                          style={{
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px',
                            color:
                              day.workBalanceSeconds > 0
                                ? '#34d399'
                                : day.workBalanceSeconds < 0
                                ? '#f87171'
                                : '#94a3b8',
                            background:
                              day.workBalanceSeconds > 0
                                ? 'rgba(16, 185, 129, 0.12)'
                                : day.workBalanceSeconds < 0
                                ? 'rgba(239, 68, 68, 0.12)'
                                : 'rgba(148, 163, 184, 0.1)',
                            border: `1px solid ${
                              day.workBalanceSeconds > 0
                                ? 'rgba(16, 185, 129, 0.3)'
                                : day.workBalanceSeconds < 0
                                ? 'rgba(239, 68, 68, 0.3)'
                                : 'rgba(148, 163, 184, 0.2)'
                            }`,
                          }}
                          title={`Daily Saldo: ${day.workBalanceFormatted} (${day.durationFormatted} worked vs. ${
                            day.isWeekend || day.isVacation ? '0h' : `${targetHours}h`
                          } expected)`}
                        >
                          {day.workBalanceFormatted}
                        </span>
                      </td>
                      <td className="cell-expand" style={{ textAlign: 'right' }}>
                        <button
                          className={`expand-plus-btn ${isExpanded ? 'expanded' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(day.date);
                          }}
                          title={isExpanded ? 'Hide details' : 'Show status, sessions, and event details'}
                          aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="expansion-row">
                        <td colSpan={8}>
                          <div className="day-breakdown-panel">
                            <div className="breakdown-details-bar">
                              <div className="breakdown-detail-item">
                                <span className="breakdown-detail-label">Status</span>
                                {getStatusBadge(day.status)}
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                                  onClick={(e) => toggleDayVacation(e, day)}
                                >
                                  {day.isVacation ? 'Unmark Vacation' : 'Mark as Vacation'}
                                </button>
                              </div>
                              <div className="breakdown-detail-item">
                                <span className="breakdown-detail-label">Daily Saldo</span>
                                <span
                                  className="breakdown-detail-value"
                                  style={{
                                    color:
                                      day.workBalanceSeconds > 0
                                        ? '#34d399'
                                        : day.workBalanceSeconds < 0
                                        ? '#f87171'
                                        : '#94a3b8',
                                    fontWeight: 700,
                                  }}
                                >
                                  {day.workBalanceFormatted} (vs.{' '}
                                  {day.isWeekend
                                    ? '0h weekend'
                                    : day.isVacation
                                    ? '0h vacation'
                                    : `${targetHours}h`}{' '}
                                  expected)
                                </span>
                              </div>
                              <div className="breakdown-detail-item">
                                <span className="breakdown-detail-label">Sessions</span>
                                <span className="breakdown-detail-value">
                                  {day.sessionCount} {day.sessionCount === 1 ? 'startup' : 'startups'} ({day.allEvents.length} {day.allEvents.length === 1 ? 'event' : 'events'} total)
                                </span>
                              </div>
                              {day.lunchDeductedSeconds > 0 && (
                                <div className="breakdown-detail-item">
                                  <span className="breakdown-detail-label">Lunch Deducted</span>
                                  <span className="breakdown-detail-value">
                                    {day.lunchDeductedFormatted} ({day.lunchWindow})
                                  </span>
                                </div>
                              )}
                              {day.customBreaks.length > 0 && (
                                <div className="breakdown-detail-item">
                                  <span className="breakdown-detail-label">Custom Breaks</span>
                                  <span className="breakdown-detail-value">
                                    {day.customBreaks.map((b) => `${b.start}–${b.end}`).join(', ')}
                                    {day.customBreaksDeductedSeconds > 0
                                      ? ` (-${day.customBreaksDeductedFormatted})`
                                      : ''}
                                  </span>
                                </div>
                              )}
                              {(day.isStartOverridden ||
                                day.isEndOverridden ||
                                day.customBreaks.length > 0 ||
                                day.isVacation) && (
                                <div className="breakdown-detail-item">
                                  <span className="breakdown-detail-label">User Overrides</span>
                                  <span className="breakdown-detail-value">
                                    {[
                                      day.isVacation ? 'Vacation' : '',
                                      day.isStartOverridden ? `Start: ${day.startWorkTime}` : '',
                                      day.isEndOverridden ? `End: ${day.endWorkTime}` : '',
                                      day.customBreaks.length > 0
                                        ? `${day.customBreaks.length} custom break(s)`
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                                    onClick={(e) => resetOverride(e, day, 'all')}
                                  >
                                    Reset All Overrides
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="breakdown-header">
                              <h4>System Event Timeline for {day.formattedDate}</h4>
                              <span className="breakdown-hint">All recorded Windows start &amp; end events</span>
                            </div>
                            {day.allEvents.length === 0 ? (
                              <p className="breakdown-hint" style={{ paddingLeft: '0.5rem' }}>
                                No startup, logon, sleep, or shutdown events recorded on this day.
                              </p>
                            ) : (
                              <div className="timeline-list">
                                {day.allEvents.map((ev, idx) => {
                                  const isStart = isStartEvent(ev);
                                  const isEnd = isEndEvent(ev);
                                  const isActiveStart = Boolean(
                                    day.effectiveStartTimestamp && ev.timestamp === day.effectiveStartTimestamp
                                  );
                                  const isActiveEnd = Boolean(
                                    day.effectiveEndTimestamp && ev.timestamp === day.effectiveEndTimestamp
                                  );
                                  const isDefaultStart = Boolean(
                                    day.firstStartup && ev.timestamp === day.firstStartup.timestamp
                                  );
                                  const isDefaultEnd = Boolean(
                                    day.lastShutdown && ev.timestamp === day.lastShutdown.timestamp
                                  );

                                  return (
                                    <div
                                      key={idx}
                                      className={`timeline-item ${isStart ? 'startup' : 'shutdown'} ${
                                        isActiveStart || isActiveEnd ? 'active-event' : ''
                                      }`}
                                    >
                                      <div className="timeline-marker">
                                        <span className="timeline-dot"></span>
                                      </div>
                                      <div className="timeline-body">
                                        <div className="timeline-badge-title">
                                          <span className={`event-name-tag ${isStart ? 'startup' : 'shutdown'}`}>
                                            {ev.name.toUpperCase()}
                                          </span>
                                          <span className={`event-type-badge ${isStart ? 'start' : 'end'}`}>
                                            {isStart ? 'START' : 'END'}
                                          </span>
                                          {isActiveStart && (
                                            <span className="first-last-tag active-work-tag start">
                                              {day.isStartOverridden ? 'Selected as Start of Work' : 'Default Start of Work'}
                                            </span>
                                          )}
                                          {isActiveEnd && (
                                            <span className="first-last-tag active-work-tag end">
                                              {day.isEndOverridden ? 'Selected as End of Work' : 'Default End of Work'}
                                            </span>
                                          )}
                                          {isDefaultStart && !isActiveStart && (
                                            <span className="first-last-tag default-hint">
                                              Default Start
                                            </span>
                                          )}
                                          {isDefaultEnd && !isActiveEnd && (
                                            <span className="first-last-tag default-hint">
                                              Default End
                                            </span>
                                          )}
                                        </div>
                                        <div className="timeline-actions-group">
                                          <span className="timeline-time">{ev.timestamp}</span>
                                          {onSaveOverride && (
                                            <div className="timeline-buttons">
                                              {/* START events can ONLY be selected as Start of Work */}
                                              {isStart && (
                                                !isActiveStart ? (
                                                  <button
                                                    type="button"
                                                    className="timeline-btn select-start"
                                                    onClick={(e) => selectEventAsStart(e, day, ev)}
                                                    title={`Set ${ev.name} at ${formatTime(ev.timestamp)} as Start of Work`}
                                                  >
                                                    Set as Start
                                                  </button>
                                                ) : day.isStartOverridden ? (
                                                  <button
                                                    type="button"
                                                    className="timeline-btn reset"
                                                    onClick={(e) => resetOverride(e, day, 'start')}
                                                    title="Reset Start of Work to default event"
                                                  >
                                                    Reset Start
                                                  </button>
                                                ) : null
                                              )}

                                              {/* END events can ONLY be selected as End of Work */}
                                              {isEnd && (
                                                !isActiveEnd ? (
                                                  <button
                                                    type="button"
                                                    className="timeline-btn select-end"
                                                    onClick={(e) => selectEventAsEnd(e, day, ev)}
                                                    title={`Set ${ev.name} at ${formatTime(ev.timestamp)} as End of Work`}
                                                  >
                                                    Set as End
                                                  </button>
                                                ) : day.isEndOverridden ? (
                                                  <button
                                                    type="button"
                                                    className="timeline-btn reset"
                                                    onClick={(e) => resetOverride(e, day, 'end')}
                                                    title="Reset End of Work to default event"
                                                  >
                                                    Reset End
                                                  </button>
                                                ) : null
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

