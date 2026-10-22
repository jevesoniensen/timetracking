import type {
  TrackerEvent,
  DaySummary,
  MonthSummary,
  OverallSaldoSummary,
  DayStatus,
  LunchConfig,
  DayOverride,
  CustomBreak,
} from '../types';

export const DEFAULT_LUNCH_CONFIG: LunchConfig = {
  defaultLunchStart: '12:30',
  defaultLunchEnd: '13:30',
  defaultWorkHoursPerDay: 8,
  startWorkDate: '',
};

export function isStartEvent(ev: TrackerEvent): boolean {
  if (ev.type) {
    return ev.type.toUpperCase() === 'START';
  }
  const n = ev.name.toUpperCase();
  return n === 'STARTUP' || n === 'LOGON' || n === 'RESUME' || n === 'WAKE';
}

export function isEndEvent(ev: TrackerEvent): boolean {
  if (ev.type) {
    return ev.type.toUpperCase() === 'END';
  }
  const n = ev.name.toUpperCase();
  return (
    n.includes('SHUTDOWN') ||
    n === 'LOGOFF' ||
    n === 'SLEEP'
  );
}

export function formatTime(timestamp: string): string {
  const parts = timestamp.split(' ');
  return parts.length > 1 ? parts[1] : timestamp;
}

export function normalize24hTime(timeStr: string): string {
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return timeStr.trim();
  const hh = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatSignedBalance(balanceSeconds: number): string {
  if (balanceSeconds === 0) return '0m';
  const sign = balanceSeconds > 0 ? '+' : '-';
  return `${sign}${formatDuration(Math.abs(balanceSeconds))}`;
}

export function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function parseDateTime(timestampStr: string): Date {
  // Expected format: YYYY-MM-DD HH:mm:ss
  const isoStr = timestampStr.replace(' ', 'T');
  return new Date(isoStr);
}

function parseLunchWindowMillis(dateStr: string, timeStr: string): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const hh = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  const ss = parts.length >= 3 ? parts[2].padStart(2, '0') : '00';
  const dt = new Date(`${dateStr}T${hh}:${mm}:${ss}`);
  const ms = dt.getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Merges overlapping [startMs, endMs] intervals and returns total covered milliseconds.
 */
function sumMergedIntervalsMillis(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = intervals
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return 0;

  let totalMs = 0;
  let [curStart, curEnd] = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const [nextStart, nextEnd] = sorted[i];
    if (nextStart <= curEnd) {
      curEnd = Math.max(curEnd, nextEnd);
    } else {
      totalMs += curEnd - curStart;
      curStart = nextStart;
      curEnd = nextEnd;
    }
  }
  totalMs += curEnd - curStart;
  return totalMs;
}

/**
 * Calculates the overlapping seconds between [workStartMillis, workEndMillis]
 * and the configured lunch window + custom breaks on `dateStr`.
 */
function calculateBreakDeductions(
  dateStr: string,
  workStartMillis: number,
  workEndMillis: number,
  lunchConfig: LunchConfig,
  customBreaks: CustomBreak[]
): { lunchDeductedSeconds: number; customBreaksDeductedSeconds: number; totalDeductedSeconds: number } {
  if (workEndMillis <= workStartMillis) {
    return { lunchDeductedSeconds: 0, customBreaksDeductedSeconds: 0, totalDeductedSeconds: 0 };
  }

  const lunchIntervals: Array<[number, number]> = [];
  const lunchStartMillis = parseLunchWindowMillis(dateStr, lunchConfig.defaultLunchStart);
  const lunchEndMillis = parseLunchWindowMillis(dateStr, lunchConfig.defaultLunchEnd);

  if (
    lunchStartMillis !== null &&
    lunchEndMillis !== null &&
    lunchEndMillis > lunchStartMillis
  ) {
    const overlapStart = Math.max(workStartMillis, lunchStartMillis);
    const overlapEnd = Math.min(workEndMillis, lunchEndMillis);
    if (overlapEnd > overlapStart) {
      lunchIntervals.push([overlapStart, overlapEnd]);
    }
  }

  const customIntervals: Array<[number, number]> = [];
  for (const cb of customBreaks) {
    const cbStart = parseLunchWindowMillis(dateStr, cb.start);
    const cbEnd = parseLunchWindowMillis(dateStr, cb.end);
    if (cbStart !== null && cbEnd !== null && cbEnd > cbStart) {
      const overlapStart = Math.max(workStartMillis, cbStart);
      const overlapEnd = Math.min(workEndMillis, cbEnd);
      if (overlapEnd > overlapStart) {
        customIntervals.push([overlapStart, overlapEnd]);
      }
    }
  }

  const lunchMs = sumMergedIntervalsMillis(lunchIntervals);
  const totalMs = sumMergedIntervalsMillis([...lunchIntervals, ...customIntervals]);
  const customOnlyMs = Math.max(0, totalMs - lunchMs);

  const lunchDeductedSeconds = Math.round(lunchMs / 1000);
  const customBreaksDeductedSeconds = Math.round(customOnlyMs / 1000);
  const totalDeductedSeconds = Math.round(totalMs / 1000);

  return {
    lunchDeductedSeconds,
    customBreaksDeductedSeconds,
    totalDeductedSeconds,
  };
}

