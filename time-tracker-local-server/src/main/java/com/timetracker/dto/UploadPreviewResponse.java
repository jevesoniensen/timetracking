package com.timetracker.dto;

import java.util.List;

public record UploadPreviewResponse(
        String kind,
        List<String> months,
        int totalCount,
        int dayCount
) {}

