use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::config::Config;

/// Represents an operating system event with a name and timestamp.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Event {
    pub name: String,
    pub timestamp: String,
}

impl Event {
    pub fn new(name: impl Into<String>, timestamp: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            timestamp: timestamp.into(),
        }
    }

    /// Extracts the year and month key (e.g., "2026-04" or "2026_04") from the timestamp.
    pub fn month_key(&self) -> String {
        if self.timestamp.len() >= 7 && (self.timestamp.chars().nth(4) == Some('-') || self.timestamp.chars().nth(4) == Some('_')) {
            self.timestamp[..7].to_string()
        } else {
            "unknown".to_string()
        }
    }
}

/// Trait for reading events grouped by year and month.
pub trait EventReader {
    /// Reads events and returns a map where each key is a month (e.g., `yyyy-mm` or `yyyy_mm`)
    /// and the corresponding value is the list of events for that month.
    fn read_events(&self) -> io::Result<HashMap<String, Vec<Event>>>;
}

/// An `EventReader` implementation that reads monthly `events-yyyy-mm.json` files
/// from the `events` subfolder of a configurable base path.
#[derive(Debug, Clone)]
pub struct FileEventReader {
    config: Config,
}

impl FileEventReader {
    /// Creates a new `FileEventReader` with a configurable config/base path.
    /// It reads from `<base_path>/events`.
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

impl Default for FileEventReader {
    fn default() -> Self {
        Self::new(Config::default())
    }
}

impl EventReader for FileEventReader {
    fn read_events(&self) -> io::Result<HashMap<String, Vec<Event>>> {
        let mut map = HashMap::new();
        let events_dir = self.events_dir();

        if !events_dir.exists() {
            return Ok(map);
        }

        for entry in fs::read_dir(&events_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                    // Match pattern: events-yyyy-mm.json
                    if file_name.starts_with("events-") && file_name.ends_with(".json") {
                        let month_key = &file_name[7..file_name.len() - 5]; // extracts "yyyy-mm"
                        let content = fs::read_to_string(&path)?;
                        if let Ok(events) = serde_json::from_str::<Vec<Event>>(&content) {
                            map.insert(month_key.to_string(), events);
                        }
                    }
                }
            }
        }

        Ok(map)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_creation_and_month_key() {
        let ev = Event::new("STARTUP", "2026-04-08 11:51:43");
        assert_eq!(ev.name, "STARTUP");
        assert_eq!(ev.timestamp, "2026-04-08 11:51:43");
        assert_eq!(ev.month_key(), "2026-04");
    }

    #[test]
    fn test_event_serde() {
        let json_name = r#"{"name":"STARTUP","timestamp":"2026-04-08 11:51:43"}"#;
        let ev: Event = serde_json::from_str(json_name).unwrap();
        assert_eq!(ev.name, "STARTUP");
        assert_eq!(ev.timestamp, "2026-04-08 11:51:43");
    }

    #[test]
    fn test_file_event_reader_events_dir() {
        let reader = FileEventReader::new("my_base");
        assert_eq!(reader.events_dir(), PathBuf::from("my_base").join("events"));

        let default_reader = FileEventReader::default();
        assert_eq!(default_reader.events_dir(), PathBuf::from(".").join("events"));
    }
}