function formatAverageSecondsToTime(avgSecondsOfDay: number): string {
  if (isNaN(avgSecondsOfDay) || avgSecondsOfDay < 0) return '—';
  const hours = Math.floor(avgSecondsOfDay / 3600) % 24;
  const minutes = Math.floor((avgSecondsOfDay % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Parses pipe-delimited log files (e.g. STARTUP|2026-07-07 17:20:04)
 * and groups events by month key (e.g. '2026-07').
 */
export function parsePipeDelimitedEvents(rawText: string): Record<string, TrackerEvent[]> {
  const result: Record<string, TrackerEvent[]> = {};
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;

    const parts = trimmed.split('|');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const timestamp = parts[1].trim();
      const rawType = parts.length >= 3 ? parts[2].trim().toUpperCase() : undefined;
      const inferredType =
        rawType === 'START' || rawType === 'END'
          ? rawType
          : isStartEvent({ name, timestamp })
          ? 'START'
          : isEndEvent({ name, timestamp })
          ? 'END'
          : undefined;

      if (inferredType && /^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
        const monthKey = timestamp.slice(0, 7);
        if (!result[monthKey]) {
          result[monthKey] = [];
        }
        result[monthKey].push({ name, timestamp, type: inferredType });
      }
    }
  }

  // Sort each month's events chronologically
  for (const monthKey of Object.keys(result)) {
    result[monthKey].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  return result;
}

/**
 * Expands a single date or inclusive date range (YYYY-MM-DD) into an array of YYYY-MM-DD strings.
 */
export function expandVacationDateRange(
  startDateStr: string,
  endDateStr?: string,
  excludeWeekends = true,
  startWorkDate = ''
): string[] {
  const sTrim = startDateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sTrim)) return [];
  const eTrim =
    endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr.trim())
      ? endDateStr.trim()
      : sTrim;

  const [sStart, sEnd] = sTrim <= eTrim ? [sTrim, eTrim] : [eTrim, sTrim];
  const [sy, sm, sd] = sStart.split('-').map(Number);
  const [ey, em, ed] = sEnd.split('-').map(Number);

  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const dates: string[] = [];

  while (cur.getTime() <= end.getTime()) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dow = cur.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dow === 0 || dow === 6;

    if ((!startWorkDate || dateStr >= startWorkDate) && (!excludeWeekends || !isWeekend)) {
      dates.push(dateStr);
    }
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
}

/**
 * Parses pipe-delimited override/exception files:
 * - Custom break: 2026-09-03|17:00:00|18:20:00
 * - Start override: OVERRIDE_IN|2026-09-09|07:49:05
 * - End override: OVERRIDE_OUT|2026-09-09|17:18:00
 * - Vacation: VACATION|2026-09-15 or VACATION|2026-09-15|2026-09-19
 */
