package com.timetracker.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.timetracker.dto.TrackerEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;

@Component
public class EventsRepository {

    private static final Logger log = LoggerFactory.getLogger(EventsRepository.class);

    private final FileSytemService fileSytemService;

    public EventsRepository(FileSytemService fileSytemService) {
        this.fileSytemService = fileSytemService;
    }

    public synchronized Optional<String> readSyncState() {
        return fileSytemService.loadJson(fileSytemService.resolveSyncStateFile(), new TypeReference<Map<String, String>>() {})
                .map(p -> p.get("last_timestamp"))
                .filter(ts -> ts != null && !ts.isBlank())
                .map(ts -> ts.trim());
    }

    public synchronized void writeSyncState(String lastTimestamp) throws IOException {
        fileSytemService.storeJson(fileSytemService.resolveSyncStateFile(), Collections.singletonMap("last_timestamp", lastTimestamp));
    }

    public synchronized List<TrackerEvent> readEventsForMonth(String monthKey) {
        Path monthFile = fileSytemService.resolveEventsDir().resolve("events-" + monthKey + ".json");

        return fileSytemService.loadJson(monthFile, new TypeReference<List<TrackerEvent>>() {})
                .orElseGet(Collections::emptyList)
                .stream().sorted(Comparator.comparing(TrackerEvent::timestamp)).toList();
    }

    public synchronized void writeEventsForMonth(String monthKey, List<TrackerEvent> events) {
        Path targetFile = fileSytemService.resolveEventsDir().resolve("events-" + monthKey + ".json");
        if (events == null || events.isEmpty()) {
            fileSytemService.deleteFile(targetFile);
            return;
        }
        List<TrackerEvent> sorted = new ArrayList<>(events);
        sorted.sort(Comparator.comparing(TrackerEvent::timestamp));
        fileSytemService.storeJson(targetFile, sorted);
    }

    public synchronized Map<String, List<TrackerEvent>> readAllEventFiles() {
        Path eventsDir = fileSytemService.resolveEventsDir();
        log.info("Reading events from: {}", eventsDir);

        return fileSytemService.readFolderFiles(eventsDir, "events-*.json").stream()
                .<Map.Entry<String, List<TrackerEvent>>>flatMap(fn -> fileSytemService
                        .loadJson(eventsDir.resolve(fn), new TypeReference<List<TrackerEvent>>() {})
                        .filter(e -> !e.isEmpty())
                        .map(e -> {
                            e.sort(Comparator.comparing(TrackerEvent::timestamp));
                            return Map.entry(fn.replace("events-", "").replace(".json", ""), e);
                        })
                        .stream())
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (a, b) -> a,
                        () -> new TreeMap<String, List<TrackerEvent>>(Comparator.reverseOrder())));
    }
}
