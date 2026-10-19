package com.timetracker;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class EventController {

    private static final Logger log = LoggerFactory.getLogger(EventController.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${lunch.default.start:12:30}")
    private String fallbackLunchStart;

    @Value("${lunch.default.end:13:30}")
    private String fallbackLunchEnd;

    @Value("${work.default.hours.per.day:8}")
    private double fallbackWorkHoursPerDay;

    public record TrackerEvent(String name, String timestamp) {}

    public record LunchConfig(String defaultLunchStart, String defaultLunchEnd, double defaultWorkHoursPerDay) {}

    public record CustomBreak(String start, String end) {}

    public record DayOverride(String start, String end, List<CustomBreak> breaks) {}

    public record OverrideRequest(String date, String start, String end, List<CustomBreak> breaks) {}

    public record EventsResponse(
            List<String> months,
            Map<String, List<TrackerEvent>> eventsByMonth,
            LunchConfig lunchConfig,
            Map<String, DayOverride> userOverrides
    ) {}

    private Path resolveConfigFile() {
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

    private LunchConfig loadLunchConfig() {
        String start = fallbackLunchStart != null ? fallbackLunchStart.trim() : "12:30";
        String end = fallbackLunchEnd != null ? fallbackLunchEnd.trim() : "13:30";
        double hoursPerDay = fallbackWorkHoursPerDay > 0 ? fallbackWorkHoursPerDay : 8.0;

        Path configPath = resolveConfigFile();
        if (Files.isRegularFile(configPath)) {
            Properties props = new Properties();
            try (InputStream in = Files.newInputStream(configPath)) {
                props.load(in);
                String propStart = props.getProperty("lunch.default.start");
                String propEnd = props.getProperty("lunch.default.end");
                String propHours = props.getProperty("work.default.hours.per.day");
                if (propStart != null && !propStart.isBlank()) {
                    start = propStart.trim();
                }
                if (propEnd != null && !propEnd.isBlank()) {
                    end = propEnd.trim();
                }
                if (propHours != null && !propHours.isBlank()) {
                    try {
                        double parsed = Double.parseDouble(propHours.trim());
                        if (parsed > 0) {
                            hoursPerDay = parsed;
                        }
                    } catch (NumberFormatException ignored) {
                    }
                }
                log.info("Loaded config from {}: lunchStart={}, lunchEnd={}, hoursPerDay={}", configPath, start, end, hoursPerDay);
            } catch (IOException e) {
                log.warn("Failed to read config.properties from {}: {}", configPath, e.getMessage());
            }
        } else {
            log.info("Using default config (no external config.properties found at {}): lunchStart={}, lunchEnd={}, hoursPerDay={}", configPath, start, end, hoursPerDay);
        }

        return new LunchConfig(start, end, hoursPerDay);
    }

    private Path resolveEventsDir() {
        String envDir = System.getenv("TIME_TRACKER_EVENTS_DIR");
        if (envDir != null && !envDir.isBlank()) {
            Path p = Paths.get(envDir);
            if (Files.isDirectory(p)) {
                return p;
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

    private Path resolveUserOverridesDir() {
        String envDir = System.getenv("TIME_TRACKER_OVERRIDES_DIR");
        if (envDir != null && !envDir.isBlank()) {
            return Paths.get(envDir).toAbsolutePath().normalize();
        }
        Path eventsDir = resolveEventsDir().toAbsolutePath().normalize();
        Path parentDir = eventsDir.getParent();
        return (parentDir != null ? parentDir : eventsDir).resolve("overrides");
    }

    private Path resolveUserOverridesFileForMonth(String monthKey) {
        return resolveUserOverridesDir().resolve("user-overrides-" + monthKey + ".json");
    }

    private synchronized Map<String, DayOverride> loadUserOverridesForMonth(String monthKey) {
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

    private synchronized Map<String, DayOverride> loadUserOverrides() {
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

    private synchronized void saveUserOverridesForMonth(String monthKey, Map<String, DayOverride> monthOverrides) throws IOException {
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

    @GetMapping("/config")
    public Mono<ResponseEntity<LunchConfig>> getConfig() {
        return Mono.fromCallable(() -> ResponseEntity.ok(loadLunchConfig()));
    }

    @GetMapping("/overrides")
    public Mono<ResponseEntity<Map<String, DayOverride>>> getOverrides() {
        return Mono.fromCallable(() -> ResponseEntity.ok(loadUserOverrides()));
    }

    @GetMapping("/overrides/{month}")
    public Mono<ResponseEntity<Map<String, DayOverride>>> getOverridesForMonth(@PathVariable String month) {
        return Mono.fromCallable(() -> ResponseEntity.ok(loadUserOverridesForMonth(month)));
    }

    @PostMapping("/overrides")
    public Mono<ResponseEntity<Map<String, DayOverride>>> saveOverride(@RequestBody OverrideRequest req) {
        return Mono.fromCallable(() -> {
            if (req != null && req.date() != null && req.date().trim().length() >= 7) {
                String date = req.date().trim();
                String monthKey = date.substring(0, 7);
                Map<String, DayOverride> monthOverrides = loadUserOverridesForMonth(monthKey);
                String start = req.start() != null && !req.start().isBlank() ? req.start().trim() : null;
                String end = req.end() != null && !req.end().isBlank() ? req.end().trim() : null;
                List<CustomBreak> breaks = new ArrayList<>();
                if (req.breaks() != null) {
                    for (CustomBreak b : req.breaks()) {
                        if (b != null && b.start() != null && !b.start().isBlank() && b.end() != null && !b.end().isBlank()) {
                            breaks.add(new CustomBreak(b.start().trim(), b.end().trim()));
                        }
                    }
                }
                if (start == null && end == null && breaks.isEmpty()) {
                    monthOverrides.remove(date);
                } else {
                    monthOverrides.put(date, new DayOverride(start, end, breaks.isEmpty() ? null : breaks));
                }
                saveUserOverridesForMonth(monthKey, monthOverrides);
            }
            return ResponseEntity.ok(loadUserOverrides());
        });
    }

    @DeleteMapping("/overrides/{date}")
    public Mono<ResponseEntity<Map<String, DayOverride>>> deleteOverride(@PathVariable String date) {
        return Mono.fromCallable(() -> {
            if (date != null && date.trim().length() >= 7) {
                String trimmedDate = date.trim();
                String monthKey = trimmedDate.substring(0, 7);
                Map<String, DayOverride> monthOverrides = loadUserOverridesForMonth(monthKey);
                monthOverrides.remove(trimmedDate);
                saveUserOverridesForMonth(monthKey, monthOverrides);
            }
            return ResponseEntity.ok(loadUserOverrides());
        });
    }

    @GetMapping("/events")
    public Mono<ResponseEntity<EventsResponse>> getAllEvents() {
        return Mono.fromCallable(() -> {
            Path eventsDir = resolveEventsDir();
            log.info("Reading events from: {}", eventsDir);

            Map<String, List<TrackerEvent>> map = new TreeMap<>(Comparator.reverseOrder());

            if (Files.isDirectory(eventsDir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(eventsDir, "events-*.json")) {
                    for (Path entry : stream) {
                        String fileName = entry.getFileName().toString();
                        // Expected: events-yyyy-mm.json -> extract yyyy-mm
                        String monthKey = fileName.replace("events-", "").replace(".json", "");
                        try {
                            byte[] bytes = Files.readAllBytes(entry);
                            List<TrackerEvent> events = objectMapper.readValue(bytes, new TypeReference<>() {});
                            events.sort(Comparator.comparing(TrackerEvent::timestamp));
                            map.put(monthKey, events);
                        } catch (Exception ex) {
                            log.error("Failed to read events from file {}: {}", entry, ex.getMessage());
                        }
                    }
                } catch (IOException e) {
                    log.error("Failed to read events directory: {}", e.getMessage());
                }
            }

            List<String> months = new ArrayList<>(map.keySet());
            LunchConfig lunchConfig = loadLunchConfig();
            Map<String, DayOverride> userOverrides = loadUserOverrides();
            return ResponseEntity.ok(new EventsResponse(months, map, lunchConfig, userOverrides));
        });
    }

    @GetMapping("/events/{month}")
    public Mono<ResponseEntity<List<TrackerEvent>>> getEventsForMonth(@PathVariable String month) {
        return getAllEvents().map(res -> {
            EventsResponse body = res.getBody();
            if (body != null && body.eventsByMonth().containsKey(month)) {
                return ResponseEntity.ok(body.eventsByMonth().get(month));
            }
            return ResponseEntity.ok(Collections.emptyList());
        });
    }

    private Map<String, Map<String, DayOverride>> parseOverridesFromText(String rawContent) {
        Map<String, Map<String, DayOverride>> byMonth = new TreeMap<>();
        if (rawContent == null || rawContent.isBlank()) {
            return byMonth;
        }

        String[] lines = rawContent.split("\\r?\\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || !line.contains("|")) continue;

            String[] parts = line.split("\\|");
            if (parts.length < 3) continue;

            String p0 = parts[0].trim();
            String p1 = parts[1].trim();
            String p2 = parts[2].trim();

            if (p0.equalsIgnoreCase("OVERRIDE_IN") && p1.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p2.isEmpty()) {
                String date = p1;
                String monthKey = date.substring(0, 7);
                Map<String, DayOverride> monthMap = byMonth.computeIfAbsent(monthKey, k -> new TreeMap<>());
                DayOverride existing = monthMap.get(date);
                monthMap.put(date, new DayOverride(
                        p2,
                        existing != null ? existing.end() : null,
                        existing != null ? existing.breaks() : null
                ));
            } else if (p0.equalsIgnoreCase("OVERRIDE_OUT") && p1.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p2.isEmpty()) {
                String date = p1;
                String monthKey = date.substring(0, 7);
                Map<String, DayOverride> monthMap = byMonth.computeIfAbsent(monthKey, k -> new TreeMap<>());
                DayOverride existing = monthMap.get(date);
                monthMap.put(date, new DayOverride(
                        existing != null ? existing.start() : null,
                        p2,
                        existing != null ? existing.breaks() : null
                ));
            } else if (p0.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p1.isEmpty() && !p2.isEmpty()) {
                String date = p0;
                String monthKey = date.substring(0, 7);
                Map<String, DayOverride> monthMap = byMonth.computeIfAbsent(monthKey, k -> new TreeMap<>());
                DayOverride existing = monthMap.get(date);
                List<CustomBreak> breaks = new ArrayList<>();
                if (existing != null && existing.breaks() != null) {
                    breaks.addAll(existing.breaks());
                }
                CustomBreak candidate = new CustomBreak(p1, p2);
                if (!breaks.contains(candidate)) {
                    breaks.add(candidate);
                }
                monthMap.put(date, new DayOverride(
                        existing != null ? existing.start() : null,
                        existing != null ? existing.end() : null,
                        breaks
                ));
            }
        }
        return byMonth;
    }

    @PostMapping(value = "/overrides/upload", consumes = MediaType.ALL_VALUE)
    public Mono<ResponseEntity<EventsResponse>> uploadOverrides(
            @RequestBody String rawContent,
            @RequestParam(value = "clearAll", defaultValue = "false") boolean clearAll
    ) {
        return Mono.fromCallable(() -> {
            Path overridesDir = resolveUserOverridesDir();
            if (clearAll && Files.isDirectory(overridesDir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(overridesDir, "user-overrides-*.json")) {
                    for (Path entry : stream) {
                        Files.deleteIfExists(entry);
                    }
                }
            }

            Map<String, Map<String, DayOverride>> parsedOverridesByMonth = parseOverridesFromText(rawContent);
            for (Map.Entry<String, Map<String, DayOverride>> entry : parsedOverridesByMonth.entrySet()) {
                saveUserOverridesForMonth(entry.getKey(), entry.getValue());
            }

            return getAllEvents().block();
        });
    }

    @PostMapping(value = "/events/upload", consumes = MediaType.ALL_VALUE)
    public Mono<ResponseEntity<EventsResponse>> uploadEvents(
            @RequestBody String rawContent,
            @RequestParam(value = "clearAll", defaultValue = "false") boolean clearAll
    ) {
        return Mono.fromCallable(() -> {
            Path eventsDir = resolveEventsDir();
            if (!Files.exists(eventsDir)) {
                Files.createDirectories(eventsDir);
            }

            if (clearAll && Files.isDirectory(eventsDir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(eventsDir, "events-*.json")) {
                    for (Path entry : stream) {
                        Files.deleteIfExists(entry);
                    }
                }
            }

            // Parse lines in format: STARTUP|YYYY-MM-DD HH:mm:ss or SHUTDOWN|YYYY-MM-DD HH:mm:ss
            Map<String, List<TrackerEvent>> parsedByMonth = new HashMap<>();
            String[] lines = rawContent.split("\\r?\\n");
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || !line.contains("|")) continue;

                String[] parts = line.split("\\|");
                if (parts.length == 2) {
                    String name = parts[0].trim();
                    String timestamp = parts[1].trim();
                    if ((name.equalsIgnoreCase("STARTUP") || name.equalsIgnoreCase("SHUTDOWN"))
                            && timestamp.matches("^\\d{4}-\\d{2}-\\d{2}.*")) {
                        String monthKey = timestamp.substring(0, 7);
                        parsedByMonth.computeIfAbsent(monthKey, k -> new ArrayList<>())
                                .add(new TrackerEvent(name, timestamp));
                    }
                }
            }

            // Write or overwrite events-yyyy-MM.json for each month in the uploaded content
            for (Map.Entry<String, List<TrackerEvent>> entry : parsedByMonth.entrySet()) {
                String monthKey = entry.getKey();
                List<TrackerEvent> events = entry.getValue();
                events.sort(Comparator.comparing(TrackerEvent::timestamp));

                Path targetFile = eventsDir.resolve("events-" + monthKey + ".json");
                objectMapper.writerWithDefaultPrettyPrinter().writeValue(targetFile.toFile(), events);
                log.info("Overwrote {} with {} events from upload", targetFile, events.size());
            }

            // Also check if the uploaded file contained override lines
            Map<String, Map<String, DayOverride>> parsedOverridesByMonth = parseOverridesFromText(rawContent);
            for (Map.Entry<String, Map<String, DayOverride>> entry : parsedOverridesByMonth.entrySet()) {
                saveUserOverridesForMonth(entry.getKey(), entry.getValue());
            }

            return getAllEvents().block();
        });
    }
}
