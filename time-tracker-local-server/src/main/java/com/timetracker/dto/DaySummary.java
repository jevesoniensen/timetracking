package com.timetracker.dto;

import java.util.List;

public record DaySummary(
        String date,
        String dayOfWeek,
        String dayOfWeekFull,
        String formattedDate,
        boolean isWeekend,
        boolean isVacation,
        TrackerEvent firstStartup,
        TrackerEvent lastShutdown,
        String effectiveStartTimestamp,
        String effectiveEndTimestamp,
        String startWorkTime,
        String endWorkTime,
        boolean isStartOverridden,
        boolean isEndOverridden,
        String lunchWindow,
        List<CustomBreak> customBreaks,
        long customBreaksDeductedSeconds,
        String customBreaksDeductedFormatted,
        long grossDurationSeconds,
        long lunchDeductedSeconds,
        String lunchDeductedFormatted,
        long durationSeconds,
        String durationFormatted,
        long expectedWorkSeconds,
        long workBalanceSeconds,
        String workBalanceFormatted,
        String status,
        List<TrackerEvent> allEvents,
        int sessionCount
) {}

