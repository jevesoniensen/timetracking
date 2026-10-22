package com.timetracker.dto;

import java.util.List;

public record OverrideRequest(
        String date,
        String start,
        String end,
        List<CustomBreak> breaks,
        Boolean vacation
) {}

