package com.timetracker.service;

import com.timetracker.dto.CustomBreak;
import com.timetracker.dto.DayOverride;
import com.timetracker.dto.DaySummary;
import com.timetracker.dto.LunchConfig;
import com.timetracker.dto.MonthSummary;
import com.timetracker.dto.OverallSaldoSummary;
import com.timetracker.dto.TrackerEvent;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

@Service
public class WorkSummaryCalculator {

    private static final DateTimeFormatter DATE_TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter FORMATTED_DATE_FMT = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);
    private static final DateTimeFormatter MONTH_LABEL_FMT = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US);

    public static boolean isStartEvent(TrackerEvent ev) {
        if (ev == null) return false;
        if (ev.type() != null && !ev.type().isBlank()) {
            return "START".equalsIgnoreCase(ev.type().trim());
        }
        return "START".equals(TrackerEvent.inferType(ev.name()));
    }

    public static boolean isEndEvent(TrackerEvent ev) {
        if (ev == null) return false;
        if (ev.type() != null && !ev.type().isBlank()) {
            return "END".equalsIgnoreCase(ev.type().trim());
        }
        return "END".equals(TrackerEvent.inferType(ev.name()));
    }

    public static String normalize24hTime(String timeStr) {
        if (timeStr == null) return "";
        String[] parts = timeStr.trim().split(":");
        if (parts.length < 2) return timeStr.trim();
        String hh = parts[0].length() == 1 ? "0" + parts[0] : parts[0];
        String mm = parts[1].length() == 1 ? "0" + parts[1] : parts[1];
        return hh + ":" + mm;
    }

    public static String formatTime(String timestamp) {
        if (timestamp == null) return "";
        String[] parts = timestamp.split(" ");
        return parts.length > 1 ? parts[1] : timestamp;
    }

    public static String formatDuration(long seconds) {
        if (seconds <= 0) return "0m";
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        if (hours == 0) {
            return minutes + "m";
        }
        return minutes > 0 ? (hours + "h " + minutes + "m") : (hours + "h");
    }

    public static String formatSignedBalance(long balanceSeconds) {
        if (balanceSeconds == 0) return "0m";
        String sign = balanceSeconds > 0 ? "+" : "-";
        return sign + formatDuration(Math.abs(balanceSeconds));
    }

    public static String getMonthLabel(String monthKey) {
        try {
            YearMonth ym = YearMonth.parse(monthKey);
            return ym.format(MONTH_LABEL_FMT);
        } catch (Exception e) {
            return monthKey;
        }
    }

    private static LocalDateTime parseDateTime(String timestampStr) {
        if (timestampStr == null || timestampStr.isBlank()) return null;
        try {
            String normalized = timestampStr.trim().replace('T', ' ');
            if (normalized.length() == 16) {
                normalized = normalized + ":00";
            } else if (normalized.length() > 19) {
                normalized = normalized.substring(0, 19);
            }
            return LocalDateTime.parse(normalized, DATE_TIME_FMT);
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDateTime parseWindowDateTime(LocalDate date, String timeStr) {
        if (timeStr == null || timeStr.isBlank()) return null;
        try {
            String[] parts = timeStr.trim().split(":");
            if (parts.length < 2) return null;
            int hh = Integer.parseInt(parts[0]);
            int mm = Integer.parseInt(parts[1]);
            int ss = parts.length >= 3 ? Integer.parseInt(parts[2]) : 0;
            return LocalDateTime.of(date, LocalTime.of(hh, mm, ss));
        } catch (Exception e) {
            return null;
        }
    }

    private static long sumMergedIntervalsSeconds(List<long[]> intervals) {
        if (intervals.isEmpty()) return 0;
        List<long[]> valid = new ArrayList<>();
        for (long[] iv : intervals) {
            if (iv[1] > iv[0]) {
                valid.add(iv);
            }
        }
        if (valid.isEmpty()) return 0;
        valid.sort(Comparator.comparingLong(a -> a[0]));

        long total = 0;
        long curStart = valid.get(0)[0];
        long curEnd = valid.get(0)[1];

        for (int i = 1; i < valid.size(); i++) {
            long nextStart = valid.get(i)[0];
            long nextEnd = valid.get(i)[1];
            if (nextStart <= curEnd) {
                curEnd = Math.max(curEnd, nextEnd);
            } else {
                total += (curEnd - curStart);
                curStart = nextStart;
                curEnd = nextEnd;
            }
        }
        total += (curEnd - curStart);
        return total;
    }

    private record BreakDeductions(long lunchDeductedSeconds, long customBreaksDeductedSeconds, long totalDeductedSeconds) {}

    private static BreakDeductions calculateBreakDeductions(
            LocalDate date,
            LocalDateTime workStart,
            LocalDateTime workEnd,
            LunchConfig lunchConfig,
            List<CustomBreak> customBreaks
    ) {
        if (workStart == null || workEnd == null || !workEnd.isAfter(workStart)) {
            return new BreakDeductions(0, 0, 0);
        }
        long workStartSec = Duration.between(date.atStartOfDay(), workStart).getSeconds();
        long workEndSec = Duration.between(date.atStartOfDay(), workEnd).getSeconds();

        List<long[]> lunchIntervals = new ArrayList<>();
        LocalDateTime lunchStartDt = parseWindowDateTime(date, lunchConfig.defaultLunchStart());
        LocalDateTime lunchEndDt = parseWindowDateTime(date, lunchConfig.defaultLunchEnd());

        if (lunchStartDt != null && lunchEndDt != null && lunchEndDt.isAfter(lunchStartDt)) {
            long lStart = Duration.between(date.atStartOfDay(), lunchStartDt).getSeconds();
            long lEnd = Duration.between(date.atStartOfDay(), lunchEndDt).getSeconds();
            long overlapStart = Math.max(workStartSec, lStart);
            long overlapEnd = Math.min(workEndSec, lEnd);
            if (overlapEnd > overlapStart) {
                lunchIntervals.add(new long[]{overlapStart, overlapEnd});
            }
        }

        List<long[]> customIntervals = new ArrayList<>();
        if (customBreaks != null) {
            for (CustomBreak cb : customBreaks) {
                LocalDateTime cbStartDt = parseWindowDateTime(date, cb.start());
                LocalDateTime cbEndDt = parseWindowDateTime(date, cb.end());
                if (cbStartDt != null && cbEndDt != null && cbEndDt.isAfter(cbStartDt)) {
                    long cStart = Duration.between(date.atStartOfDay(), cbStartDt).getSeconds();
                    long cEnd = Duration.between(date.atStartOfDay(), cbEndDt).getSeconds();
                    long overlapStart = Math.max(workStartSec, cStart);
                    long overlapEnd = Math.min(workEndSec, cEnd);
                    if (overlapEnd > overlapStart) {
                        customIntervals.add(new long[]{overlapStart, overlapEnd});
                    }
                }
            }
        }

        long lunchSec = sumMergedIntervalsSeconds(lunchIntervals);
        List<long[]> combined = new ArrayList<>(lunchIntervals);
        combined.addAll(customIntervals);
        long totalSec = sumMergedIntervalsSeconds(combined);
        long customOnlySec = Math.max(0, totalSec - lunchSec);

        return new BreakDeductions(lunchSec, customOnlySec, totalSec);
    }

    private static String formatAverageSecondsToTime(double avgSecondsOfDay) {
        if (Double.isNaN(avgSecondsOfDay) || avgSecondsOfDay < 0) return "—";
        long totalSec = Math.round(avgSecondsOfDay);
        long hours = (totalSec / 3600) % 24;
        long minutes = (totalSec % 3600) / 60;
        return String.format("%02d:%02d", hours, minutes);
    }

    public Map<String, MonthSummary> processEventsByMonth(
            Map<String, List<TrackerEvent>> eventsByMonth,
            LunchConfig lunchConfig,
            Map<String, DayOverride> userOverrides
    ) {
        Map<String, MonthSummary> result = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();
        String todayStr = today.toString();
        String todayMonthKey = todayStr.substring(0, 7);

        double hoursPerDay = (lunchConfig != null && lunchConfig.defaultWorkHoursPerDay() > 0)
                ? lunchConfig.defaultWorkHoursPerDay()
                : 8.0;
        String rawStartWorkDate = (lunchConfig != null && lunchConfig.startWorkDate() != null)
                ? lunchConfig.startWorkDate().trim()
                : "";
        String startWorkDate = rawStartWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$") ? rawStartWorkDate : "";
        String startWorkMonthKey = !startWorkDate.isEmpty() ? startWorkDate.substring(0, 7) : "";

        Set<String> allMonthKeys = new TreeSet<>(Comparator.reverseOrder());
        if (eventsByMonth != null) {
            allMonthKeys.addAll(eventsByMonth.keySet());
        }
        if (userOverrides != null) {
            for (String dateKey : userOverrides.keySet()) {
                if (dateKey != null && dateKey.length() >= 7) {
                    allMonthKeys.add(dateKey.substring(0, 7));
                }
            }
        }
        if (!startWorkMonthKey.isEmpty() && startWorkMonthKey.compareTo(todayMonthKey) <= 0) {
            allMonthKeys.add(startWorkMonthKey);
        }
        if (startWorkDate.isEmpty() || todayStr.compareTo(startWorkDate) >= 0) {
            allMonthKeys.add(todayMonthKey);
        }

        for (String monthKey : allMonthKeys) {
            if (!startWorkMonthKey.isEmpty() && monthKey.compareTo(startWorkMonthKey) < 0) {
                continue;
            }
            List<TrackerEvent> events = (eventsByMonth != null && eventsByMonth.get(monthKey) != null)
                    ? eventsByMonth.get(monthKey)
                    : Collections.emptyList();

            Map<String, List<TrackerEvent>> dayMap = new HashMap<>();
            for (TrackerEvent ev : events) {
                if (ev == null || ev.timestamp() == null || ev.timestamp().length() < 10) continue;
                String dateStr = ev.timestamp().substring(0, 10);
                if (!startWorkDate.isEmpty() && dateStr.compareTo(startWorkDate) < 0) continue;
                dayMap.computeIfAbsent(dateStr, k -> new ArrayList<>()).add(ev);
            }

            Set<String> allDatesSet = new TreeSet<>(Comparator.reverseOrder());
            boolean isCurrentOrPastMonth = monthKey.compareTo(todayMonthKey) <= 0;

            for (String dKey : dayMap.keySet()) {
                if (!startWorkDate.isEmpty() && dKey.compareTo(startWorkDate) < 0) continue;
                if (!isCurrentOrPastMonth || dKey.compareTo(todayStr) <= 0) {
                    allDatesSet.add(dKey);
                }
            }
            if (userOverrides != null) {
                for (String oKey : userOverrides.keySet()) {
                    if (oKey == null) continue;
                    if (!startWorkDate.isEmpty() && oKey.compareTo(startWorkDate) < 0) continue;
                    if (oKey.startsWith(monthKey)) {
                        allDatesSet.add(oKey);
                    }
                }
            }

            try {
                YearMonth ym = YearMonth.parse(monthKey);
                for (int d = 1; d <= ym.lengthOfMonth(); d++) {
                    LocalDate candidate = ym.atDay(d);
                    String candidateStr = candidate.toString();
                    if (!startWorkDate.isEmpty() && candidateStr.compareTo(startWorkDate) < 0) {
                        continue;
                    }
                    if (candidateStr.compareTo(todayStr) > 0) {
                        continue;
                    }
                    allDatesSet.add(candidateStr);
                }
            } catch (Exception ignored) {
            }

            List<DaySummary> daySummaries = new ArrayList<>();
            long monthTotalSeconds = 0;
            int activeDaysCount = 0;
            int vacationDaysCount = 0;
            int expectedWorkDaysCount = 0;
            List<Long> startSecondsList = new ArrayList<>();
            List<Long> endSecondsList = new ArrayList<>();

            for (String dateStr : allDatesSet) {
                List<TrackerEvent> dayEvents = new ArrayList<>(dayMap.getOrDefault(dateStr, Collections.emptyList()));
                dayEvents.sort(Comparator.comparing(TrackerEvent::timestamp));

                TrackerEvent firstStartup = dayEvents.stream().filter(WorkSummaryCalculator::isStartEvent).findFirst().orElse(null);
                List<TrackerEvent> shutdowns = dayEvents.stream().filter(WorkSummaryCalculator::isEndEvent).toList();
                TrackerEvent lastShutdown = shutdowns.isEmpty() ? null : shutdowns.get(shutdowns.size() - 1);

                DayOverride dayOverride = userOverrides != null ? userOverrides.get(dateStr) : null;
                boolean isVacation = dayOverride != null && Boolean.TRUE.equals(dayOverride.vacation());
                if (isVacation) {
                    vacationDaysCount++;
                }

                String overrideStart = (dayOverride != null && dayOverride.start() != null && !dayOverride.start().isBlank())
                        ? normalize24hTime(dayOverride.start())
                        : null;
                String overrideEnd = (dayOverride != null && dayOverride.end() != null && !dayOverride.end().isBlank())
                        ? normalize24hTime(dayOverride.end())
                        : null;

                List<CustomBreak> customBreaks = new ArrayList<>();
                if (dayOverride != null && dayOverride.breaks() != null) {
                    for (CustomBreak b : dayOverride.breaks()) {
                        if (b != null && b.start() != null && !b.start().isBlank() && b.end() != null && !b.end().isBlank()) {
                            String icon = (b.icon() != null && !b.icon().isBlank()) ? b.icon().trim() : "coffee";
                            customBreaks.add(new CustomBreak(normalize24hTime(b.start()), normalize24hTime(b.end()), icon));
                        }
                    }
                }

                boolean isStartOverridden = overrideStart != null;
                boolean isEndOverridden = overrideEnd != null;

                String effectiveStartTimestamp = overrideStart != null
                        ? (dateStr + " " + (overrideStart.length() == 5 ? overrideStart + ":00" : overrideStart))
                        : (firstStartup != null ? firstStartup.timestamp() : null);

                String effectiveEndTimestamp = overrideEnd != null
                        ? (dateStr + " " + (overrideEnd.length() == 5 ? overrideEnd + ":00" : overrideEnd))
                        : (lastShutdown != null ? lastShutdown.timestamp() : null);

                LocalDate dateObj = LocalDate.parse(dateStr);
                DayOfWeek dow = dateObj.getDayOfWeek();
                boolean isWeekend = (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY);
                String dayOfWeek = dow.getDisplayName(TextStyle.SHORT, Locale.US);
                String dayOfWeekFull = dow.getDisplayName(TextStyle.FULL, Locale.US);
                String formattedDate = dateObj.format(FORMATTED_DATE_FMT);

                long grossDurationSeconds = 0;
                long lunchDeductedSeconds = 0;
                long customBreaksDeductedSeconds = 0;
                long durationSeconds = 0;
                String status = isVacation ? "vacation" : "no_startup";

                if (effectiveStartTimestamp != null && effectiveEndTimestamp != null) {
                    LocalDateTime startDt = parseDateTime(effectiveStartTimestamp);
                    LocalDateTime endDt = parseDateTime(effectiveEndTimestamp);
                    if (startDt != null && endDt != null && endDt.isAfter(startDt)) {
                        grossDurationSeconds = Duration.between(startDt, endDt).getSeconds();
                        BreakDeductions deductions = calculateBreakDeductions(dateObj, startDt, endDt, lunchConfig, customBreaks);
                        lunchDeductedSeconds = deductions.lunchDeductedSeconds();
                        customBreaksDeductedSeconds = deductions.customBreaksDeductedSeconds();
                        durationSeconds = Math.max(0, grossDurationSeconds - deductions.totalDeductedSeconds());
                        status = isVacation ? "vacation" : "completed";
                    } else {
                        durationSeconds = 0;
                        status = isVacation ? "vacation" : "completed";
                    }
                } else if (effectiveStartTimestamp != null) {
                    if (dateStr.equals(todayStr)) {
                        LocalDateTime startDt = parseDateTime(effectiveStartTimestamp);
                        LocalDateTime nowDt = LocalDateTime.now();
                        if (startDt != null) {
                            LocalDateTime effectiveNow = nowDt.isAfter(startDt) ? nowDt : startDt;
                            grossDurationSeconds = Math.max(0, Duration.between(startDt, effectiveNow).getSeconds());
                            BreakDeductions deductions = calculateBreakDeductions(dateObj, startDt, effectiveNow, lunchConfig, customBreaks);
                            lunchDeductedSeconds = deductions.lunchDeductedSeconds();
                            customBreaksDeductedSeconds = deductions.customBreaksDeductedSeconds();
                            durationSeconds = Math.max(0, grossDurationSeconds - deductions.totalDeductedSeconds());
                        }
                        status = "in_progress";
                    } else {
                        status = "no_shutdown";
                    }
                }

                boolean isTodayOrFuture = dateStr.compareTo(todayStr) >= 0;
                if (!isTodayOrFuture) {
                    if (durationSeconds > 0) {
                        monthTotalSeconds += durationSeconds;
                    }
                    if (firstStartup != null || isStartOverridden) {
                        activeDaysCount++;
                    }
                    if (!isWeekend && !isVacation) {
                        expectedWorkDaysCount++;
                    }
                    if (effectiveStartTimestamp != null) {
                        LocalDateTime stDt = parseDateTime(effectiveStartTimestamp);
                        if (stDt != null) {
                            startSecondsList.add((long) stDt.toLocalTime().toSecondOfDay());
                        }
                    }
                    if (effectiveEndTimestamp != null) {
                        LocalDateTime enDt = parseDateTime(effectiveEndTimestamp);
                        if (enDt != null) {
                            endSecondsList.add((long) enDt.toLocalTime().toSecondOfDay());
                        }
                    }
                }

                boolean hasStart = effectiveStartTimestamp != null;
                String lunchWindow = (hasStart && lunchConfig != null)
                        ? (lunchConfig.defaultLunchStart() + " – " + lunchConfig.defaultLunchEnd())
                        : "—";

                String startWorkTime = overrideStart != null
                        ? (overrideStart.length() >= 5 ? overrideStart.substring(0, 5) : overrideStart)
                        : (firstStartup != null
                        ? formatTime(firstStartup.timestamp()).substring(0, Math.min(5, formatTime(firstStartup.timestamp()).length()))
                        : "—");

                String endWorkTime = overrideEnd != null
                        ? (overrideEnd.length() >= 5 ? overrideEnd.substring(0, 5) : overrideEnd)
                        : (lastShutdown != null
                        ? formatTime(lastShutdown.timestamp()).substring(0, Math.min(5, formatTime(lastShutdown.timestamp()).length()))
                        : ("in_progress".equals(status) ? "In Progress" : "—"));

                long dayExpectedSeconds = (isWeekend || isVacation || dateStr.compareTo(todayStr) > 0)
                        ? 0
                        : Math.round(hoursPerDay * 3600);
                long dayBalanceSeconds = durationSeconds - dayExpectedSeconds;
                int sessionCount = (int) dayEvents.stream().filter(WorkSummaryCalculator::isStartEvent).count();

                daySummaries.add(new DaySummary(
                        dateStr,
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
                        formatDuration(customBreaksDeductedSeconds),
                        grossDurationSeconds,
                        lunchDeductedSeconds,
                        formatDuration(lunchDeductedSeconds),
                        durationSeconds,
                        formatDuration(durationSeconds),
                        dayExpectedSeconds,
                        dayBalanceSeconds,
                        formatSignedBalance(dayBalanceSeconds),
                        status,
                        dayEvents,
                        sessionCount
                ));
            }

            double avgStartSeconds = startSecondsList.isEmpty()
                    ? -1
                    : startSecondsList.stream().mapToLong(Long::longValue).average().orElse(-1);
            double avgEndSeconds = endSecondsList.isEmpty()
                    ? -1
                    : endSecondsList.stream().mapToLong(Long::longValue).average().orElse(-1);

            long expectedWorkSeconds = Math.round(expectedWorkDaysCount * hoursPerDay * 3600);
            long workBalanceSeconds = monthTotalSeconds - expectedWorkSeconds;

            result.put(monthKey, new MonthSummary(
                    monthKey,
                    getMonthLabel(monthKey),
                    daySummaries,
                    monthTotalSeconds,
                    formatDuration(monthTotalSeconds),
                    expectedWorkDaysCount,
                    expectedWorkSeconds,
                    formatDuration(expectedWorkSeconds),
                    workBalanceSeconds,
                    formatSignedBalance(workBalanceSeconds),
                    activeDaysCount,
                    vacationDaysCount,
                    formatAverageSecondsToTime(avgStartSeconds),
                    formatAverageSecondsToTime(avgEndSeconds)
            ));
        }

        return result;
    }

    public OverallSaldoSummary calculateOverallSaldo(Collection<MonthSummary> months) {
        long totalWorkSeconds = 0;
        int expectedWorkDaysCount = 0;
        long expectedWorkSeconds = 0;
        int activeDaysCount = 0;
        int vacationDaysCount = 0;

        if (months != null) {
            for (MonthSummary m : months) {
                totalWorkSeconds += m.totalWorkSeconds();
                expectedWorkDaysCount += m.expectedWorkDaysCount();
                expectedWorkSeconds += m.expectedWorkSeconds();
                activeDaysCount += m.activeDaysCount();
                vacationDaysCount += m.vacationDaysCount();
            }
        }

        long workBalanceSeconds = totalWorkSeconds - expectedWorkSeconds;
        int monthsCount = months != null ? months.size() : 0;

        return new OverallSaldoSummary(
                monthsCount,
                totalWorkSeconds,
                formatDuration(totalWorkSeconds),
                expectedWorkDaysCount,
                expectedWorkSeconds,
                formatDuration(expectedWorkSeconds),
                workBalanceSeconds,
                formatSignedBalance(workBalanceSeconds),
                activeDaysCount,
                vacationDaysCount
        );
    }

    public String exportMonthToCsv(MonthSummary summary) {
        StringBuilder sb = new StringBuilder();
        sb.append("Date,Weekday,Start,Lunch Break,End,Lunch Deducted,Net Duration,Daily Saldo,Sessions,Status\n");
        if (summary != null && summary.days() != null) {
            for (DaySummary d : summary.days()) {
                sb.append('"').append(d.date()).append("\",")
                  .append('"').append(d.dayOfWeekFull()).append("\",")
                  .append('"').append(d.startWorkTime()).append("\",")
                  .append('"').append(d.lunchWindow()).append("\",")
                  .append('"').append(d.endWorkTime()).append("\",")
                  .append('"').append(d.lunchDeductedFormatted()).append("\",")
                  .append('"').append(d.durationFormatted()).append("\",")
                  .append('"').append(d.workBalanceFormatted()).append("\",")
                  .append('"').append(d.allEvents() != null ? d.allEvents().size() : 0).append("\",")
                  .append('"').append(d.status()).append("\"\n");
            }
        }
        return sb.toString();
    }
}

