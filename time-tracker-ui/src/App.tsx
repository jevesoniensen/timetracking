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
import type {
  EventsApiResponse,
  LunchConfig,
  DayOverride,
  CustomBreak,
  MonthSummary,
  OverallSaldoSummary,
} from './types';
import './index.css';

const DEFAULT_LUNCH_CONFIG: LunchConfig = {
  defaultLunchStart: '12:30',
  defaultLunchEnd: '13:30',
  defaultWorkHoursPerDay: 8,
  startWorkDate: '',
};

function App() {
  const [monthSummaries, setMonthSummaries] = useState<Record<string, MonthSummary>>({});
  const [overallSaldo, setOverallSaldo] = useState<OverallSaldoSummary | undefined>(undefined);
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

  const applyServerResponse = useCallback((data: EventsApiResponse, checkStartWorkDate = false) => {
    if (data.lunchConfig) {
      setLunchConfig(data.lunchConfig);
      if (checkStartWorkDate && (!data.lunchConfig.startWorkDate || !data.lunchConfig.startWorkDate.trim())) {
        setIsStartDateModalOpen(true);
      }
    } else if (checkStartWorkDate) {
      setIsStartDateModalOpen(true);
    }
    if (data.userOverrides) {
      setUserOverrides(data.userOverrides);
    }
    if (data.monthSummaries) {
      setMonthSummaries(data.monthSummaries);
    }
    if (data.overallSaldo) {
      setOverallSaldo(data.overallSaldo);
    }
    setIsLive(true);
  }, []);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/events');
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data: EventsApiResponse = await response.json();
      applyServerResponse(data, true);
    } catch {
      setIsLive(false);
      setErrorMsg('Unable to connect to local TimeTracker server.');
    } finally {
      setIsLoading(false);
    }
  }, [applyServerResponse]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSaveStartWorkDate = useCallback(
    async (startWorkDate: string) => {
      const cleanDate = startWorkDate.trim();
      const response = await fetch('/api/config/start-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startWorkDate: cleanDate }),
      });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data: EventsApiResponse = await response.json();
      applyServerResponse(data, false);
      setIsStartDateModalOpen(false);
      showToast(`Saved Start Work Date (${cleanDate}) to config.properties`);
    },
    [applyServerResponse]
  );

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
          const data: EventsApiResponse = await response.json();
          applyServerResponse(data, false);
          const monthKey = date.slice(0, 7);
          showToast(
            isEmpty
              ? `Reset overrides for ${date}`
              : `Saved overrides for ${date} in overrides/user-overrides-${monthKey}.json`
          );
        }
      } catch {
        setErrorMsg('Failed to save override to local server.');
      }
    },
    [applyServerResponse]
  );

  const handleSaveVacation = useCallback(
    async (
      startDate: string,
      endDate: string,
      excludeWeekends: boolean,
      vacation: boolean
    ) => {
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
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data: EventsApiResponse = await response.json();
      applyServerResponse(data, false);

      if (endDate && endDate.length >= 7) {
        setSelectedMonth(endDate.slice(0, 7));
      } else if (startDate && startDate.length >= 7) {
        setSelectedMonth(startDate.slice(0, 7));
      }

      showToast(
        vacation
          ? `Saved vacation (${startDate === endDate ? startDate : `${startDate} – ${endDate}`}) in user overrides`
          : `Removed vacation for ${startDate === endDate ? startDate : `${startDate} – ${endDate}`}`
      );
    },
    [applyServerResponse]
  );

  const monthList = useMemo(() => {
    return Object.values(monthSummaries);
  }, [monthSummaries]);

  useEffect(() => {
    if (monthList.length > 0 && (!selectedMonth || !monthSummaries[selectedMonth])) {
      setSelectedMonth(monthList[0].monthKey);
    }
  }, [monthList, selectedMonth, monthSummaries]);

  const activeMonthSummary = useMemo(() => {
    return monthSummaries[selectedMonth] || (monthList.length > 0 ? monthList[0] : null);
  }, [monthSummaries, selectedMonth, monthList]);

  const handleUploadLog = async (
    content: string,
    clearAll: boolean,
    mode: UploadMode = 'events'
  ) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const endpoint =
        mode === 'overrides'
          ? `/api/overrides/upload?clearAll=${clearAll}`
          : `/api/events/upload?clearAll=${clearAll}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data: EventsApiResponse = await response.json();
      applyServerResponse(data, false);

      if (data.months && data.months.length > 0) {
        setSelectedMonth(data.months[0]);
      }

      showToast(
        mode === 'overrides'
          ? 'Successfully imported user overrides.'
          : 'Successfully imported events log.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCsv = useCallback(() => {
    if (!activeMonthSummary) return;
    const link = document.createElement('a');
    link.setAttribute('href', `/api/events/${activeMonthSummary.monthKey}/csv`);
    link.setAttribute('download', `work-hours-${activeMonthSummary.monthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeMonthSummary]);

  return (
    <div className="app-shell">
      <div className="app-container">
        <Header
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
            <div className="main-table-column">
              <WorkHoursTable
                days={activeMonthSummary.days}
                monthLabel={activeMonthSummary.monthLabel}
                lunchConfig={lunchConfig}
                onSaveOverride={handleSaveOverride}
                onOpenVacation={() => setIsVacationModalOpen(true)}
                onOpenCustomWorkDay={() => setIsCustomWorkDayModalOpen(true)}
              />
            </div>
            <aside className="metrics-sidebar" aria-label="Monthly statistics">
              <MetricsCards
                summary={activeMonthSummary}
                lunchConfig={lunchConfig}
                overallSaldo={overallSaldo}
              />
            </aside>
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

      <div
        className={`status-badge bottom-right ${isLive ? 'live' : 'fallback'}`}
        title={isLive ? 'Local Server Connected' : 'Server Disconnected'}
        aria-label={isLive ? 'Local Server Connected' : 'Server Disconnected'}
      >
        <span className="status-dot"></span>
      </div>
    </div>
  );
}

export default App;
