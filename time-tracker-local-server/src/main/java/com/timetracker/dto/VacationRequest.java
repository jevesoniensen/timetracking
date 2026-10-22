package com.timetracker.dto;

public record VacationRequest(
        String startDate,
        String endDate,
        Boolean excludeWeekends,
        Boolean vacation
) {}

