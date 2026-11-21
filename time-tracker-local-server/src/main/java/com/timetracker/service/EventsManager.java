package com.timetracker.service;

import com.timetracker.dto.CustomBreak;
import com.timetracker.dto.DayOverride;
import com.timetracker.dto.EventsResponse;
import com.timetracker.dto.LunchConfig;
import com.timetracker.dto.MonthSummary;
import com.timetracker.dto.OverallSaldoSummary;
import com.timetracker.dto.OverrideRequest;
import com.timetracker.dto.TrackerEvent;
import com.timetracker.dto.UploadPreviewResponse;
import com.timetracker.dto.VacationRequest;
import com.timetracker.repository.EventsRepository;
import com.timetracker.repository.FileSytemService;
import com.timetracker.repository.UserOverridesRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

@Service
public class EventsManager {

    private static final Logger log = LoggerFactory.getLogger(EventsManager.class);

    private final FileSytemService fileSytemService;
    private final EventsRepository eventsRepository;
    private final UserOverridesRepository userOverridesRepository;
    private final ConfigManager configManager;
    private final WorkSummaryCalculator workSummaryCalculator;

    public EventsManager(
            FileSytemService fileSytemService,
            EventsRepository eventsRepository,
            UserOverridesRepository userOverridesRepository,
            ConfigManager configManager,
            WorkSummaryCalculator workSummaryCalculator
    ) {
        this.fileSytemService = fileSytemService;
        this.eventsRepository = eventsRepository;
        this.userOverridesRepository = userOverridesRepository;
        this.configManager = configManager;
        this.workSummaryCalculator = workSummaryCalculator;
    }

    // ---------------------------------------------------------
    // Query Events
    // ---------------------------------------------------------

    public EventsResponse getAllEvents() {
        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");
        String startMonthKey = hasStartDate ? startWorkDate.substring(0, 7) : "";

        Map<String, List<TrackerEvent>> allEvents = eventsRepository.readAllEventFiles();
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

        Map<String, DayOverride> userOverrides = loadUserOverrides();
        Map<String, MonthSummary> monthSummaries = workSummaryCalculator.processEventsByMonth(filteredMap, lunchConfig, userOverrides);
        OverallSaldoSummary overallSaldo = workSummaryCalculator.calculateOverallSaldo(monthSummaries.values());
        List<String> months = new ArrayList<>(monthSummaries.keySet());
        return new EventsResponse(months, filteredMap, lunchConfig, userOverrides, monthSummaries, overallSaldo);
    }

    public String exportMonthCsv(String monthKey) {
        EventsResponse response = getAllEvents();
        MonthSummary summary = response.monthSummaries() != null ? response.monthSummaries().get(monthKey) : null;
        return workSummaryCalculator.exportMonthToCsv(summary);
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
        Map<String, DayOverride> userOverrides = userOverridesRepository.readAllUserOverrides();
        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        if (startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            userOverrides.keySet().removeIf(dateKey -> dateKey.compareTo(startWorkDate) < 0);
        }
        return userOverrides;
    }

    public Map<String, DayOverride> loadUserOverridesForMonth(String monthKey) {
        return userOverridesRepository.readUserOverridesForMonth(monthKey);
    }

