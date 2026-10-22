package com.timetracker.dto;

import java.util.List;
import java.util.Map;

public record EventsResponse(
        List<String> months,
        Map<String, List<TrackerEvent>> eventsByMonth,
        LunchConfig lunchConfig,
        Map<String, DayOverride> userOverrides
) {}

