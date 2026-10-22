package com.timetracker.service;

import com.timetracker.dto.LunchConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Properties;

@Service
public class ConfigManager {

    private static final Logger log = LoggerFactory.getLogger(ConfigManager.class);

    private final FileSytemService fileSytemService;

    @Value("${lunch.default.start:12:30}")
    private String fallbackLunchStart;

    @Value("${lunch.default.end:13:30}")
    private String fallbackLunchEnd;

    @Value("${work.default.hours.per.day:8}")
    private double fallbackWorkHoursPerDay;

    @Value("${work.start.date:}")
    private String fallbackStartWorkDate;

    public ConfigManager(FileSytemService fileSytemService) {
        this.fileSytemService = fileSytemService;
    }

    public LunchConfig loadLunchConfig() {
        return fileSytemService.loadConfigProperties()
                .map(this::toLunchConfig)
                .orElseGet(this::getDefaultLunchConfig);
    }

    private LunchConfig toLunchConfig(Properties props) {
        return new LunchConfig(
                getValueOrDefault(props.getProperty("lunch.default.start"), fallbackLunchStart),
                getValueOrDefault(props.getProperty("lunch.default.end"), fallbackLunchEnd),
                getDoubleValueOrDefault(props.getProperty("work.default.hours.per.day"), fallbackWorkHoursPerDay),
                getValueOrDefault(props.getProperty("work.start.date"), fallbackStartWorkDate)
        );
    }

    private double getDoubleValueOrDefault(String value, double defaultValue) {
        if (value != null && !value.isBlank()) {
            try {
                return Double.parseDouble(value.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return defaultValue;
    }

    private String getValueOrDefault(String value, String defaultValue) {
        if (value != null && !value.isBlank()) {
            return value.trim();
        }
        return defaultValue;
    }

    private LunchConfig getDefaultLunchConfig() {
        log.info("Using default config (no external config.properties found): lunchStart={}, lunchEnd={}, hoursPerDay={}, startWorkDate={}", fallbackLunchStart, fallbackLunchEnd, fallbackWorkHoursPerDay, fallbackStartWorkDate);
        return new LunchConfig(fallbackLunchStart, fallbackLunchEnd, fallbackWorkHoursPerDay, fallbackStartWorkDate);
    }

    public synchronized void saveStartWorkDate(String startWorkDate) throws IOException {
        String cleanDate = startWorkDate != null ? startWorkDate.trim() : "";
        fileSytemService.saveStartWorkDateToConfig(cleanDate, fallbackLunchStart, fallbackLunchEnd, fallbackWorkHoursPerDay);
        this.fallbackStartWorkDate = cleanDate;
    }

    public void setFallbackStartWorkDate(String fallbackStartWorkDate) {
        this.fallbackStartWorkDate = fallbackStartWorkDate;
    }
}
