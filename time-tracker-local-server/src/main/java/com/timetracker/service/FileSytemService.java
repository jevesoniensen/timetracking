package com.timetracker.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.timetracker.dto.CustomBreak;
import com.timetracker.dto.DayOverride;
import com.timetracker.dto.EventsResponse;
import com.timetracker.dto.LunchConfig;
import com.timetracker.dto.OverrideRequest;
import com.timetracker.dto.TrackerEvent;
import com.timetracker.dto.VacationRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

@Service
public class FileSytemService {

    private static final Logger log = LoggerFactory.getLogger(FileSytemService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ConfigManager configManager;

    public FileSytemService(@Lazy ConfigManager configManager) {
        this.configManager = configManager;
    }

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

    public synchronized void saveStartWorkDateToConfig(String startWorkDate) throws IOException {
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
            LunchConfig current = configManager.loadLunchConfig();
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
        configManager.setFallbackStartWorkDate(cleanDate);
        log.info("Saved work.start.date={} to {}", cleanDate, configPath);
    }

    public Path resolveEventsDir() {
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

    public synchronized Map<String, DayOverride> loadUserOverridesForMonth(String monthKey) {
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

    public synchronized Map<String, DayOverride> loadUserOverrides() {
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

    public synchronized void saveUserOverridesForMonth(String monthKey, Map<String, DayOverride> monthOverrides) throws IOException {
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

    public synchronized Map<String, DayOverride> saveOverride(OverrideRequest req) throws IOException {
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
        return loadUserOverrides();
    }

    public synchronized Map<String, DayOverride> saveVacation(VacationRequest req) throws IOException {
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

            LunchConfig lunchConfig = configManager.loadLunchConfig();
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
        return loadUserOverrides();
    }

    public synchronized Map<String, DayOverride> deleteOverride(String date) throws IOException {
        if (date != null && date.trim().length() >= 7) {
            String trimmedDate = date.trim();
            String monthKey = trimmedDate.substring(0, 7);
            Map<String, DayOverride> monthOverrides = loadUserOverridesForMonth(monthKey);
            monthOverrides.remove(trimmedDate);
            saveUserOverridesForMonth(monthKey, monthOverrides);
        }
        return loadUserOverrides();
    }

    public EventsResponse getAllEvents() {
        Path eventsDir = resolveEventsDir();
        log.info("Reading events from: {}", eventsDir);

        LunchConfig lunchConfig = configManager.loadLunchConfig();
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
        return new EventsResponse(months, map, lunchConfig, userOverrides);
    }

    public Map<String, Map<String, DayOverride>> parseOverridesFromText(String rawContent) {
        Map<String, Map<String, DayOverride>> byMonth = new TreeMap<>();
        if (rawContent == null || rawContent.isBlank()) {
            return byMonth;
        }

        LunchConfig lunchConfig = configManager.loadLunchConfig();
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

    public synchronized EventsResponse uploadOverrides(String rawContent, boolean clearAll) throws IOException {
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

        return getAllEvents();
    }

    public synchronized EventsResponse uploadEvents(String rawContent, boolean clearAll) throws IOException {
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

        LunchConfig lunchConfig = configManager.loadLunchConfig();
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

        return getAllEvents();
    }
}
