package com.timetracker.dto;

public record OverallSaldoSummary(
        int monthsCount,
        long totalWorkSeconds,
        String totalWorkFormatted,
        int expectedWorkDaysCount,
        long expectedWorkSeconds,
        String expectedWorkFormatted,
        long workBalanceSeconds,
        String workBalanceFormatted,
        int activeDaysCount,
        int vacationDaysCount
) {}

