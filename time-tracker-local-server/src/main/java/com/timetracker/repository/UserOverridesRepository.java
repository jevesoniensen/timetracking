package com.timetracker.repository;

import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.timetracker.dto.DayOverride;

@Component
public class UserOverridesRepository {

    private static final Logger log = LoggerFactory.getLogger(UserOverridesRepository.class);

    private final FileSytemService fileSytemService;

    public UserOverridesRepository(FileSytemService fileSytemService) {
        this.fileSytemService = fileSytemService;
    }

    public Path resolveUserOverridesDir() {
        return fileSytemService.resolveUserOverridesDir();
    }

    public Path resolveUserOverridesFileForMonth(String monthKey) {
        return resolveUserOverridesDir().resolve("user-overrides-" + monthKey + ".json");
    }

    public synchronized Map<String, DayOverride> readUserOverridesForMonth(String monthKey) {
        Path file = resolveUserOverridesFileForMonth(monthKey);
        return fileSytemService.loadJson(file, new TypeReference<Map<String, DayOverride>>() {})
                .map(TreeMap::new)
                .orElseGet(TreeMap::new);
    }

    public synchronized Map<String, DayOverride> readAllUserOverrides() {
        Map<String, DayOverride> allOverrides = new TreeMap<>();
        Path overridesDir = resolveUserOverridesDir();

        fileSytemService.readFolderFiles(overridesDir, "user-overrides-*.json").forEach(fn -> {
            Path file = overridesDir.resolve(fn);
            fileSytemService.loadJson(file, new TypeReference<Map<String, DayOverride>>() {})
                    .ifPresent(allOverrides::putAll);
        });

        return allOverrides;
    }

    public synchronized void writeUserOverridesForMonth(String monthKey, Map<String, DayOverride> monthOverrides) {
        Path file = resolveUserOverridesFileForMonth(monthKey);
        if (monthOverrides == null || monthOverrides.isEmpty()) {
            fileSytemService.deleteFile(file);
            log.info("Removed empty user overrides file {}", file);
            return;
        }
        fileSytemService.storeJson(file, monthOverrides);
        log.info("Saved {} user overrides for month {} to {}", monthOverrides.size(), monthKey, file);
    }

    public synchronized void deleteUserOverridesForMonth(String monthKey) {
        Path file = resolveUserOverridesFileForMonth(monthKey);
        fileSytemService.deleteFile(file);
    }

    public synchronized void clearAllOverrideFiles() {
        Path overridesDir = resolveUserOverridesDir();
        fileSytemService.readFolderFiles(overridesDir, "user-overrides-*.json")
                .forEach(fn -> fileSytemService.deleteFile(overridesDir.resolve(fn)));
    }
}

