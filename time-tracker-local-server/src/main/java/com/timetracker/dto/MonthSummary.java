package com.timetracker.dto;

import java.util.List;

public record MonthSummary(
        String monthKey,
        String monthLabel,
        List<DaySummary> days,
        long totalWorkSeconds,
        String totalWorkFormatted,
        int expectedWorkDaysCount,
        long expectedWorkSeconds,
        String expectedWorkFormatted,
        long workBalanceSeconds,
        String workBalanceFormatted,
        int activeDaysCount,
        int vacationDaysCount,
        String avgStartWork,
        String avgEndWork
) {}

