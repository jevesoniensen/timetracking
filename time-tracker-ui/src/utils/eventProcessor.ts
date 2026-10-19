import type {
  TrackerEvent,
  DaySummary,
  MonthSummary,
  DayStatus,
  LunchConfig,
  DayOverride,
  CustomBreak,
} from '../types';

export const DEFAULT_LUNCH_CONFIG: LunchConfig = {
  defaultLunchStart: '12:30',
  defaultLunchEnd: '13:30',
  defaultWorkHoursPerDay: 8,
};

export function formatTime(timestamp: string): string {
  const parts = timestamp.split(' ');
  return parts.length > 1 ? parts[1] : timestamp;
}

export function normalize24hTime(timeStr: string): string {
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return timeStr.trim();
  const hh = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  if (parts.length >= 3) {
    const ss = parts[2].padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
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
    if (parts.length === 2) {
      const name = parts[0].trim();
      const timestamp = parts[1].trim();
      if (
        (name.toUpperCase() === 'STARTUP' || name.toUpperCase() === 'SHUTDOWN') &&
        /^\d{4}-\d{2}-\d{2}/.test(timestamp)
      ) {
        const monthKey = timestamp.slice(0, 7);
        if (!result[monthKey]) {
          result[monthKey] = [];
        }
        result[monthKey].push({ name, timestamp });
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
 * Parses pipe-delimited override/exception files:
 * - Custom break: 2026-09-03|17:00:00|18:20:00
 * - Start override: OVERRIDE_IN|2026-09-09|07:49:05
 * - End override: OVERRIDE_OUT|2026-09-09|17:18:00
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
    if (parts.length < 3) continue;

    const p0 = parts[0].trim();
    const p1 = parts[1].trim();
    const p2 = parts[2].trim();

    if (p0.toUpperCase() === 'OVERRIDE_IN' && /^\d{4}-\d{2}-\d{2}$/.test(p1) && p2) {
      const date = p1;
      monthSet.add(date.slice(0, 7));
      const existing = overridesByDate[date] || {};
      overridesByDate[date] = {
        ...existing,
        start: p2,
      };
      lineCount++;
    } else if (p0.toUpperCase() === 'OVERRIDE_OUT' && /^\d{4}-\d{2}-\d{2}$/.test(p1) && p2) {
      const date = p1;
      monthSet.add(date.slice(0, 7));
      const existing = overridesByDate[date] || {};
      overridesByDate[date] = {
        ...existing,
        end: p2,
      };
      lineCount++;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(p0) && p1 && p2) {
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

  // Also include months that only exist in userOverrides
  const allMonthKeys = new Set<string>(Object.keys(eventsByMonth));
  for (const dateKey of Object.keys(userOverrides)) {
    if (dateKey.length >= 7) {
      allMonthKeys.add(dateKey.slice(0, 7));
    }
  }

  const sortedMonthKeys = Array.from(allMonthKeys).sort((a, b) => b.localeCompare(a));

  for (const monthKey of sortedMonthKeys) {
    const events = eventsByMonth[monthKey] || [];
    // Group events in this month by date YYYY-MM-DD
    const dayMap: Record<string, TrackerEvent[]> = {};

    for (const ev of events) {
      if (!ev.timestamp || ev.timestamp.length < 10) continue;
      const dateStr = ev.timestamp.slice(0, 10);
      if (!dayMap[dateStr]) {
        dayMap[dateStr] = [];
      }
      dayMap[dateStr].push(ev);
    }

    // Generate calendar days of this month, excluding future days (> todayStr)
    const [yearNum, monthNum] = monthKey.split('-').map(Number);
    const allDatesSet = new Set<string>();
    const isCurrentOrPastMonth = monthKey <= todayMonthKey;

    for (const dKey of Object.keys(dayMap)) {
      if (!isCurrentOrPastMonth || dKey <= todayStr) {
        allDatesSet.add(dKey);
      }
    }
    for (const oKey of Object.keys(userOverrides)) {
      if (oKey.startsWith(monthKey) && (!isCurrentOrPastMonth || oKey <= todayStr)) {
        allDatesSet.add(oKey);
      }
    }

    if (yearNum && monthNum >= 1 && monthNum <= 12) {
      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      const mmStr = String(monthNum).padStart(2, '0');
      for (let day = 1; day <= daysInMonth; day++) {
        const ddStr = String(day).padStart(2, '0');
        const candidateDate = `${yearNum}-${mmStr}-${ddStr}`;
        if (isCurrentOrPastMonth && candidateDate > todayStr) {
          continue; // Do not show future days
        }
        allDatesSet.add(candidateDate);
      }
    }

    const daySummaries: DaySummary[] = [];
    let monthTotalSeconds = 0;
    let activeDaysCount = 0;
    let expectedWorkDaysCount = 0;
    const startSecondsList: number[] = [];
    const endSecondsList: number[] = [];

    // Sort dates descending by default (last day shown down to first day)
    const sortedDates = Array.from(allDatesSet).sort((a, b) => b.localeCompare(a));

    for (const dateStr of sortedDates) {
      const dayEvents = (dayMap[dateStr] || []).slice().sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );

      // Find first STARTUP of the day
      const firstStartup =
        dayEvents.find((e) => e.name.toUpperCase() === 'STARTUP') || null;

      // Find last SHUTDOWN of the day
      const shutdowns = dayEvents.filter(
        (e) => e.name.toUpperCase() === 'SHUTDOWN'
      );
      const lastShutdown =
        shutdowns.length > 0 ? shutdowns[shutdowns.length - 1] : null;

      const dayOverride = userOverrides[dateStr];
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
      let status: DayStatus = 'no_startup';

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
          status = 'completed';
        } else {
          // If shutdown occurred before the startup (e.g., morning shutdown after overnight run)
          durationSeconds = 0;
          status = 'completed';
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
        status = 'no_startup';
      } else {
        status = 'no_startup';
      }

      // Do not consider today for overall monthly calculations
      const isToday = dateStr === todayStr;
      if (!isToday) {
        if (durationSeconds > 0) {
          monthTotalSeconds += durationSeconds;
        }
        if (firstStartup !== null || isStartOverridden) {
          activeDaysCount++;
        }
        if (!isWeekend) {
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
        ? overrideStart
        : firstStartup
        ? formatTime(firstStartup.timestamp)
        : '—';

      const endWorkTime = overrideEnd
        ? overrideEnd
        : lastShutdown
        ? formatTime(lastShutdown.timestamp)
        : status === 'in_progress'
        ? 'In Progress'
        : '—';

      daySummaries.push({
        date: dateStr,
        dayOfWeek,
        dayOfWeekFull,
        formattedDate,
        isWeekend,
        firstStartup,
        lastShutdown,
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
        status,
        allEvents: dayEvents,
        sessionCount: dayEvents.filter((e) => e.name.toUpperCase() === 'STARTUP').length,
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
    const balanceSign = workBalanceSeconds >= 0 ? '+' : '-';
    const workBalanceFormatted =
      workBalanceSeconds === 0
        ? '0m'
        : `${balanceSign}${formatDuration(Math.abs(workBalanceSeconds))}`;

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
      avgStartWork: formatAverageSecondsToTime(avgStartSeconds),
      avgEndWork: formatAverageSecondsToTime(avgEndSeconds),
    };
  }

  return result;
}

function endMillisOrNow(startMillis: number, nowMillis: number): number {
  return Math.max(startMillis, nowMillis);
}



