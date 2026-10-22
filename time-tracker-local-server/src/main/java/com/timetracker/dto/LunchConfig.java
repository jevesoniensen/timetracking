package com.timetracker.dto;

public record LunchConfig(
        String defaultLunchStart,
        String defaultLunchEnd,
        double defaultWorkHoursPerDay,
        String startWorkDate
) {}

