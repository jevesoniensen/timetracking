package com.timetracker;

import com.timetracker.dto.DayOverride;
import com.timetracker.dto.EventsResponse;
import com.timetracker.dto.LunchConfig;
import com.timetracker.dto.OverrideRequest;
import com.timetracker.dto.StartWorkDateRequest;
import com.timetracker.dto.TrackerEvent;
import com.timetracker.dto.VacationRequest;
import com.timetracker.service.ConfigManager;
import com.timetracker.service.EventsManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class EventController {

    private static final Logger log = LoggerFactory.getLogger(EventController.class);

    private final EventsManager eventsManager;
    private final ConfigManager configManager;

    public EventController(EventsManager eventsManager, ConfigManager configManager) {
        this.eventsManager = eventsManager;
        this.configManager = configManager;
    }

    @GetMapping("/config")
    public Mono<ResponseEntity<LunchConfig>> getConfig() {
        return Mono.fromCallable(() -> {
            LunchConfig config = configManager.loadLunchConfig();
            log.info("LunchConfig: lunchStart={}, lunchEnd={}, hoursPerDay={}, startWorkDate={}",
                    config.defaultLunchStart(), config.defaultLunchEnd(), config.defaultWorkHoursPerDay(), config.startWorkDate());
            return ResponseEntity.ok(config);
        });
    }

    @PostMapping("/config/start-date")
    public Mono<ResponseEntity<LunchConfig>> saveStartWorkDate(@RequestBody StartWorkDateRequest req) {
        return Mono.fromCallable(() -> {
            if (req != null && req.startWorkDate() != null) {
                configManager.saveStartWorkDate(req.startWorkDate());
            }
            LunchConfig config = configManager.loadLunchConfig();
            log.info("LunchConfig: lunchStart={}, lunchEnd={}, hoursPerDay={}, startWorkDate={}",
                    config.defaultLunchStart(), config.defaultLunchEnd(), config.defaultWorkHoursPerDay(), config.startWorkDate());
            return ResponseEntity.ok(config);
        });
    }

    @GetMapping("/overrides")
    public Mono<ResponseEntity<Map<String, DayOverride>>> getOverrides() {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.loadUserOverrides()));
    }

    @GetMapping("/overrides/{month}")
    public Mono<ResponseEntity<Map<String, DayOverride>>> getOverridesForMonth(@PathVariable String month) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.loadUserOverridesForMonth(month)));
    }

    @PostMapping("/overrides")
    public Mono<ResponseEntity<Map<String, DayOverride>>> saveOverride(@RequestBody OverrideRequest req) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.saveOverride(req)));
    }

    @PostMapping("/overrides/vacation")
    public Mono<ResponseEntity<Map<String, DayOverride>>> saveVacation(@RequestBody VacationRequest req) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.saveVacation(req)));
    }

    @DeleteMapping("/overrides/{date}")
    public Mono<ResponseEntity<Map<String, DayOverride>>> deleteOverride(@PathVariable String date) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.deleteOverride(date)));
    }

    @GetMapping("/events")
    public Mono<ResponseEntity<EventsResponse>> getAllEvents() {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.getAllEvents()));
    }

    @GetMapping("/events/{month}")
    public Mono<ResponseEntity<List<TrackerEvent>>> getEventsForMonth(@PathVariable String month) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.getEventsForMonth(month)));
    }

    @PostMapping(value = "/overrides/upload", consumes = MediaType.ALL_VALUE)
    public Mono<ResponseEntity<EventsResponse>> uploadOverrides(
            @RequestBody String rawContent,
            @RequestParam(value = "clearAll", defaultValue = "false") boolean clearAll
    ) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.uploadOverrides(rawContent, clearAll)));
    }

    @PostMapping(value = "/events/upload", consumes = MediaType.ALL_VALUE)
    public Mono<ResponseEntity<EventsResponse>> uploadEvents(
            @RequestBody String rawContent,
            @RequestParam(value = "clearAll", defaultValue = "false") boolean clearAll
    ) {
        return Mono.fromCallable(() -> ResponseEntity.ok(eventsManager.uploadEvents(rawContent, clearAll)));
    }
}
