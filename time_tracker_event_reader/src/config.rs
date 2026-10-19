use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

/// Configuration for reading and logging OS events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    pub base_path: PathBuf,
}

impl Config {
    /// Creates a new `Config` with the specified base path.
    pub fn new(base_path: impl Into<PathBuf>) -> Self {
        Self {
            base_path: base_path.into(),
        }
    }

    /// Returns the path to the events directory (`<base_path>/events`).
    pub fn events_dir(&self) -> PathBuf {
        self.base_path.join("events")
    }

    /// Returns the path to the sync state file (`<base_path>/sync_state.json`).
    pub fn sync_state_path(&self) -> PathBuf {
        self.base_path.join("sync_state.json")
    }

    /// Returns a reference to the base path.
    pub fn base_path(&self) -> &Path {
        &self.base_path
    }
}

impl Default for Config {
    fn default() -> Self {
        Self::new(".")
    }
}

impl From<&str> for Config {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}

impl From<String> for Config {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

impl From<PathBuf> for Config {
    fn from(p: PathBuf) -> Self {
        Self::new(p)
    }
}

impl From<&Path> for Config {
    fn from(p: &Path) -> Self {
        Self::new(p)
    }
}

impl From<&PathBuf> for Config {
    fn from(p: &PathBuf) -> Self {
        Self::new(p)
    }
}

impl From<&Config> for Config {
    fn from(c: &Config) -> Self {
        c.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_paths() {
        let config = Config::new("tracker_data");
        assert_eq!(config.base_path(), Path::new("tracker_data"));
        assert_eq!(config.events_dir(), PathBuf::from("tracker_data").join("events"));
        assert_eq!(config.sync_state_path(), PathBuf::from("tracker_data").join("sync_state.json"));
    }

    #[test]
    fn test_config_default() {
        let config = Config::default();
        assert_eq!(config.base_path(), Path::new("."));
        assert_eq!(config.events_dir(), PathBuf::from(".").join("events"));
        assert_eq!(config.sync_state_path(), PathBuf::from(".").join("sync_state.json"));
    }

    #[test]
    fn test_config_from_conversions() {
        let c1: Config = "custom_path".into();
        assert_eq!(c1.base_path(), Path::new("custom_path"));

        let c2: Config = PathBuf::from("another_path").into();
        assert_eq!(c2.base_path(), Path::new("another_path"));
    }
}
