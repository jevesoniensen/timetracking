export interface TrackerEvent {
  name: string;
  timestamp: string;
  type?: 'START' | 'END' | string;
}

export interface LunchConfig {
  defaultLunchStart: string; // HH:mm, e.g. "12:30"
  defaultLunchEnd: string;   // HH:mm, e.g. "13:30"
  defaultWorkHoursPerDay?: number; // e.g. 8
  startWorkDate?: string; // YYYY-MM-DD, empty until configured on first startup
}

export interface CustomBreak {
  start: string; // 24h HH:mm or HH:mm:ss
  end: string;   // 24h HH:mm or HH:mm:ss
}

export interface DayOverride {
  start?: string | null; // 24h HH:mm or HH:mm:ss
  end?: string | null;   // 24h HH:mm or HH:mm:ss
  breaks?: CustomBreak[] | null;
  vacation?: boolean | null;
}

export type DayStatus = 'completed' | 'in_progress' | 'no_shutdown' | 'no_startup' | 'vacation';

export interface DaySummary {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // Mon, Tue, etc.
  dayOfWeekFull: string; // Monday, Tuesday, etc.
  formattedDate: string; // Oct 02, 2026
  isWeekend: boolean; // Saturday or Sunday
  isVacation: boolean; // Marked as vacation in user overrides
  firstStartup: TrackerEvent | null;
  lastShutdown: TrackerEvent | null;
  effectiveStartTimestamp?: string | null;
  effectiveEndTimestamp?: string | null;
  startWorkTime: string; // HH:mm:ss
  endWorkTime: string; // HH:mm:ss or "In Progress"
  isStartOverridden: boolean;
  isEndOverridden: boolean;
  lunchWindow: string; // e.g. "12:30 – 13:30" or "—"
  customBreaks: CustomBreak[];
  customBreaksDeductedSeconds: number;
  customBreaksDeductedFormatted: string;
  grossDurationSeconds: number;
  lunchDeductedSeconds: number;
  lunchDeductedFormatted: string;
  durationSeconds: number;
  durationFormatted: string; // e.g. "8h 15m"
  expectedWorkSeconds: number; // e.g. 28800 (8h) on workdays, 0 on weekends/vacation
  workBalanceSeconds: number; // durationSeconds - expectedWorkSeconds
  workBalanceFormatted: string; // e.g. "+15m" or "-1h 10m"
  status: DayStatus;
  allEvents: TrackerEvent[];
  sessionCount: number;
}

export interface MonthSummary {
  monthKey: string; // YYYY-MM
  monthLabel: string; // October 2026
  days: DaySummary[];
  totalWorkSeconds: number;
  totalWorkFormatted: string;
  expectedWorkDaysCount: number;
  expectedWorkSeconds: number;
  expectedWorkFormatted: string;
  workBalanceSeconds: number;
  workBalanceFormatted: string;
  activeDaysCount: number;
  vacationDaysCount: number;
  avgStartWork: string;
  avgEndWork: string;
}

export interface OverallSaldoSummary {
  monthsCount: number;
  totalWorkSeconds: number;
  totalWorkFormatted: string;
  expectedWorkDaysCount: number;
  expectedWorkSeconds: number;
  expectedWorkFormatted: string;
  workBalanceSeconds: number;
  workBalanceFormatted: string;
  activeDaysCount: number;
  vacationDaysCount: number;
}

export interface EventsApiResponse {
  months: string[];
  eventsByMonth: Record<string, TrackerEvent[]>;
  lunchConfig?: LunchConfig;
  userOverrides?: Record<string, DayOverride>;
}
