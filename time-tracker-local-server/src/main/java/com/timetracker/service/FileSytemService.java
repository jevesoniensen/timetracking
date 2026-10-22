package com.timetracker.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.timetracker.dto.DayOverride;
import com.timetracker.dto.TrackerEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Service
public class FileSytemService {

    private static final Logger log = LoggerFactory.getLogger(FileSytemService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FileSytemService() {
    }

    // ---------------------------------------------------------
    // Configuration File Access
    // ---------------------------------------------------------

    public Path resolveConfigFile() {
        String envFile = System.getenv("TIME_TRACKER_CONFIG_FILE");
        if (envFile != null && !envFile.isBlank()) {
            Path p = Paths.get(envFile);
            if (Files.isRegularFile(p)) {
                return p.toAbsolutePath().normalize();
            }
        }

        List<Path> candidates = List.of(
                Paths.get("config.properties"),
                Paths.get("target/debug/config.properties"),
                Paths.get("target/release/config.properties"),
                Paths.get("../time_tracker_app/target/debug/config.properties"),
                Paths.get("../time_tracker_app/target/release/config.properties"),
                Paths.get("../time_tracker_app/config.properties"),
                Paths.get("../../time_tracker_app/target/debug/config.properties"),
                Paths.get("../../time_tracker_app/config.properties")
        );

        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath().normalize();
            }
        }

