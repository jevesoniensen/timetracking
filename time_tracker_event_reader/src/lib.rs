use std::fs::{self, OpenOptions};
use std::io;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub mod config;
pub use config::Config;

pub mod event_reader;
pub use event_reader::{Event, EventReader, FileEventReader};

pub mod event_logger;
pub use event_logger::{save_events_by_month, save_events_by_month_to, FileEventLogger, LogEvent};

#[derive(Serialize, Deserialize, Debug)]
struct SyncState {
    last_timestamp: Option<String>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct PsWinEvent {
    Id: u32,
    #[serde(default)]
    Provider: Option<String>,
    TimeCreated: String,
}

#[cfg(not(target_os = "windows"))]
pub fn sync_windows_events() -> io::Result<()> {
    sync_windows_events_with_config(Config::default())
}

#[cfg(not(target_os = "windows"))]
pub fn sync_windows_events_to(base_path: impl Into<PathBuf>) -> io::Result<()> {
    sync_windows_events_with_config(Config::new(base_path))
}

#[cfg(not(target_os = "windows"))]
pub fn sync_windows_events_with_config(_config: impl Into<Config>) -> io::Result<()> {
    println!("This library only reads Windows event logs when compiled and run on Windows.");
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn sync_windows_events() -> io::Result<()> {
    sync_windows_events_with_config(Config::default())
}

#[cfg(target_os = "windows")]
pub fn sync_windows_events_to(base_path: impl Into<PathBuf>) -> io::Result<()> {
    sync_windows_events_with_config(Config::new(base_path))
}

#[cfg(target_os = "windows")]
pub fn sync_windows_events_with_config(config: impl Into<Config>) -> io::Result<()> {
    let config = config.into();
    let state_path = config.sync_state_path();

    // 1. Load sync state
    let mut state: SyncState = if state_path.exists() {
        let state_content = fs::read_to_string(&state_path)?;
        serde_json::from_str(&state_content).unwrap_or(SyncState { last_timestamp: None })
    } else {
        SyncState { last_timestamp: None }
    };

    let start_work_date = config.effective_start_work_date();

    // Build the PowerShell command
    let effective_start_time: Option<String> = match (&state.last_timestamp, &start_work_date) {
        (Some(last_ts), Some(start_date)) => {
            let start_ts = format!("{} 00:00:00", start_date);
            let month_start = if last_ts.len() >= 7 {
                format!("{}-01 00:00:00", &last_ts[..7])
            } else {
                last_ts.clone()
            };
            let candidate = if start_ts > month_start { start_ts } else { month_start };
            Some(candidate)
        }
        (Some(last_ts), None) => {
            if last_ts.len() >= 7 {
                Some(format!("{}-01 00:00:00", &last_ts[..7]))
            } else {
                Some(last_ts.clone())
            }
        }
        (None, Some(start_date)) => Some(format!("{} 00:00:00", start_date)),
        (None, None) => None,
    };

    let start_time_filter = match &effective_start_time {
        Some(ts) => format!(
            "$startTime = [datetime]::ParseExact('{}', 'yyyy-MM-dd HH:mm:ss', [System.Globalization.CultureInfo]::InvariantCulture); $filter['StartTime'] = $startTime;",
            ts
        ),
        None => String::new(),
    };

    // Query system power and session events from docs/windows-events-mapping.md:
    // 7001 = User Logon (Start)
    // 107  = System resumed from sleep (Start)
    // 6005 = EventLog started / cold boot (Start)
    // 1    = Power-Troubleshooter low power resume (Start)
    // 7002 = User Logoff (End)
    // 42   = System entering sleep (End)
    // 1074 = User/system initiated shutdown or restart (End)
    // 6006 = EventLog stopped / clean shutdown (End)
    // 6008 = Unexpected shutdown (End)
    let ps_script = format!(
        "$filter = @{{LogName='System'; Id=6005,6006,6008,1074,42,107,7001,7002,1}}; \
         {} \
         Get-WinEvent -FilterHashtable $filter -ErrorAction SilentlyContinue | \
         Sort-Object TimeCreated | \
         ForEach-Object {{ \
             [PSCustomObject]@{{ \
                 Id = $_.Id; \
                 Provider = $_.ProviderName; \
                 TimeCreated = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss') \
             }} \
         }} | ConvertTo-Json -Compress",
        start_time_filter
    );

    println!("Querying Windows System logs...");
    
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        println!("Failed to read logs: {}", err);
        return Ok(());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() {
        println!("No new events found.");
        return Ok(());
    }

    // PowerShell ConvertTo-Json returns a single object if there's only 1 item, or an array if >1.
    let ps_events: Vec<PsWinEvent> = if trimmed.starts_with('[') {
        serde_json::from_str(trimmed).unwrap_or_else(|_| Vec::new())
    } else {
        match serde_json::from_str::<PsWinEvent>(trimmed) {
            Ok(single) => vec![single],
            Err(_) => Vec::new(),
        }
    };

    let mut new_events = Vec::new();
    let mut latest_timestamp = state.last_timestamp.clone();

    for ev in ps_events {
        let provider = ev.Provider.as_deref().unwrap_or("");
        let (event_name, event_type) = match ev.Id {
            7001 => ("LOGON".to_string(), "START".to_string()),
            107 => ("RESUME".to_string(), "START".to_string()),
            6005 => ("STARTUP".to_string(), "START".to_string()),
            1 if provider.contains("Power-Troubleshooter") => ("WAKE".to_string(), "START".to_string()),
            7002 => ("LOGOFF".to_string(), "END".to_string()),
            42 => ("SLEEP".to_string(), "END".to_string()),
            1074 => ("USER_SHUTDOWN".to_string(), "END".to_string()),
            6006 => ("SHUTDOWN".to_string(), "END".to_string()),
            6008 => ("UNEXPECTED_SHUTDOWN".to_string(), "END".to_string()),
            _ => continue,
        };

        // Ignore any events before the configured start work date
        if let Some(ref start_date) = start_work_date {
            if ev.TimeCreated.len() >= 10 && &ev.TimeCreated[..10] < start_date.as_str() {
                continue;
            }
        }
        
        let new_ev = Event::with_type(event_name, ev.TimeCreated.clone(), event_type);

        latest_timestamp = Some(ev.TimeCreated);
        new_events.push(new_ev);
    }

    if !new_events.is_empty() {
        let count = new_events.len();
        let logger = FileEventLogger::new(&config);
        // Save events split by month into <base_path>/events/events-yyyy-mm.json
        logger.log_events(&new_events)?;

        // Update state
        state.last_timestamp = latest_timestamp;
        let state_file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&state_path)?;
        serde_json::to_writer_pretty(state_file, &state)?;

        println!(
            "Added {} new events into {:?}. Last timestamp: {:?}",
            count,
            logger.events_dir(),
            state.last_timestamp.as_deref().unwrap_or("None")
        );
    } else {
        println!("No new events found.");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_logger_reexport() {
        assert_eq!(
            event_logger::get_json_output_path("2026-04-08 11:51:43"),
            "events-2026-04.json"
        );
    }
}
