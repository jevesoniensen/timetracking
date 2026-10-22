package com.timetracker.dto;

import java.util.List;

public record DayOverride(
        String start,
        String end,
        List<CustomBreak> breaks,
        Boolean vacation
) {}

