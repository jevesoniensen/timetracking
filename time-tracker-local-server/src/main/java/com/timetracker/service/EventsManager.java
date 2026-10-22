package com.timetracker.service;

import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
public class EventsManager {

    private static final Logger log = LoggerFactory.getLogger(EventsManager.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final FileSytemService fileSytemService;
    private final ConfigManager configManager;

    public EventsManager(FileSytemService fileSytemService, ConfigManager configManager) {
        this.fileSytemService = fileSytemService;
        this.configManager = configManager;
    }

    // ---------------------------------------------------------
    // Windows Events Synchronization
    // ---------------------------------------------------------

    public synchronized void syncWindowsEventsIfOnWindows() {
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            return;
        }

        try {
            String lastTimestamp = fileSytemService.readSyncState().orElse(null);

            LunchConfig lunchConfig = configManager.loadLunchConfig();
            String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
            boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

            String effectiveStartTime = null;
            if (lastTimestamp != null && !lastTimestamp.isBlank()) {
                if (hasStartDate) {
                    String startTs = startWorkDate + " 00:00:00";
                    effectiveStartTime = startTs.compareTo(lastTimestamp) > 0 ? startTs : lastTimestamp;
                } else {
                    effectiveStartTime = lastTimestamp;
                }
            } else if (hasStartDate) {
                effectiveStartTime = startWorkDate + " 00:00:00";
            }

            // Ensure we scan at least from the beginning of the current month
            // so any missing events from earlier this month are properly backfilled
            String currentMonthStart = LocalDate.now().withDayOfMonth(1) + " 00:00:00";
            if (hasStartDate && currentMonthStart.compareTo(startWorkDate + " 00:00:00") < 0) {
                currentMonthStart = startWorkDate + " 00:00:00";
            }
            if (effectiveStartTime == null || effectiveStartTime.compareTo(currentMonthStart) > 0) {
                effectiveStartTime = currentMonthStart;
            }

            String startFilter = "";
            if (effectiveStartTime != null && !effectiveStartTime.isBlank()) {
                startFilter = "$startTime = [datetime]::ParseExact('" + effectiveStartTime + "', 'yyyy-MM-dd HH:mm:ss', [System.Globalization.CultureInfo]::InvariantCulture); $filter['StartTime'] = $startTime;";
            }

            String script = "$filter = @{LogName='System'; Id=6005,6006,6008,1074,42,107,7001,7002,1}; "
                    + startFilter
                    + " Get-WinEvent -FilterHashtable $filter -ErrorAction SilentlyContinue |"
                    + " Sort-Object TimeCreated |"
                    + " ForEach-Object { [PSCustomObject]@{ Id = $_.Id; Provider = $_.ProviderName; TimeCreated = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss') } } |"
                    + " ConvertTo-Json -Compress";

            ProcessBuilder pb = new ProcessBuilder("powershell", "-NoProfile", "-Command", script);
            Process process = pb.start();

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }

            boolean finished = process.waitFor(15, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                log.warn("PowerShell event query timed out after 15s");
                return;
            }

            String output = sb.toString().trim();
            if (output.isEmpty()) {
                return;
            }

            JsonNode rootNode = objectMapper.readTree(output);
            List<JsonNode> nodeList = new ArrayList<>();
            if (rootNode.isArray()) {
                for (JsonNode item : rootNode) {
                    nodeList.add(item);
                }
            } else if (rootNode.isObject()) {
                nodeList.add(rootNode);
            }

            List<TrackerEvent> newEvents = new ArrayList<>();
            String latestTimestamp = lastTimestamp;

            for (JsonNode item : nodeList) {
                if (!item.has("Id") || !item.has("TimeCreated")) {
                    continue;
                }
                int id = item.get("Id").asInt();
                String provider = item.has("Provider") ? item.get("Provider").asText("") : "";
                String timeCreated = item.get("TimeCreated").asText();
                if (timeCreated == null || timeCreated.length() < 10) {
                    continue;
                }

                if (hasStartDate && timeCreated.substring(0, 10).compareTo(startWorkDate) < 0) {
                    continue;
                }

                String eventName;
                String eventType;

                if (id == 7001) {
                    eventName = "LOGON";
                    eventType = "START";
                } else if (id == 107) {
                    eventName = "RESUME";
                    eventType = "START";
                } else if (id == 6005) {
                    eventName = "STARTUP";
                    eventType = "START";
                } else if (id == 1 && provider.contains("Power-Troubleshooter")) {
                    eventName = "WAKE";
                    eventType = "START";
                } else if (id == 7002) {
                    eventName = "LOGOFF";
                    eventType = "END";
                } else if (id == 42) {
                    eventName = "SLEEP";
                    eventType = "END";
                } else if (id == 1074) {
                    eventName = "USER_SHUTDOWN";
                    eventType = "END";
                } else if (id == 6006) {
                    eventName = "SHUTDOWN";
                    eventType = "END";
                } else if (id == 6008) {
                    eventName = "UNEXPECTED_SHUTDOWN";
                    eventType = "END";
                } else {
                    continue;
                }

                newEvents.add(new TrackerEvent(eventName, timeCreated, eventType));
                if (latestTimestamp == null || timeCreated.compareTo(latestTimestamp) > 0) {
                    latestTimestamp = timeCreated;
                }
            }

            if (!newEvents.isEmpty()) {
                Map<String, List<TrackerEvent>> byMonth = new HashMap<>();
                for (TrackerEvent ev : newEvents) {
                    String monthKey = ev.timestamp().substring(0, 7);
                    byMonth.computeIfAbsent(monthKey, k -> new ArrayList<>()).add(ev);
                }

                for (Map.Entry<String, List<TrackerEvent>> entry : byMonth.entrySet()) {
                    String monthKey = entry.getKey();
                    List<TrackerEvent> monthEvents = new ArrayList<>(fileSytemService.readEventsForMonth(monthKey));

                    for (TrackerEvent ev : entry.getValue()) {
                        boolean exists = monthEvents.stream().anyMatch(e ->
                                Objects.equals(e.timestamp(), ev.timestamp()) && Objects.equals(e.name(), ev.name()));
                        if (!exists) {
                            monthEvents.add(ev);
                        }
                    }
                    fileSytemService.writeEventsForMonth(monthKey, monthEvents);
                }

                if (latestTimestamp != null) {
                    fileSytemService.writeSyncState(latestTimestamp);
                }
                log.info("Synced {} new Windows events", newEvents.size());
            }
        } catch (Exception e) {
            log.warn("Failed to sync Windows events: {}", e.getMessage());
        }
    }

    // ---------------------------------------------------------
    // Query Events
    // ---------------------------------------------------------

    public EventsResponse getAllEvents() {
        syncWindowsEventsIfOnWindows();

        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");
        String startMonthKey = hasStartDate ? startWorkDate.substring(0, 7) : "";

        Map<String, List<TrackerEvent>> allEvents = fileSytemService.readAllEventFiles();
        Map<String, List<TrackerEvent>> filteredMap = new TreeMap<>(Comparator.reverseOrder());

        for (Map.Entry<String, List<TrackerEvent>> entry : allEvents.entrySet()) {
            String monthKey = entry.getKey();
            if (hasStartDate && monthKey.compareTo(startMonthKey) < 0) {
                continue;
            }
            List<TrackerEvent> events = new ArrayList<>(entry.getValue());
            if (hasStartDate) {
                events.removeIf(ev -> ev.timestamp() == null
                        || ev.timestamp().length() < 10
                        || ev.timestamp().substring(0, 10).compareTo(startWorkDate) < 0);
            }
            events.sort(Comparator.comparing(TrackerEvent::timestamp));
            if (!events.isEmpty()) {
                filteredMap.put(monthKey, events);
            }
        }

        List<String> months = new ArrayList<>(filteredMap.keySet());
        Map<String, DayOverride> userOverrides = loadUserOverrides();
        return new EventsResponse(months, filteredMap, lunchConfig, userOverrides);
    }

    public List<TrackerEvent> getEventsForMonth(String month) {
        EventsResponse response = getAllEvents();
        if (response != null && response.eventsByMonth().containsKey(month)) {
            return response.eventsByMonth().get(month);
        }
        return Collections.emptyList();
    }

    // ---------------------------------------------------------
    // Overrides Management
    // ---------------------------------------------------------

    public Map<String, DayOverride> loadUserOverrides() {
        Map<String, DayOverride> userOverrides = fileSytemService.readAllUserOverrides();
        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        if (startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            userOverrides.keySet().removeIf(dateKey -> dateKey.compareTo(startWorkDate) < 0);
        }
        return userOverrides;
    }

    public Map<String, DayOverride> loadUserOverridesForMonth(String monthKey) {
        return fileSytemService.readUserOverridesForMonth(monthKey);
    }

    public synchronized Map<String, DayOverride> saveOverride(OverrideRequest req) throws IOException {
        if (req != null && req.date() != null && req.date().trim().length() >= 7) {
            String date = req.date().trim();
            String monthKey = date.substring(0, 7);
            Map<String, DayOverride> monthOverrides = fileSytemService.readUserOverridesForMonth(monthKey);
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
            fileSytemService.writeUserOverridesForMonth(monthKey, monthOverrides);
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
                        monthKey, fileSytemService::readUserOverridesForMonth
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
                fileSytemService.writeUserOverridesForMonth(entry.getKey(), entry.getValue());
            }
        }
        return loadUserOverrides();
    }

    public synchronized Map<String, DayOverride> deleteOverride(String date) throws IOException {
        if (date != null && date.trim().length() >= 7) {
            String trimmedDate = date.trim();
            String monthKey = trimmedDate.substring(0, 7);
            Map<String, DayOverride> monthOverrides = fileSytemService.readUserOverridesForMonth(monthKey);
            monthOverrides.remove(trimmedDate);
            fileSytemService.writeUserOverridesForMonth(monthKey, monthOverrides);
        }
        return loadUserOverrides();
    }

    // ---------------------------------------------------------
    // Uploads
    // ---------------------------------------------------------

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
        if (clearAll) {
            fileSytemService.clearAllOverrideFiles();
        }

        Map<String, Map<String, DayOverride>> parsedOverridesByMonth = parseOverridesFromText(rawContent);
        for (Map.Entry<String, Map<String, DayOverride>> entry : parsedOverridesByMonth.entrySet()) {
            fileSytemService.writeUserOverridesForMonth(entry.getKey(), entry.getValue());
        }

        return getAllEvents();
    }

    public synchronized EventsResponse uploadEvents(String rawContent, boolean clearAll) throws IOException {
        if (clearAll) {
            fileSytemService.clearAllEventFiles();
        }

        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

        Map<String, List<TrackerEvent>> parsedByMonth = new HashMap<>();
        String[] lines = rawContent.split("\\r?\\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || !line.contains("|")) continue;

            String[] parts = line.split("\\|");
            if (parts.length >= 2) {
                String name = parts[0].trim();
                String timestamp = parts[1].trim();
                String type = parts.length >= 3 ? parts[2].trim().toUpperCase() : null;
                String inferredType = type != null && (type.equals("START") || type.equals("END"))
                        ? type
                        : TrackerEvent.inferType(name);

                if (inferredType != null && timestamp.matches("^\\d{4}-\\d{2}-\\d{2}.*")) {
                    String dateStr = timestamp.substring(0, 10);
                    if (hasStartDate && dateStr.compareTo(startWorkDate) < 0) {
                        continue;
                    }
                    String monthKey = timestamp.substring(0, 7);
                    parsedByMonth.computeIfAbsent(monthKey, k -> new ArrayList<>())
                            .add(new TrackerEvent(name, timestamp, inferredType));
                }
            }
        }

        for (Map.Entry<String, List<TrackerEvent>> entry : parsedByMonth.entrySet()) {
            String monthKey = entry.getKey();
            List<TrackerEvent> events = entry.getValue();
            events.sort(Comparator.comparing(TrackerEvent::timestamp));
            fileSytemService.writeEventsForMonth(monthKey, events);
            log.info("Overwrote month {} with {} events from upload", monthKey, events.size());
        }

        Map<String, Map<String, DayOverride>> parsedOverridesByMonth = parseOverridesFromText(rawContent);
        for (Map.Entry<String, Map<String, DayOverride>> entry : parsedOverridesByMonth.entrySet()) {
            fileSytemService.writeUserOverridesForMonth(entry.getKey(), entry.getValue());
        }

        return getAllEvents();
    }
}