export function parsePipeDelimitedOverrides(rawText: string): {
  overridesByDate: Record<string, DayOverride>;
  months: string[];
  lineCount: number;
} {
  const overridesByDate: Record<string, DayOverride> = {};
  const monthSet = new Set<string>();
  let lineCount = 0;

  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;

    const parts = trimmed.split('|');
    if (parts.length < 2) continue;

    const p0 = parts[0].trim();
    const p1 = parts[1].trim();
    const p2 = parts.length >= 3 ? parts[2].trim() : '';

    if (
      (p0.toUpperCase() === 'VACATION' || p0.toUpperCase() === 'OVERRIDE_VACATION') &&
      /^\d{4}-\d{2}-\d{2}$/.test(p1)
    ) {
      const isRange = /^\d{4}-\d{2}-\d{2}$/.test(p2) && p2 !== p1;
      const dates = expandVacationDateRange(p1, isRange ? p2 : p1, isRange);
      for (const date of dates) {
        monthSet.add(date.slice(0, 7));
        const existing = overridesByDate[date] || {};
        overridesByDate[date] = {
          ...existing,
          vacation: true,
        };
      }
      if (dates.length > 0) {
        lineCount++;
      }
    } else if (parts.length >= 3 && p0.toUpperCase() === 'OVERRIDE_IN' && /^\d{4}-\d{2}-\d{2}$/.test(p1) && p2) {
      const date = p1;
      monthSet.add(date.slice(0, 7));
      const existing = overridesByDate[date] || {};
      overridesByDate[date] = {
        ...existing,
        start: p2,
      };
      lineCount++;
    } else if (parts.length >= 3 && p0.toUpperCase() === 'OVERRIDE_OUT' && /^\d{4}-\d{2}-\d{2}$/.test(p1) && p2) {
      const date = p1;
      monthSet.add(date.slice(0, 7));
      const existing = overridesByDate[date] || {};
      overridesByDate[date] = {
        ...existing,
        end: p2,
      };
      lineCount++;
    } else if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(p0) && p1 && p2) {
      const date = p0;
      monthSet.add(date.slice(0, 7));
      const existing = overridesByDate[date] || {};
      const breaks = [...(existing.breaks || [])];
      if (!breaks.some((b) => b.start === p1 && b.end === p2)) {
        breaks.push({ start: p1, end: p2 });
      }
      overridesByDate[date] = {
        ...existing,
        breaks,
      };
      lineCount++;
    }
  }

  const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  return { overridesByDate, months, lineCount };
}

/**
 * Processes raw events into day summaries grouped by month.
 * Extracts the FIRST Windows startup as "Start" and LAST Windows shutdown as "End"
 * (or applies user overrides from user-overrides-YYYY-MM.json), deducting lunch and custom breaks.
 */