        return Paths.get("config.properties").toAbsolutePath().normalize();
    }

    public Optional<Properties> loadConfigProperties() {
        Path configPath = resolveConfigFile();
        if (Files.isRegularFile(configPath)) {
            log.info("Loading config from: {}", configPath.toAbsolutePath());
            Properties props = new Properties();
            try (InputStream in = Files.newInputStream(configPath)) {
                props.load(in);
                return Optional.of(props);
            } catch (IOException e) {
                log.warn("Failed to read config.properties from {}: {}", configPath, e.getMessage());
            }
        }
        return Optional.empty();
    }

    public synchronized void saveStartWorkDateToConfig(
            String cleanDate,
            String defaultLunchStart,
            String defaultLunchEnd,
            double defaultHoursPerDay
    ) throws IOException {
        Path configPath = resolveConfigFile();

        if (Files.isRegularFile(configPath)) {
            List<String> lines = Files.readAllLines(configPath);
            List<String> updatedLines = new ArrayList<>();
            boolean found = false;
            for (String line : lines) {
                if (line.trim().startsWith("work.start.date")) {
                    updatedLines.add("work.start.date=" + cleanDate);
                    found = true;
                } else {
                    updatedLines.add(line);
                }
            }
            if (!found) {
                if (!updatedLines.isEmpty() && !updatedLines.get(updatedLines.size() - 1).isEmpty()) {
                    updatedLines.add("");
                }
                updatedLines.add("# Start work date (YYYY-MM-DD). Leave empty to be prompted on first app startup.");
                updatedLines.add("work.start.date=" + cleanDate);
            }
            Files.write(configPath, updatedLines);
        } else {
            List<String> lines = List.of(
                    "# Time Tracker Configuration",
                    "# Default lunch break start and end times (24-hour HH:mm format)",
                    "# The overlapping portion with the work interval is deducted from daily worked hours.",
                    "lunch.default.start=" + defaultLunchStart,
                    "lunch.default.end=" + defaultLunchEnd,
                    "",
                    "# Default expected working hours per day",
                    "work.default.hours.per.day=" + defaultHoursPerDay,
                    "",
                    "# Start work date (YYYY-MM-DD). Leave empty to be prompted on first app startup.",
                    "work.start.date=" + cleanDate
            );
            if (configPath.getParent() != null && !Files.exists(configPath.getParent())) {
                Files.createDirectories(configPath.getParent());
            }
            Files.write(configPath, lines);
        }
        log.info("Saved work.start.date={} to {}", cleanDate, configPath);
    }

    // ---------------------------------------------------------
    // Events Directory & File Access
    // ---------------------------------------------------------

    public Path resolveEventsDir() {
        String envDir = System.getenv("TIME_TRACKER_EVENTS_DIR");
        if (envDir != null && !envDir.isBlank()) {
            Path p = Paths.get(envDir);
            if (Files.isDirectory(p)) {
                return p.toAbsolutePath().normalize();
            }
        }

        List<Path> candidates = List.of(
                Paths.get("events"),
                Paths.get("target/debug/events"),
                Paths.get("target/release/events"),
                Paths.get("../time_tracker_app/target/debug/events"),
                Paths.get("../time_tracker_app/target/release/events"),
                Paths.get("../../time_tracker_app/target/debug/events")
        );

        for (Path candidate : candidates) {
            if (Files.isDirectory(candidate)) {
                return candidate.toAbsolutePath().normalize();
            }
        }

        return Paths.get("events").toAbsolutePath().normalize();
    }

    public Path resolveSyncStateFile() {
        Path eventsDir = resolveEventsDir();
        Path parent = eventsDir.getParent();
        return (parent != null ? parent : eventsDir).resolve("sync_state.json");
    }

    public synchronized Optional<String> readSyncState() {
        Path syncStateFile = resolveSyncStateFile();
        if (Files.isRegularFile(syncStateFile)) {
            try {
                JsonNode stateNode = objectMapper.readTree(syncStateFile.toFile());
                if (stateNode.has("last_timestamp") && !stateNode.get("last_timestamp").isNull()) {
                    String ts = stateNode.get("last_timestamp").asText();
                    if (ts != null && !ts.isBlank()) {
                        return Optional.of(ts.trim());
                    }
                }
            } catch (Exception e) {
                log.debug("Could not read last_timestamp from {}: {}", syncStateFile, e.getMessage());
            }
        }
        return Optional.empty();
    }

    public synchronized void writeSyncState(String lastTimestamp) throws IOException {
        Path syncStateFile = resolveSyncStateFile();
        if (syncStateFile.getParent() != null && !Files.exists(syncStateFile.getParent())) {
            Files.createDirectories(syncStateFile.getParent());
        }
        Map<String, String> stateMap = Collections.singletonMap("last_timestamp", lastTimestamp);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(syncStateFile.toFile(), stateMap);
    }

    public synchronized Map<String, List<TrackerEvent>> readAllEventFiles() {
        Map<String, List<TrackerEvent>> map = new TreeMap<>(Comparator.reverseOrder());
        Path eventsDir = resolveEventsDir();
        log.info("Reading events from: {}", eventsDir);

        if (Files.isDirectory(eventsDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(eventsDir, "events-*.json")) {
                for (Path entry : stream) {
                    String fileName = entry.getFileName().toString();
                    String monthKey = fileName.replace("events-", "").replace(".json", "");
                    try {
                        byte[] bytes = Files.readAllBytes(entry);
                        List<TrackerEvent> events = objectMapper.readValue(bytes, new TypeReference<>() {});
                        if (events != null && !events.isEmpty()) {
                            events.sort(Comparator.comparing(TrackerEvent::timestamp));
                            map.put(monthKey, events);
                        }
                    } catch (Exception ex) {
                        log.error("Failed to read events from file {}: {}", entry, ex.getMessage());
                    }
                }
            } catch (IOException e) {
                log.error("Failed to read events directory: {}", e.getMessage());
            }
        }
        return map;
    }

    public synchronized List<TrackerEvent> readEventsForMonth(String monthKey) {
        Path eventsDir = resolveEventsDir();
        Path monthFile = eventsDir.resolve("events-" + monthKey + ".json");
        if (Files.isRegularFile(monthFile)) {
            try {
                byte[] bytes = Files.readAllBytes(monthFile);
                List<TrackerEvent> events = objectMapper.readValue(bytes, new TypeReference<>() {});
                if (events != null) {
                    events.sort(Comparator.comparing(TrackerEvent::timestamp));
                    return events;
                }
            } catch (Exception e) {
                log.warn("Failed reading events from {}: {}", monthFile, e.getMessage());
            }
        }
        return new ArrayList<>();
    }

    public synchronized void writeEventsForMonth(String monthKey, List<TrackerEvent> events) throws IOException {
        Path eventsDir = resolveEventsDir();
        if (!Files.exists(eventsDir)) {
            Files.createDirectories(eventsDir);
        }
        Path targetFile = eventsDir.resolve("events-" + monthKey + ".json");
        if (events == null || events.isEmpty()) {
            Files.deleteIfExists(targetFile);
            return;
        }
        List<TrackerEvent> sorted = new ArrayList<>(events);
        sorted.sort(Comparator.comparing(TrackerEvent::timestamp));
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(targetFile.toFile(), sorted);
    }

    public synchronized void clearAllEventFiles() throws IOException {
        Path eventsDir = resolveEventsDir();
        if (Files.isDirectory(eventsDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(eventsDir, "events-*.json")) {
                for (Path entry : stream) {
                    Files.deleteIfExists(entry);
                }
            }
        }
    }

    // ---------------------------------------------------------
    // User Overrides Directory & File Access
    // ---------------------------------------------------------

    public Path resolveUserOverridesDir() {
        String envDir = System.getenv("TIME_TRACKER_OVERRIDES_DIR");
        if (envDir != null && !envDir.isBlank()) {
            return Paths.get(envDir).toAbsolutePath().normalize();
        }
        Path eventsDir = resolveEventsDir().toAbsolutePath().normalize();
        Path parentDir = eventsDir.getParent();
        return (parentDir != null ? parentDir : eventsDir).resolve("overrides");
    }

    public Path resolveUserOverridesFileForMonth(String monthKey) {
        return resolveUserOverridesDir().resolve("user-overrides-" + monthKey + ".json");
    }

    public synchronized Map<String, DayOverride> readUserOverridesForMonth(String monthKey) {
        Path file = resolveUserOverridesFileForMonth(monthKey);
        if (Files.isRegularFile(file)) {
            try {
                byte[] bytes = Files.readAllBytes(file);
                Map<String, DayOverride> map = objectMapper.readValue(bytes, new TypeReference<>() {});
                return new TreeMap<>(map);
            } catch (Exception e) {
                log.warn("Failed to read user overrides for month {} from {}: {}", monthKey, file, e.getMessage());
            }
        }
        return new TreeMap<>();
    }

    public synchronized Map<String, DayOverride> readAllUserOverrides() {
        Map<String, DayOverride> allOverrides = new TreeMap<>();
        Path overridesDir = resolveUserOverridesDir();
        if (Files.isDirectory(overridesDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(overridesDir, "user-overrides-*.json")) {
                for (Path entry : stream) {
                    try {
                        byte[] bytes = Files.readAllBytes(entry);
                        Map<String, DayOverride> monthMap = objectMapper.readValue(bytes, new TypeReference<>() {});
                        if (monthMap != null) {
                            allOverrides.putAll(monthMap);
                        }
                    } catch (Exception e) {
                        log.warn("Failed to read user overrides from {}: {}", entry, e.getMessage());
                    }
                }
            } catch (IOException e) {
                log.warn("Failed to list overrides directory {}: {}", overridesDir, e.getMessage());
            }
        }
        return allOverrides;
    }

    public synchronized void writeUserOverridesForMonth(String monthKey, Map<String, DayOverride> monthOverrides) throws IOException {
        Path file = resolveUserOverridesFileForMonth(monthKey);
        if (monthOverrides == null || monthOverrides.isEmpty()) {
            Files.deleteIfExists(file);
            log.info("Removed empty user overrides file {}", file);
            return;
        }
        if (file.getParent() != null && !Files.exists(file.getParent())) {
            Files.createDirectories(file.getParent());
        }
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), monthOverrides);
        log.info("Saved {} user overrides for month {} to {}", monthOverrides.size(), monthKey, file);
    }

    public synchronized void deleteUserOverridesForMonth(String monthKey) throws IOException {
        Path file = resolveUserOverridesFileForMonth(monthKey);
        Files.deleteIfExists(file);
    }

    public synchronized void clearAllOverrideFiles() throws IOException {
        Path overridesDir = resolveUserOverridesDir();
        if (Files.isDirectory(overridesDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(overridesDir, "user-overrides-*.json")) {
                for (Path entry : stream) {
                    Files.deleteIfExists(entry);
                }
            }
        }
    }
}
