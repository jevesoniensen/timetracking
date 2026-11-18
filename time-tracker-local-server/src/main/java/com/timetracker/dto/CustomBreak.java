package com.timetracker.dto;

public record CustomBreak(String start, String end, String icon) {
    public CustomBreak(String start, String end) {
        this(start, end, null);
    }
}