export function processEventsByMonth(
  eventsByMonth: Record<string, TrackerEvent[]>,
  lunchConfig: LunchConfig = DEFAULT_LUNCH_CONFIG,
  userOverrides: Record<string, DayOverride> = {}
): Record<string, MonthSummary> {
  const result: Record<string, MonthSummary> = {};
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const todayMonthKey = todayStr.slice(0, 7);
  const hoursPerDay =
    lunchConfig.defaultWorkHoursPerDay && lunchConfig.defaultWorkHoursPerDay > 0
      ? lunchConfig.defaultWorkHoursPerDay
      : 8;
  const startWorkDate =
    lunchConfig.startWorkDate && /^\d{4}-\d{2}-\d{2}$/.test(lunchConfig.startWorkDate.trim())
      ? lunchConfig.startWorkDate.trim()
      : '';
  const startWorkMonthKey = startWorkDate ? startWorkDate.slice(0, 7) : '';

  // Also include months that exist in userOverrides, startWorkDate, or the current month
  const allMonthKeys = new Set<string>(Object.keys(eventsByMonth));
  for (const dateKey of Object.keys(userOverrides)) {
    if (dateKey.length >= 7) {
      allMonthKeys.add(dateKey.slice(0, 7));
    }
  }
  if (startWorkMonthKey && startWorkMonthKey <= todayMonthKey) {
    allMonthKeys.add(startWorkMonthKey);
  }
  if (!startWorkDate || todayStr >= startWorkDate) {
    allMonthKeys.add(todayMonthKey);
  }

  const sortedMonthKeys = Array.from(allMonthKeys)
    .filter((mKey) => !startWorkMonthKey || mKey >= startWorkMonthKey)
    .sort((a, b) => b.localeCompare(a));

  for (const monthKey of sortedMonthKeys) {
    const events = eventsByMonth[monthKey] || [];
    // Group events in this month by date YYYY-MM-DD
    const dayMap: Record<string, TrackerEvent[]> = {};

    for (const ev of events) {
      if (!ev.timestamp || ev.timestamp.length < 10) continue;
      const dateStr = ev.timestamp.slice(0, 10);
      if (startWorkDate && dateStr < startWorkDate) continue;
      if (!dayMap[dateStr]) {
        dayMap[dateStr] = [];
      }
      dayMap[dateStr].push(ev);
    }

    // Generate calendar days of this month, excluding future days (> todayStr) and days before startWorkDate
    const [yearNum, monthNum] = monthKey.split('-').map(Number);
    const allDatesSet = new Set<string>();
    const isCurrentOrPastMonth = monthKey <= todayMonthKey;

    for (const dKey of Object.keys(dayMap)) {
      if (startWorkDate && dKey < startWorkDate) continue;
      if (!isCurrentOrPastMonth || dKey <= todayStr) {
        allDatesSet.add(dKey);
      }
    }
    for (const oKey of Object.keys(userOverrides)) {
      if (startWorkDate && oKey < startWorkDate) continue;
      if (oKey.startsWith(monthKey)) {
        allDatesSet.add(oKey);
      }
    }

    if (yearNum && monthNum >= 1 && monthNum <= 12) {
      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      const mmStr = String(monthNum).padStart(2, '0');
      for (let day = 1; day <= daysInMonth; day++) {
        const ddStr = String(day).padStart(2, '0');
        const candidateDate = `${yearNum}-${mmStr}-${ddStr}`;
        if (startWorkDate && candidateDate < startWorkDate) {
          continue; // Do not show days before startWorkDate
        }
        if (candidateDate > todayStr) {
          continue; // Do not auto-generate future days unless explicitly in userOverrides as vacation
        }
        allDatesSet.add(candidateDate);
      }
    }

    const daySummaries: DaySummary[] = [];
    let monthTotalSeconds = 0;
    let activeDaysCount = 0;
    let vacationDaysCount = 0;
    let expectedWorkDaysCount = 0;
    const startSecondsList: number[] = [];
    const endSecondsList: number[] = [];

    // Sort dates descending by default (last day shown down to first day)
    const sortedDates = Array.from(allDatesSet).sort((a, b) => b.localeCompare(a));

    for (const dateStr of sortedDates) {
      const dayEvents = (dayMap[dateStr] || []).slice().sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );

      // Find first start event of the day
      const firstStartup = dayEvents.find(isStartEvent) || null;

      // Find last end event of the day
      const shutdowns = dayEvents.filter(isEndEvent);
      const lastShutdown =
        shutdowns.length > 0 ? shutdowns[shutdowns.length - 1] : null;

      const dayOverride = userOverrides[dateStr];
      const isVacation = Boolean(dayOverride?.vacation);
      if (isVacation) {
        vacationDaysCount++;
      }
      const overrideStart =
        dayOverride?.start && dayOverride.start.trim()
          ? normalize24hTime(dayOverride.start)
          : null;
      const overrideEnd =
        dayOverride?.end && dayOverride.end.trim()
          ? normalize24hTime(dayOverride.end)
          : null;
      const customBreaks: CustomBreak[] = (dayOverride?.breaks || [])
        .filter((b) => b && b.start && b.end)
        .map((b) => ({
          start: normalize24hTime(b.start),
          end: normalize24hTime(b.end),
        }));

      const isStartOverridden = overrideStart !== null;
      const isEndOverridden = overrideEnd !== null;

      const effectiveStartTimestamp = overrideStart
        ? `${dateStr} ${overrideStart.length === 5 ? `${overrideStart}:00` : overrideStart}`
        : firstStartup?.timestamp || null;

      const effectiveEndTimestamp = overrideEnd
        ? `${dateStr} ${overrideEnd.length === 5 ? `${overrideEnd}:00` : overrideEnd}`
        : lastShutdown?.timestamp || null;

      // Parse date for display
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayIndex = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayIndex === 0 || dayIndex === 6;
      const dayOfWeek = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
      const dayOfWeekFull = dateObj.toLocaleDateString(undefined, { weekday: 'long' });
      const formattedDate = dateObj.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let grossDurationSeconds = 0;
      let lunchDeductedSeconds = 0;
      let customBreaksDeductedSeconds = 0;
      let durationSeconds = 0;
      let status: DayStatus = isVacation ? 'vacation' : 'no_startup';

      if (effectiveStartTimestamp && effectiveEndTimestamp) {
        const startMillis = parseDateTime(effectiveStartTimestamp).getTime();
        const endMillis = parseDateTime(effectiveEndTimestamp).getTime();
        if (endMillis > startMillis) {
          grossDurationSeconds = Math.round((endMillis - startMillis) / 1000);
          const deductions = calculateBreakDeductions(
            dateStr,
            startMillis,
            endMillis,
            lunchConfig,
            customBreaks
          );
          lunchDeductedSeconds = deductions.lunchDeductedSeconds;
          customBreaksDeductedSeconds = deductions.customBreaksDeductedSeconds;
          durationSeconds = Math.max(0, grossDurationSeconds - deductions.totalDeductedSeconds);
          status = isVacation ? 'vacation' : 'completed';
        } else {
          // If shutdown occurred before the startup (e.g., morning shutdown after overnight run)
          durationSeconds = 0;
          status = isVacation ? 'vacation' : 'completed';
        }
      } else if (effectiveStartTimestamp && !effectiveEndTimestamp) {
        if (dateStr === todayStr) {
          // System is currently running today
          const startMillis = parseDateTime(effectiveStartTimestamp).getTime();
          const nowMillis = Date.now();
          grossDurationSeconds = Math.max(0, Math.round((nowMillis - startMillis) / 1000));
          const deductions = calculateBreakDeductions(
            dateStr,
            startMillis,
            endMillisOrNow(startMillis, nowMillis),
            lunchConfig,
            customBreaks
          );
          lunchDeductedSeconds = deductions.lunchDeductedSeconds;
          customBreaksDeductedSeconds = deductions.customBreaksDeductedSeconds;
          durationSeconds = Math.max(0, grossDurationSeconds - deductions.totalDeductedSeconds);
          status = 'in_progress';
        } else {
          status = 'no_shutdown';
        }
      } else if (!effectiveStartTimestamp && effectiveEndTimestamp) {
        status = isVacation ? 'vacation' : 'no_startup';
      } else {
        status = isVacation ? 'vacation' : 'no_startup';
      }

      // Do not consider today or future scheduled vacation days for past monthly calculations
      const isTodayOrFuture = dateStr >= todayStr;
      if (!isTodayOrFuture) {
        if (durationSeconds > 0) {
          monthTotalSeconds += durationSeconds;
        }
        if (firstStartup !== null || isStartOverridden) {
          activeDaysCount++;
        }
        if (!isWeekend && !isVacation) {
          expectedWorkDaysCount++;
        }
        if (effectiveStartTimestamp) {
          const stDate = parseDateTime(effectiveStartTimestamp);
          startSecondsList.push(
            stDate.getHours() * 3600 + stDate.getMinutes() * 60 + stDate.getSeconds()
          );
        }
        if (effectiveEndTimestamp) {
          const enDate = parseDateTime(effectiveEndTimestamp);
          endSecondsList.push(
            enDate.getHours() * 3600 + enDate.getMinutes() * 60 + enDate.getSeconds()
          );
        }
      }

      const hasStart = Boolean(effectiveStartTimestamp);
      const lunchWindow = hasStart
        ? `${lunchConfig.defaultLunchStart} – ${lunchConfig.defaultLunchEnd}`
        : '—';

      const startWorkTime = overrideStart
        ? overrideStart.slice(0, 5)
        : firstStartup
        ? formatTime(firstStartup.timestamp).slice(0, 5)
        : '—';

      const endWorkTime = overrideEnd
        ? overrideEnd.slice(0, 5)
        : lastShutdown
        ? formatTime(lastShutdown.timestamp).slice(0, 5)
        : status === 'in_progress'
        ? 'In Progress'
        : '—';

      const dayExpectedSeconds =
        isWeekend || isVacation || dateStr > todayStr ? 0 : Math.round(hoursPerDay * 3600);
      const dayBalanceSeconds = durationSeconds - dayExpectedSeconds;

      daySummaries.push({
        date: dateStr,
        dayOfWeek,
        dayOfWeekFull,
        formattedDate,
        isWeekend,
        isVacation,
        firstStartup,
        lastShutdown,
        effectiveStartTimestamp,
        effectiveEndTimestamp,
        startWorkTime,
        endWorkTime,
        isStartOverridden,
        isEndOverridden,
        lunchWindow,
        customBreaks,
        customBreaksDeductedSeconds,
        customBreaksDeductedFormatted: formatDuration(customBreaksDeductedSeconds),
        grossDurationSeconds,
        lunchDeductedSeconds,
        lunchDeductedFormatted: formatDuration(lunchDeductedSeconds),
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
        expectedWorkSeconds: dayExpectedSeconds,
        workBalanceSeconds: dayBalanceSeconds,
        workBalanceFormatted: formatSignedBalance(dayBalanceSeconds),
        status,
        allEvents: dayEvents,
        sessionCount: dayEvents.filter(isStartEvent).length,
      });
    }

    const avgStartSeconds =
      startSecondsList.length > 0
        ? startSecondsList.reduce((acc, v) => acc + v, 0) / startSecondsList.length
        : -1;
    const avgEndSeconds =
      endSecondsList.length > 0
        ? endSecondsList.reduce((acc, v) => acc + v, 0) / endSecondsList.length
        : -1;

    const expectedWorkSeconds = Math.round(expectedWorkDaysCount * hoursPerDay * 3600);
    const workBalanceSeconds = monthTotalSeconds - expectedWorkSeconds;
    const workBalanceFormatted = formatSignedBalance(workBalanceSeconds);

    result[monthKey] = {
      monthKey,
      monthLabel: getMonthLabel(monthKey),
      days: daySummaries,
      totalWorkSeconds: monthTotalSeconds,
      totalWorkFormatted: formatDuration(monthTotalSeconds),
      expectedWorkDaysCount,
      expectedWorkSeconds,
      expectedWorkFormatted: formatDuration(expectedWorkSeconds),
      workBalanceSeconds,
      workBalanceFormatted,
      activeDaysCount,
      vacationDaysCount,
      avgStartWork: formatAverageSecondsToTime(avgStartSeconds),
      avgEndWork: formatAverageSecondsToTime(avgEndSeconds),
    };
  }

  return result;
}

