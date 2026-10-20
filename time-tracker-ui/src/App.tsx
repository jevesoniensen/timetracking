import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { MonthSelector } from './components/MonthSelector';
import { MetricsCards } from './components/MetricsCards';
import { WorkHoursTable } from './components/WorkHoursTable';
import { UploadModal } from './components/UploadModal';
import { StartWorkDateModal } from './components/StartWorkDateModal';
import { VacationModal } from './components/VacationModal';
import { CustomWorkDayModal } from './components/CustomWorkDayModal';
import type { UploadMode } from './components/UploadModal';
import {
  processEventsByMonth,
  calculateOverallSaldo,
  parsePipeDelimitedEvents,
  parsePipeDelimitedOverrides,
  expandVacationDateRange,
  DEFAULT_LUNCH_CONFIG,
} from './utils/eventProcessor';
import { fallbackEventsByMonth } from './data/fallbackData';
import type { TrackerEvent, EventsApiResponse, LunchConfig, DayOverride, CustomBreak } from './types';
import './index.css';

function App() {
  const [eventsByMonth, setEventsByMonth] = useState<Record<string, TrackerEvent[]>>({});
  const [lunchConfig, setLunchConfig] = useState<LunchConfig>(DEFAULT_LUNCH_CONFIG);
  const [userOverrides, setUserOverrides] = useState<Record<string, DayOverride>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>('events');
  const [isStartDateModalOpen, setIsStartDateModalOpen] = useState<boolean>(false);
  const [isVacationModalOpen, setIsVacationModalOpen] = useState<boolean>(false);
  const [isCustomWorkDayModalOpen, setIsCustomWorkDayModalOpen] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((current) => (current === msg ? null : current));
    }, 4500);
  };

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/events');
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data: EventsApiResponse = await response.json();
      if (data && data.lunchConfig) {
        setLunchConfig(data.lunchConfig);
        if (!data.lunchConfig.startWorkDate || !data.lunchConfig.startWorkDate.trim()) {
          setIsStartDateModalOpen(true);
        }
      } else {
        setIsStartDateModalOpen(true);
      }
      if (data && data.userOverrides) {
        setUserOverrides(data.userOverrides);
      }
      if (
        data &&
        ((data.eventsByMonth && Object.keys(data.eventsByMonth).length > 0) ||
          (data.userOverrides && Object.keys(data.userOverrides).length > 0) ||
          Boolean(data.lunchConfig?.startWorkDate?.trim()))
      ) {
        setEventsByMonth(data.eventsByMonth || {});
        setIsLive(true);
      } else {
        setEventsByMonth(fallbackEventsByMonth);
        setIsLive(false);
      }
    } catch {
      const savedLocalStartDate = localStorage.getItem('time_tracker_start_work_date') || '';
      setLunchConfig((prev) => ({ ...prev, startWorkDate: savedLocalStartDate }));
      if (!savedLocalStartDate) {
        setIsStartDateModalOpen(true);
      }
      setEventsByMonth(fallbackEventsByMonth);
      setIsLive(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSaveStartWorkDate = useCallback(async (startWorkDate: string) => {
    const cleanDate = startWorkDate.trim();
    localStorage.setItem('time_tracker_start_work_date', cleanDate);
    setLunchConfig((prev) => ({ ...prev, startWorkDate: cleanDate }));

    try {
      const response = await fetch('/api/config/start-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startWorkDate: cleanDate }),
      });
      if (response.ok) {
        const updatedConfig: LunchConfig = await response.json();
        setLunchConfig(updatedConfig);
      }
    } catch {
      // Saved locally in state and localStorage if offline
    }

    setIsStartDateModalOpen(false);
    showToast(`Saved Start Work Date (${cleanDate}) to config.properties`);
  }, []);

  const handleSaveOverride = useCallback(
    async (
      date: string,
      start: string | null,
      end: string | null,
      breaks?: CustomBreak[] | null,
      vacation?: boolean | null
    ) => {
      const cleanBreaks = breaks && breaks.length > 0 ? breaks : null;
      const cleanVacation = vacation === true ? true : null;
      const isEmpty = !start && !end && !cleanBreaks && !cleanVacation;

      // Optimistic state update
      setUserOverrides((prev) => {
        const next = { ...prev };
        if (isEmpty) {
          delete next[date];
        } else {
          next[date] = { start, end, breaks: cleanBreaks, vacation: cleanVacation };
        }
        return next;
      });

      try {
        const response = await fetch('/api/overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            start,
            end,
            breaks: cleanBreaks,
            vacation: cleanVacation,
          }),
        });
        if (response.ok) {
          const updated: Record<string, DayOverride> = await response.json();
          setUserOverrides(updated);
          const monthKey = date.slice(0, 7);
          showToast(
            isEmpty
              ? `Reset overrides for ${date}`
              : `Saved overrides for ${date} in overrides/user-overrides-${monthKey}.json`
          );
        }
      } catch {
        showToast(
          isEmpty
            ? `Reset overrides for ${date} (local)`
            : `Saved overrides for ${date} (local)`
        );
      }
    },
    []
  );

  const handleSaveVacation = useCallback(
    async (
      startDate: string,
      endDate: string,
      excludeWeekends: boolean,
      vacation: boolean
    ) => {
      const targetDates = expandVacationDateRange(
        startDate,
        endDate,
        vacation ? excludeWeekends : false,
        lunchConfig.startWorkDate || ''
      );

      // Optimistic state update
      setUserOverrides((prev) => {
        const next = { ...prev };
        for (const dStr of targetDates) {
          const existing = next[dStr];
          if (vacation) {
            next[dStr] = {
              start: existing?.start ?? null,
              end: existing?.end ?? null,
              breaks: existing?.breaks ?? null,
              vacation: true,
            };
          } else if (existing) {
            const hasOther =
              Boolean(existing.start) ||
              Boolean(existing.end) ||
              Boolean(existing.breaks && existing.breaks.length > 0);
            if (hasOther) {
              next[dStr] = {
                start: existing.start ?? null,
                end: existing.end ?? null,
                breaks: existing.breaks ?? null,
                vacation: null,
              };
            } else {
              delete next[dStr];
            }
          }
        }
        return next;
      });

      try {
        const response = await fetch('/api/overrides/vacation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            endDate,
            excludeWeekends,
            vacation,
          }),
        });
        if (response.ok) {
          const updated: Record<string, DayOverride> = await response.json();
          setUserOverrides(updated);
        }
      } catch {
        // Saved locally in state if server offline
      }

      if (targetDates.length > 0) {
        const latestMonth = targetDates[targetDates.length - 1].slice(0, 7);
        setSelectedMonth(latestMonth);
      }

      showToast(
        vacation
          ? `Marked ${targetDates.length} ${targetDates.length === 1 ? 'day' : 'days'} as vacation in user overrides`
          : `Removed vacation for ${startDate === endDate ? startDate : `${startDate} – ${endDate}`}`
      );
    },
    [lunchConfig.startWorkDate]
  );

  // Process raw events into MonthSummaries
  const processedMonths = useMemo(() => {
    return processEventsByMonth(eventsByMonth, lunchConfig, userOverrides);
  }, [eventsByMonth, lunchConfig, userOverrides]);

  const monthList = useMemo(() => {
    return Object.values(processedMonths);
  }, [processedMonths]);

  const overallSaldo = useMemo(() => {
    return calculateOverallSaldo(monthList);
  }, [monthList]);

  // Set default active month to the latest month
  useEffect(() => {
    if (monthList.length > 0 && (!selectedMonth || !processedMonths[selectedMonth])) {
      setSelectedMonth(monthList[0].monthKey);
    }
  }, [monthList, selectedMonth, processedMonths]);

  const activeMonthSummary = useMemo(() => {
    return processedMonths[selectedMonth] || (monthList.length > 0 ? monthList[0] : null);
  }, [processedMonths, selectedMonth, monthList]);

  // Handle uploading custom pipe-delimited log file or overrides file
  const handleUploadLog = async (
    content: string,
    clearAll: boolean,
    mode: UploadMode = 'events'
  ) => {
    setIsLoading(true);
    setErrorMsg(null);

    if (mode === 'overrides') {
      const { overridesByDate, months: parsedMonths, lineCount } =
        parsePipeDelimitedOverrides(content);

      if (lineCount === 0 || parsedMonths.length === 0) {
        setIsLoading(false);
        throw new Error(
          'No valid override lines found (expected OVERRIDE_IN|date|time, OVERRIDE_OUT|date|time, or date|start|end).'
        );
      }

      try {
        const response = await fetch(`/api/overrides/upload?clearAll=${clearAll}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: content,
        });

        if (response.ok) {
          const data: EventsApiResponse = await response.json();
          if (data.lunchConfig) {
            setLunchConfig(data.lunchConfig);
          }
          if (data.userOverrides) {
            setUserOverrides(data.userOverrides);
          }
          if (data.eventsByMonth && Object.keys(data.eventsByMonth).length > 0) {
            setEventsByMonth(data.eventsByMonth);
          }
          setIsLive(true);
        } else {
          setUserOverrides((prev) => {
            if (clearAll) return overridesByDate;
            const next = { ...prev };
            // Replace dates in matching months
            for (const k of Object.keys(next)) {
              if (parsedMonths.includes(k.slice(0, 7))) {
                delete next[k];
              }
            }
            return { ...next, ...overridesByDate };
          });
        }
      } catch {
        setUserOverrides((prev) => {
          if (clearAll) return overridesByDate;
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (parsedMonths.includes(k.slice(0, 7))) {
              delete next[k];
            }
          }
          return { ...next, ...overridesByDate };
        });
      } finally {
        setIsLoading(false);
      }

      if (parsedMonths.length > 0) {
        setSelectedMonth(parsedMonths[0]);
      }

      showToast(
        `Successfully imported overrides for ${Object.keys(overridesByDate).length} day(s) in ${parsedMonths.join(', ')}.`
      );
      return;
    }

    // Client-side parse as fallback / optimistic preview for events
    const clientParsed = parsePipeDelimitedEvents(content);
    const parsedMonths = Object.keys(clientParsed).sort((a, b) => b.localeCompare(a));

    if (parsedMonths.length === 0) {
      setIsLoading(false);
      throw new Error('No valid STARTUP|timestamp or SHUTDOWN|timestamp events found in file.');
    }

    try {
      const response = await fetch(`/api/events/upload?clearAll=${clearAll}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: content,
      });

      if (response.ok) {
        const data: EventsApiResponse = await response.json();
        if (data.lunchConfig) {
          setLunchConfig(data.lunchConfig);
        }
        if (data.userOverrides) {
          setUserOverrides(data.userOverrides);
        }
        setEventsByMonth(data.eventsByMonth);
        setIsLive(true);
      } else {
        // Fallback to client-side parsed data if server isn't running or returns error
        setEventsByMonth((prev) => {
          if (clearAll) {
            return clientParsed;
          }
          return { ...prev, ...clientParsed };
        });
      }
    } catch {
      // Offline fallback
      setEventsByMonth((prev) => {
        if (clearAll) {
          return clientParsed;
        }
        return { ...prev, ...clientParsed };
      });
    } finally {
      setIsLoading(false);
    }

    // Switch active view to the latest uploaded month
    if (parsedMonths.length > 0) {
      setSelectedMonth(parsedMonths[0]);
    }

    const totalUploaded = Object.values(clientParsed).reduce((acc, l) => acc + l.length, 0);
    showToast(
      `Successfully imported ${totalUploaded} events for ${parsedMonths.join(', ')} (existing events overwritten).`
    );
  };

  // CSV export feature
  const handleExportCsv = useCallback(() => {
    if (!activeMonthSummary) return;

    const headers = [
      'Date',
      'Weekday',
      'Start',
      'Lunch Break',
      'End',
      'Lunch Deducted',
      'Net Duration',
      'Daily Saldo',
      'Sessions',
      'Status',
    ];
    const rows = activeMonthSummary.days.map((d) => [
      d.date,
      d.dayOfWeekFull,
      d.startWorkTime,
      d.lunchWindow,
      d.endWorkTime,
      d.lunchDeductedFormatted,
      d.durationFormatted,
      d.workBalanceFormatted,
      d.allEvents.length,
      d.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `work-hours-${activeMonthSummary.monthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeMonthSummary]);

  return (
    <div className="app-shell">
      <div className="app-container">
        <Header
          isLive={isLive}
          isLoading={isLoading}
          onRefresh={fetchEvents}
          onExportCsv={handleExportCsv}
          onOpenUpload={(mode = 'events') => {
            setUploadMode(mode);
            setIsUploadOpen(true);
          }}
          onOpenVacation={() => setIsVacationModalOpen(true)}
          onOpenCustomWorkDay={() => setIsCustomWorkDayModalOpen(true)}
          activeMonthLabel={activeMonthSummary?.monthLabel || 'Current Month'}
        />

        {toastMsg && (
          <div className="toast-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="toast-icon">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{toastMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="error-banner">
            <span>{errorMsg}</span>
          </div>
        )}

        {monthList.length > 0 && (
          <MonthSelector
            months={monthList}
            activeMonth={activeMonthSummary?.monthKey || ''}
            onSelectMonth={setSelectedMonth}
            overallSaldo={overallSaldo}
          />
        )}

        {activeMonthSummary ? (
          <main className="content-area">
            <MetricsCards
              summary={activeMonthSummary}
              lunchConfig={lunchConfig}
              overallSaldo={overallSaldo}
            />
            <WorkHoursTable
              days={activeMonthSummary.days}
              monthLabel={activeMonthSummary.monthLabel}
              lunchConfig={lunchConfig}
              onSaveOverride={handleSaveOverride}
              onOpenVacation={() => setIsVacationModalOpen(true)}
              onOpenCustomWorkDay={() => setIsCustomWorkDayModalOpen(true)}
            />
          </main>
        ) : (
          <div className="empty-container">
            <div className="loading-spinner"></div>
            <p>Loading work tracking events...</p>
          </div>
        )}

        <UploadModal
          isOpen={isUploadOpen}
          initialMode={uploadMode}
          onClose={() => setIsUploadOpen(false)}
          onUpload={handleUploadLog}
          isLoading={isLoading}
        />

        <StartWorkDateModal
          isOpen={isStartDateModalOpen}
          defaultSuggestedDate={lunchConfig.startWorkDate}
          onSave={handleSaveStartWorkDate}
        />

        <VacationModal
          isOpen={isVacationModalOpen}
          onClose={() => setIsVacationModalOpen(false)}
          startWorkDate={lunchConfig.startWorkDate}
          userOverrides={userOverrides}
          onSaveVacation={handleSaveVacation}
        />

        <CustomWorkDayModal
          isOpen={isCustomWorkDayModalOpen}
          onClose={() => setIsCustomWorkDayModalOpen(false)}
          startWorkDate={lunchConfig.startWorkDate}
          userOverrides={userOverrides}
          onSaveWorkDay={async (date, start, end, breaks) => {
            await handleSaveOverride(date, start, end, breaks, false);
            if (date.length >= 7) {
              setSelectedMonth(date.slice(0, 7));
            }
          }}
        />
      </div>
    </div>
  );
}

export default App;

