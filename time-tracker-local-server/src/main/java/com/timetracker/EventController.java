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
import java.time.DayOfWeek;
import java.time.LocalDate;
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

    @Value("${work.start.date:}")
    private String fallbackStartWorkDate;

    public record TrackerEvent(String name, String timestamp) {}

    public record LunchConfig(String defaultLunchStart, String defaultLunchEnd, double defaultWorkHoursPerDay, String startWorkDate) {}

    public record StartWorkDateRequest(String startWorkDate) {}

    public record CustomBreak(String start, String end) {}

    public record DayOverride(String start, String end, List<CustomBreak> breaks, Boolean vacation) {}

    public record OverrideRequest(String date, String start, String end, List<CustomBreak> breaks, Boolean vacation) {}

    public record VacationRequest(String startDate, String endDate, Boolean excludeWeekends, Boolean vacation) {}

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
        String startWorkDate = fallbackStartWorkDate != null ? fallbackStartWorkDate.trim() : "";

        Path configPath = resolveConfigFile();
        if (Files.isRegularFile(configPath)) {
            Properties props = new Properties();
            try (InputStream in = Files.newInputStream(configPath)) {
                props.load(in);
                String propStart = props.getProperty("lunch.default.start");
                String propEnd = props.getProperty("lunch.default.end");
                String propHours = props.getProperty("work.default.hours.per.day");
                String propStartWorkDate = props.getProperty("work.start.date");
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
                if (propStartWorkDate != null) {
                    startWorkDate = propStartWorkDate.trim();
                }
                log.info("Loaded config from {}: lunchStart={}, lunchEnd={}, hoursPerDay={}, startWorkDate={}", configPath, start, end, hoursPerDay, startWorkDate);
            } catch (IOException e) {
                log.warn("Failed to read config.properties from {}: {}", configPath, e.getMessage());
            }
        } else {
            log.info("Using default config (no external config.properties found at {}): lunchStart={}, lunchEnd={}, hoursPerDay={}, startWorkDate={}", configPath, start, end, hoursPerDay, startWorkDate);
        }

        return new LunchConfig(start, end, hoursPerDay, startWorkDate);
    }

    private synchronized void saveStartWorkDateToConfig(String startWorkDate) throws IOException {
        Path configPath = resolveConfigFile();
        String cleanDate = startWorkDate != null ? startWorkDate.trim() : "";

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
            LunchConfig current = loadLunchConfig();
            List<String> lines = List.of(
                    "# Time Tracker Configuration",
                    "# Default lunch break start and end times (24-hour HH:mm format)",
                    "# The overlapping portion with the work interval is deducted from daily worked hours.",
                    "lunch.default.start=" + current.defaultLunchStart(),
                    "lunch.default.end=" + current.defaultLunchEnd(),
                    "",
                    "# Default expected working hours per day",
                    "work.default.hours.per.day=" + current.defaultWorkHoursPerDay(),
                    "",
                    "# Start work date (YYYY-MM-DD). Leave empty to be prompted on first app startup.",
                    "work.start.date=" + cleanDate
            );
            if (configPath.getParent() != null && !Files.exists(configPath.getParent())) {
                Files.createDirectories(configPath.getParent());
            }
            Files.write(configPath, lines);
        }
        this.fallbackStartWorkDate = cleanDate;
        log.info("Saved work.start.date={} to {}", cleanDate, configPath);
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

    @PostMapping("/config/start-date")
    public Mono<ResponseEntity<LunchConfig>> saveStartWorkDate(@RequestBody StartWorkDateRequest req) {
        return Mono.fromCallable(() -> {
            if (req != null && req.startWorkDate() != null) {
                saveStartWorkDateToConfig(req.startWorkDate());
            }
            return ResponseEntity.ok(loadLunchConfig());
        });
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
                Boolean isVacation = Boolean.TRUE.equals(req.vacation()) ? Boolean.TRUE : null;
                if (start == null && end == null && breaks.isEmpty() && isVacation == null) {
                    monthOverrides.remove(date);
                } else {
                    monthOverrides.put(date, new DayOverride(start, end, breaks.isEmpty() ? null : breaks, isVacation));
                }
                saveUserOverridesForMonth(monthKey, monthOverrides);
            }
            return ResponseEntity.ok(loadUserOverrides());
        });
    }

    @PostMapping("/overrides/vacation")
    public Mono<ResponseEntity<Map<String, DayOverride>>> saveVacation(@RequestBody VacationRequest req) {
        return Mono.fromCallable(() -> {
            if (req != null && req.startDate() != null && req.startDate().trim().matches("^\\d{4}-\\d{2}-\\d{2}$")) {
                String startStr = req.startDate().trim();
                String endStr = (req.endDate() != null && req.endDate().trim().matches("^\\d{4}-\\d{2}-\\d{2}$"))
                        ? req.endDate().trim()
                        : startStr;

                LocalDate startDate = LocalDate.parse(startStr);
                LocalDate endDate = LocalDate.parse(endStr);
                if (endDate.isBefore(startDate)) {
                    LocalDate tmp = startDate;
                    startDate = endDate;
                    endDate = tmp;
                }

                boolean excludeWeekends = req.excludeWeekends() == null || req.excludeWeekends();
                boolean markAsVacation = req.vacation() == null || req.vacation();

                LunchConfig lunchConfig = loadLunchConfig();
                String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
                boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

                Map<String, Map<String, DayOverride>> modifiedMonths = new TreeMap<>();

                for (LocalDate cur = startDate; !cur.isAfter(endDate); cur = cur.plusDays(1)) {
                    String dateStr = cur.toString();
                    if (hasStartDate && dateStr.compareTo(startWorkDate) < 0) {
                        continue;
                    }
                    DayOfWeek dow = cur.getDayOfWeek();
                    boolean isWeekend = (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY);
                    if (markAsVacation && excludeWeekends && isWeekend) {
                        continue;
                    }

                    String monthKey = dateStr.substring(0, 7);
                    Map<String, DayOverride> monthOverrides = modifiedMonths.computeIfAbsent(
                            monthKey, this::loadUserOverridesForMonth
                    );

                    DayOverride existing = monthOverrides.get(dateStr);
                    String exStart = existing != null ? existing.start() : null;
                    String exEnd = existing != null ? existing.end() : null;
                    List<CustomBreak> exBreaks = existing != null ? existing.breaks() : null;

                    if (markAsVacation) {
                        monthOverrides.put(dateStr, new DayOverride(exStart, exEnd, exBreaks, Boolean.TRUE));
                    } else {
                        boolean hasOtherOverrides = (exStart != null && !exStart.isBlank())
                                || (exEnd != null && !exEnd.isBlank())
                                || (exBreaks != null && !exBreaks.isEmpty());
                        if (hasOtherOverrides) {
                            monthOverrides.put(dateStr, new DayOverride(exStart, exEnd, exBreaks, null));
                        } else {
                            monthOverrides.remove(dateStr);
                        }
                    }
                }

                for (Map.Entry<String, Map<String, DayOverride>> entry : modifiedMonths.entrySet()) {
                    saveUserOverridesForMonth(entry.getKey(), entry.getValue());
                }
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

            LunchConfig lunchConfig = loadLunchConfig();
            String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
            boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");
            String startMonthKey = hasStartDate ? startWorkDate.substring(0, 7) : "";

            Map<String, List<TrackerEvent>> map = new TreeMap<>(Comparator.reverseOrder());

            if (Files.isDirectory(eventsDir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(eventsDir, "events-*.json")) {
                    for (Path entry : stream) {
                        String fileName = entry.getFileName().toString();
                        // Expected: events-yyyy-mm.json -> extract yyyy-mm
                        String monthKey = fileName.replace("events-", "").replace(".json", "");
                        if (hasStartDate && monthKey.compareTo(startMonthKey) < 0) {
                            continue;
                        }
                        try {
                            byte[] bytes = Files.readAllBytes(entry);
                            List<TrackerEvent> events = objectMapper.readValue(bytes, new TypeReference<>() {});
                            if (hasStartDate) {
                                events.removeIf(ev -> ev.timestamp() == null
                                        || ev.timestamp().length() < 10
                                        || ev.timestamp().substring(0, 10).compareTo(startWorkDate) < 0);
                            }
                            events.sort(Comparator.comparing(TrackerEvent::timestamp));
                            if (!events.isEmpty()) {
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

            List<String> months = new ArrayList<>(map.keySet());
            Map<String, DayOverride> userOverrides = loadUserOverrides();
            if (hasStartDate) {
                userOverrides.keySet().removeIf(dateKey -> dateKey.compareTo(startWorkDate) < 0);
            }
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

        LunchConfig lunchConfig = loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

        String[] lines = rawContent.split("\\r?\\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || !line.contains("|")) continue;

            String[] parts = line.split("\\|");
            if (parts.length < 2) continue;

            String p0 = parts[0].trim();
            String p1 = parts[1].trim();
            String p2 = parts.length >= 3 ? parts[2].trim() : "";

            if ((p0.equalsIgnoreCase("VACATION") || p0.equalsIgnoreCase("OVERRIDE_VACATION"))
                    && p1.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
                LocalDate startDate = LocalDate.parse(p1);
                LocalDate endDate = p2.matches("^\\d{4}-\\d{2}-\\d{2}$") ? LocalDate.parse(p2) : startDate;
                if (endDate.isBefore(startDate)) {
                    LocalDate tmp = startDate;
                    startDate = endDate;
                    endDate = tmp;
                }
                for (LocalDate cur = startDate; !cur.isAfter(endDate); cur = cur.plusDays(1)) {
                    DayOfWeek dow = cur.getDayOfWeek();
                    if (!startDate.equals(endDate) && (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY)) {
                        continue;
                    }
                    String date = cur.toString();
                    if (hasStartDate && date.compareTo(startWorkDate) < 0) continue;
                    String monthKey = date.substring(0, 7);
                    Map<String, DayOverride> monthMap = byMonth.computeIfAbsent(monthKey, k -> new TreeMap<>());
                    DayOverride existing = monthMap.get(date);
                    monthMap.put(date, new DayOverride(
                            existing != null ? existing.start() : null,
                            existing != null ? existing.end() : null,
                            existing != null ? existing.breaks() : null,
                            Boolean.TRUE
                    ));
                }
            } else if (parts.length >= 3 && p0.equalsIgnoreCase("OVERRIDE_IN") && p1.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p2.isEmpty()) {
                String date = p1;
                if (hasStartDate && date.compareTo(startWorkDate) < 0) continue;
                String monthKey = date.substring(0, 7);
                Map<String, DayOverride> monthMap = byMonth.computeIfAbsent(monthKey, k -> new TreeMap<>());
                DayOverride existing = monthMap.get(date);
                monthMap.put(date, new DayOverride(
                        p2,
                        existing != null ? existing.end() : null,
                        existing != null ? existing.breaks() : null,
                        existing != null ? existing.vacation() : null
                ));
            } else if (parts.length >= 3 && p0.equalsIgnoreCase("OVERRIDE_OUT") && p1.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p2.isEmpty()) {
                String date = p1;
                if (hasStartDate && date.compareTo(startWorkDate) < 0) continue;
                String monthKey = date.substring(0, 7);
                Map<String, DayOverride> monthMap = byMonth.computeIfAbsent(monthKey, k -> new TreeMap<>());
                DayOverride existing = monthMap.get(date);
                monthMap.put(date, new DayOverride(
                        existing != null ? existing.start() : null,
                        p2,
                        existing != null ? existing.breaks() : null,
                        existing != null ? existing.vacation() : null
                ));
            } else if (parts.length >= 3 && p0.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p1.isEmpty() && !p2.isEmpty()) {
                String date = p0;
                if (hasStartDate && date.compareTo(startWorkDate) < 0) continue;
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
                        breaks,
                        existing != null ? existing.vacation() : null
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

            LunchConfig lunchConfig = loadLunchConfig();
            String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
            boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

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
                        String dateStr = timestamp.substring(0, 10);
                        if (hasStartDate && dateStr.compareTo(startWorkDate) < 0) {
                            continue;
                        }
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
