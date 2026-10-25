package com.timetracker.service;

import com.timetracker.dto.LunchConfig;
import com.timetracker.repository.FileSytemService;

import jakarta.annotation.PostConstruct;
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

    /** At application start up, creates the config file with the default properties if it does not exist. */
    @PostConstruct
    void initDefaultConfig() {
        Properties defaults = new Properties();
        defaults.setProperty("lunch.default.start", fallbackLunchStart);
        defaults.setProperty("lunch.default.end", fallbackLunchEnd);
        defaults.setProperty("work.default.hours.per.day", String.valueOf(fallbackWorkHoursPerDay));
        defaults.setProperty("work.start.date", fallbackStartWorkDate);
        try {
            if (fileSytemService.storePropertiesIfAbsent(defaults)) {
                log.info("Created default config file at {}", fileSytemService.resolveConfigFile());
            }
        } catch (IOException e) {
            log.warn("Failed to create default config file: {}", e.getMessage());
        }
    }

    public LunchConfig loadLunchConfig() {
        return fileSytemService.loadProperties()
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
        fileSytemService.setConfigProperty("work.start.date", cleanDate);
        this.fallbackStartWorkDate = cleanDate;
    }

    public void setFallbackStartWorkDate(String fallbackStartWorkDate) {
        this.fallbackStartWorkDate = fallbackStartWorkDate;
    }
}
