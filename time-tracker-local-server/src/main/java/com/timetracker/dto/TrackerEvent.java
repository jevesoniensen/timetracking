package com.timetracker.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TrackerEvent(
        @JsonProperty("name") String name,
        @JsonProperty("timestamp") String timestamp,
        @JsonProperty("type") String type
) {
    @JsonCreator
    public TrackerEvent(
            @JsonProperty("name") String name,
            @JsonProperty("timestamp") String timestamp,
            @JsonProperty("type") String type
    ) {
        this.name = name;
        this.timestamp = timestamp;
        this.type = type != null && !type.isBlank() ? type.trim().toUpperCase() : inferType(name);
    }

    public TrackerEvent(String name, String timestamp) {
        this(name, timestamp, inferType(name));
    }

    public static String inferType(String name) {
        if (name == null) return null;
        String upper = name.toUpperCase();
        if (upper.contains("START") || upper.contains("LOGON") || upper.contains("RESUME") || upper.contains("WAKE")) {
            return "START";
        }
        if (upper.contains("SHUTDOWN") || upper.contains("LOGOFF") || upper.contains("SLEEP")) {
            return "END";
        }
        return null;
    }
}
