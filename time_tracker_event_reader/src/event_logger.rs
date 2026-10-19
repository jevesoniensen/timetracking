use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::event_reader::Event;

/// Trait for logging / writing events.
pub trait LogEvent {
    /// Logs / writes a slice of events.
    fn log_events(&self, events: &[Event]) -> io::Result<()>;

    /// Convenience method to log a single event.
    fn log_event(&self, event: &Event) -> io::Result<()> {
        self.log_events(std::slice::from_ref(event))
    }
}

/// Alias for trait `LogEvent` adhering to standard naming conventions.
pub use LogEvent as EventLogger;

/// Derive the output file path according to the pattern `events-yyyy-mm.json`.
pub fn get_json_output_path(timestamp: &str) -> String {
    if timestamp.len() >= 7 && timestamp.chars().nth(4) == Some('-') {
        let yyyy_mm = &timestamp[..7];
        format!("events-{}.json", yyyy_mm)
    } else {
        "events-unknown.json".to_string()
    }
}

/// An `EventLogger` / `LogEvent` implementation that writes events into monthly files (`events-yyyy-mm.json`)
/// within a configurable base path under the `events` subfolder.
#[derive(Debug, Clone)]
pub struct FileEventLogger {
    config: Config,
}

impl FileEventLogger {
    /// Creates a new `FileEventLogger` with a configurable config/base path.
    /// Event files will be saved in `<base_path>/events/events-yyyy-mm.json`.
    pub fn new(config: impl Into<Config>) -> Self {
        Self {
            config: config.into(),
        }
    }

    /// Returns a reference to the configuration.
    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Returns the path to the `events` subfolder (`<base_path>/events`).
    pub fn events_dir(&self) -> PathBuf {
        self.config.events_dir()
    }

    /// Returns the configured base path.
    pub fn base_path(&self) -> &Path {
        self.config.base_path()
    }
}

impl Default for FileEventLogger {
    fn default() -> Self {
        Self::new(Config::default())
    }
}

impl LogEvent for FileEventLogger {
    fn log_events(&self, events: &[Event]) -> io::Result<()> {
        if events.is_empty() {
            return Ok(());
        }

        let events_dir = self.events_dir();
        if !events_dir.exists() {
            fs::create_dir_all(&events_dir)?;
        }

        let mut grouped: BTreeMap<String, Vec<Event>> = BTreeMap::new();
        for ev in events {
            let file_name = get_json_output_path(&ev.timestamp);
            grouped.entry(file_name).or_default().push(ev.clone());
        }

        for (file_name, new_evs) in grouped {
            let output_path = events_dir.join(file_name);
            let mut month_events: Vec<Event> = if output_path.exists() {
                let content = fs::read_to_string(&output_path)?;
                if content.trim().is_empty() {
                    Vec::new()
                } else {
                    serde_json::from_str(&content).map_err(|e| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("Failed to parse {}: {}", output_path.display(), e),
                        )
                    })?
                }
            } else {
                Vec::new()
            };

            let initial_count = month_events.len();

            for ev in new_evs {
                // Ensure previous events are preserved and duplicates (same name and timestamp) are not added
                if !month_events
                    .iter()
                    .any(|e| e.name == ev.name && e.timestamp == ev.timestamp)
                {
                    month_events.push(ev);
                }
            }

            // Only write back to disk if new events were added or file doesn't exist yet
            if !output_path.exists() || month_events.len() > initial_count {
                // Maintain chronological ordering
                month_events.sort_by(|a, b| {
                    a.timestamp.cmp(&b.timestamp).then_with(|| a.name.cmp(&b.name))
                });

                let file = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .open(&output_path)?;
                serde_json::to_writer_pretty(file, &month_events)?;
            }
        }

        Ok(())
    }
}

/// Convenience function that writes events to monthly files in the `events` subfolder of `config`.
pub fn save_events_by_month_to(events: &[Event], config: impl Into<Config>) -> io::Result<()> {
    FileEventLogger::new(config).log_events(events)
}

/// Convenience function that writes events to monthly files in `./events`.
pub fn save_events_by_month(events: &[Event]) -> io::Result<()> {
    FileEventLogger::default().log_events(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_json_output_path() {
        assert_eq!(get_json_output_path("2026-04-08 11:51:43"), "events-2026-04.json");
        assert_eq!(get_json_output_path("2026-10-11 21:49:16"), "events-2026-10.json");
        assert_eq!(get_json_output_path("2025-12-31 23:59:59"), "events-2025-12.json");
        assert_eq!(get_json_output_path("invalid"), "events-unknown.json");
    }

    #[test]
    fn test_file_event_logger_events_dir() {
        let logger = FileEventLogger::new("my_base");
        assert_eq!(logger.events_dir(), PathBuf::from("my_base").join("events"));

        let default_logger = FileEventLogger::default();
        assert_eq!(default_logger.events_dir(), PathBuf::from(".").join("events"));
    }

    #[test]
    fn test_log_events_preserves_and_deduplicates() {
        use std::env;

        let temp_dir = env::temp_dir().join(format!("event_logger_test_{}", std::process::id()));
        let logger = FileEventLogger::new(&temp_dir);

        let ev1 = Event::new("STARTUP", "2026-05-01 08:00:00");
        let ev2 = Event::new("SHUTDOWN", "2026-05-01 17:00:00");

        // 1. Initial write
        logger.log_events(&[ev1.clone(), ev2.clone()]).unwrap();

        let event_file = logger.events_dir().join("events-2026-05.json");
        assert!(event_file.exists());

        let read1: Vec<Event> = serde_json::from_str(&fs::read_to_string(&event_file).unwrap()).unwrap();
        assert_eq!(read1.len(), 2);
        assert_eq!(read1[0], ev1);
        assert_eq!(read1[1], ev2);

        // 2. Incremental write with duplicate (ev1) + a new event (ev3)
        let ev3 = Event::new("STARTUP", "2026-05-02 09:00:00");
        logger.log_events(&[ev1.clone(), ev3.clone()]).unwrap();

        let read2: Vec<Event> = serde_json::from_str(&fs::read_to_string(&event_file).unwrap()).unwrap();
        // Should have 3 events (ev1 was not duplicated, ev2 was preserved, ev3 was appended)
        assert_eq!(read2.len(), 3);
        assert_eq!(read2[0], ev1);
        assert_eq!(read2[1], ev2);
        assert_eq!(read2[2], ev3);

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