    public synchronized Map<String, DayOverride> saveOverride(OverrideRequest req) throws IOException {
        if (req != null && req.date() != null && req.date().trim().length() >= 7) {
            String date = req.date().trim();
            String monthKey = date.substring(0, 7);
            Map<String, DayOverride> monthOverrides = userOverridesRepository.readUserOverridesForMonth(monthKey);
            String start = req.start() != null && !req.start().isBlank() ? req.start().trim() : null;
            String end = req.end() != null && !req.end().isBlank() ? req.end().trim() : null;
            List<CustomBreak> breaks = new ArrayList<>();
            if (req.breaks() != null) {
                for (CustomBreak b : req.breaks()) {
                    if (b != null && b.start() != null && !b.start().isBlank() && b.end() != null && !b.end().isBlank()) {
                        String icon = b.icon() != null && !b.icon().isBlank() ? b.icon().trim() : null;
                        breaks.add(new CustomBreak(b.start().trim(), b.end().trim(), icon));
                    }
                }
            }
            Boolean isVacation = Boolean.TRUE.equals(req.vacation()) ? Boolean.TRUE : null;
            if (start == null && end == null && breaks.isEmpty() && isVacation == null) {
                monthOverrides.remove(date);
            } else {
                monthOverrides.put(date, new DayOverride(start, end, breaks.isEmpty() ? null : breaks, isVacation));
            }
            userOverridesRepository.writeUserOverridesForMonth(monthKey, monthOverrides);
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
                        monthKey, userOverridesRepository::readUserOverridesForMonth
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
                userOverridesRepository.writeUserOverridesForMonth(entry.getKey(), entry.getValue());
            }
        }
        return loadUserOverrides();
    }

    public synchronized Map<String, DayOverride> deleteOverride(String date) throws IOException {
        if (date != null && date.trim().length() >= 7) {
            String trimmedDate = date.trim();
            String monthKey = trimmedDate.substring(0, 7);
            Map<String, DayOverride> monthOverrides = userOverridesRepository.readUserOverridesForMonth(monthKey);
            monthOverrides.remove(trimmedDate);
            userOverridesRepository.writeUserOverridesForMonth(monthKey, monthOverrides);
        }
        return loadUserOverrides();
    }

    public List<String> previewVacationDates(String startDateStr, String endDateStr, boolean excludeWeekends) {
        if (startDateStr == null || !startDateStr.trim().matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            return Collections.emptyList();
        }
        String sTrim = startDateStr.trim();
        String eTrim = (endDateStr != null && endDateStr.trim().matches("^\\d{4}-\\d{2}-\\d{2}$"))
                ? endDateStr.trim()
                : sTrim;

        LocalDate startDate = LocalDate.parse(sTrim);
        LocalDate endDate = LocalDate.parse(eTrim);
        if (endDate.isBefore(startDate)) {
            LocalDate tmp = startDate;
            startDate = endDate;
            endDate = tmp;
        }

        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        boolean hasStartDate = startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

        List<String> dates = new ArrayList<>();
        for (LocalDate cur = startDate; !cur.isAfter(endDate); cur = cur.plusDays(1)) {
            String dStr = cur.toString();
            if (hasStartDate && dStr.compareTo(startWorkDate) < 0) continue;
            DayOfWeek dow = cur.getDayOfWeek();
            boolean isWeekend = (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY);
            if (excludeWeekends && isWeekend) continue;
            dates.add(dStr);
        }
        return dates;
    }

    public UploadPreviewResponse previewUpload(String rawContent, String requestedMode) {
        if (rawContent == null || rawContent.isBlank()) {
            String mode = "overrides".equalsIgnoreCase(requestedMode) ? "overrides" : "events";
            return new UploadPreviewResponse(mode, Collections.emptyList(), 0, 0);
        }

        Map<String, List<TrackerEvent>> eventsByMonth = parseEventsFromText(rawContent, false);
        int eventCount = eventsByMonth.values().stream().mapToInt(List::size).sum();

        Map<String, Map<String, DayOverride>> overridesByMonth = parseOverridesFromText(rawContent);
        int overrideDaysCount = overridesByMonth.values().stream().mapToInt(Map::size).sum();
        int overrideLinesCount = countValidOverrideLines(rawContent);

        String effectiveMode = "overrides".equalsIgnoreCase(requestedMode) ? "overrides" : "events";
        if (overrideLinesCount > 0 && eventCount == 0) {
            effectiveMode = "overrides";
        } else if (eventCount > 0 && overrideLinesCount == 0) {
            effectiveMode = "events";
        }

        if ("overrides".equals(effectiveMode)) {
            List<String> months = new ArrayList<>(overridesByMonth.keySet());
            months.sort(Comparator.reverseOrder());
            return new UploadPreviewResponse("overrides", months, overrideLinesCount, overrideDaysCount);
        } else {
            List<String> months = new ArrayList<>(eventsByMonth.keySet());
            months.sort(Comparator.reverseOrder());
            return new UploadPreviewResponse("events", months, eventCount, 0);
        }
    }

    private int countValidOverrideLines(String rawContent) {
        int count = 0;
        for (String line : rawContent.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || !trimmed.contains("|")) continue;
            String[] parts = trimmed.split("\\|");
            if (parts.length < 2) continue;
            String p0 = parts[0].trim();
            String p1 = parts[1].trim();
            String p2 = parts.length >= 3 ? parts[2].trim() : "";
            if ((p0.equalsIgnoreCase("VACATION") || p0.equalsIgnoreCase("OVERRIDE_VACATION")) && p1.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
                count++;
            } else if (parts.length >= 3 && (p0.equalsIgnoreCase("OVERRIDE_IN") || p0.equalsIgnoreCase("OVERRIDE_OUT"))
                    && p1.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p2.isEmpty()) {
                count++;
            } else if (parts.length >= 3 && p0.matches("^\\d{4}-\\d{2}-\\d{2}$") && !p1.isEmpty() && !p2.isEmpty()) {
                count++;
            }
        }
        return count;
    }

    private Map<String, List<TrackerEvent>> parseEventsFromText(String rawContent, boolean filterByStartWorkDate) {
        LunchConfig lunchConfig = configManager.loadLunchConfig();
        String startWorkDate = lunchConfig.startWorkDate() != null ? lunchConfig.startWorkDate().trim() : "";
        boolean hasStartDate = filterByStartWorkDate && startWorkDate.matches("^\\d{4}-\\d{2}-\\d{2}$");

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
        return parsedByMonth;
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
            userOverridesRepository.clearAllOverrideFiles();
        }

        Map<String, Map<String, DayOverride>> parsedOverridesByMonth = parseOverridesFromText(rawContent);
        for (Map.Entry<String, Map<String, DayOverride>> entry : parsedOverridesByMonth.entrySet()) {
            userOverridesRepository.writeUserOverridesForMonth(entry.getKey(), entry.getValue());
        }

        return getAllEvents();
    }

    public synchronized EventsResponse uploadEvents(String rawContent, boolean clearAll) throws IOException {
        if (clearAll) {
            fileSytemService.clearAllEventFiles();
        }

        Map<String, List<TrackerEvent>> parsedByMonth = parseEventsFromText(rawContent, true);

        for (Map.Entry<String, List<TrackerEvent>> entry : parsedByMonth.entrySet()) {
            String monthKey = entry.getKey();
            List<TrackerEvent> events = entry.getValue();
            events.sort(Comparator.comparing(TrackerEvent::timestamp));
            eventsRepository.writeEventsForMonth(monthKey, events);
            log.info("Overwrote month {} with {} events from upload", monthKey, events.size());
        }

        Map<String, Map<String, DayOverride>> parsedOverridesByMonth = parseOverridesFromText(rawContent);
        for (Map.Entry<String, Map<String, DayOverride>> entry : parsedOverridesByMonth.entrySet()) {
            userOverridesRepository.writeUserOverridesForMonth(entry.getKey(), entry.getValue());
        }

        return getAllEvents();
    }
}