export function calculateOverallSaldo(months: MonthSummary[]): OverallSaldoSummary {
  let totalWorkSeconds = 0;
  let expectedWorkDaysCount = 0;
  let expectedWorkSeconds = 0;
  let activeDaysCount = 0;
  let vacationDaysCount = 0;

  for (const m of months) {
    totalWorkSeconds += m.totalWorkSeconds;
    expectedWorkDaysCount += m.expectedWorkDaysCount;
    expectedWorkSeconds += m.expectedWorkSeconds;
    activeDaysCount += m.activeDaysCount;
    vacationDaysCount += m.vacationDaysCount;
  }

  const workBalanceSeconds = totalWorkSeconds - expectedWorkSeconds;

  return {
    monthsCount: months.length,
    totalWorkSeconds,
    totalWorkFormatted: formatDuration(totalWorkSeconds),
    expectedWorkDaysCount,
    expectedWorkSeconds,
    expectedWorkFormatted: formatDuration(expectedWorkSeconds),
    workBalanceSeconds,
    workBalanceFormatted: formatSignedBalance(workBalanceSeconds),
    activeDaysCount,
    vacationDaysCount,
  };
}

function endMillisOrNow(startMillis: number, nowMillis: number): number {
  return Math.max(startMillis, nowMillis);
}



