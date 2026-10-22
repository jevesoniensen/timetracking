#![windows_subsystem = "windows"]

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);

#[cfg(target_os = "windows")]
#[repr(C)]
struct WinSystemTime {
    w_year: u16,
    w_month: u16,
    w_day_of_week: u16,
    w_day: u16,
    w_hour: u16,
    w_minute: u16,
    w_second: u16,
    w_milliseconds: u16,
}

#[cfg(target_os = "windows")]
extern "system" {
    fn GetLocalTime(lp_system_time: *mut WinSystemTime);
}

fn current_timestamp() -> String {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut st = WinSystemTime {
            w_year: 0,
            w_month: 0,
            w_day_of_week: 0,
            w_day: 0,
            w_hour: 0,
            w_minute: 0,
            w_second: 0,
            w_milliseconds: 0,
        };
        GetLocalTime(&mut st);
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            st.w_year, st.w_month, st.w_day, st.w_hour, st.w_minute, st.w_second
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("Unix {}", secs)
    }
}

fn log_to_app_log(app_dir: &std::path::Path, message: &str) {
    let logs_dir = app_dir.join("logs");
    if !logs_dir.exists() {
        let _ = std::fs::create_dir_all(&logs_dir);
    }
    let log_path = logs_dir.join("app.log");
    let line = format!("[{}] {}\n", current_timestamp(), message);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        use std::io::Write;
        let _ = file.write_all(line.as_bytes());
    }
    println!("[app.log] {}", message);
}

/// Finds a random free port as high as possible in the dynamic port range (50000..=65534).
fn find_free_high_port() -> Result<u16, String> {
    use std::net::TcpListener;
    use std::time::SystemTime;

    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(123456789);
    let pid = std::process::id() as u128;
    let mut seed = (nanos ^ (pid << 16)) as u64;

    // Linear congruential generator for pseudo-random numbers
    let mut next_rand = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (seed >> 32) as u32
    };

    const MIN_PORT: u16 = 50000;
    const MAX_PORT: u16 = 65534;
    const RANGE: u32 = (MAX_PORT - MIN_PORT + 1) as u32;

    let start_offset = next_rand() % RANGE;
    for i in 0..RANGE {
        let port = (MIN_PORT as u32 + (start_offset + i) % RANGE) as u16;
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            drop(listener);
            return Ok(port);
        }
    }

    // Fallback: ask OS for an ephemeral free port
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|addr| addr.port())
        .map_err(|e| format!("Could not find any free port: {}", e))
}

const LOADING_HTML: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><title>Time Tracker</title>
<style>
  html,body{height:100%;margin:0;background:#0f172a;color:#e2e8f0;
    font-family:'Segoe UI',system-ui,sans-serif}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px}
  .spinner{width:56px;height:56px;border:5px solid #334155;border-top-color:#38bdf8;
    border-radius:50%;animation:spin 0.9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;letter-spacing:.05em;opacity:.8}
</style></head>
<body><div class="spinner"></div><p>Starting Time Tracker...</p></body></html>"#;

fn error_html(message: &str) -> String {
    format!(
        "<html><body style=\"background:#0f172a;color:#fca5a5;font-family:Segoe UI,sans-serif;\
         display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
         <p>{}</p></body></html>",
        message
    )
}

/// Events sent from the background thread to the UI thread.
enum UserEvent {
    ServerReady(u16),
    ServerFailed(String),
}

/// Finds the server jar that build.rs copies next to the executable (target/<profile>).
fn find_server_jar() -> Option<PathBuf> {
    let jar = std::env::current_exe()
        .ok()?
        .parent()?
        .join("time-tracker-server.jar");
    jar.exists().then_some(jar)
}

/// Locates the Java executable:
/// 1. Embedded minimal JRE next to the executable: `<exe_dir>\jre\bin\java(.exe)`
/// 2. `JAVA_HOME\bin\java(.exe)` if set and valid.
/// 3. Otherwise `java` from PATH.
fn find_java() -> PathBuf {
    let exe = if cfg!(target_os = "windows") { "java.exe" } else { "java" };

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let embedded = exe_dir.join("jre").join("bin").join(exe);
            if embedded.exists() {
                return embedded;
            }
        }
    }

    if let Some(home) = std::env::var_os("JAVA_HOME") {
        let candidate = PathBuf::from(home).join("bin").join(exe);
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from("java")
}

fn spawn_server(port: u16) -> Result<Child, String> {
    let jar = find_server_jar().ok_or_else(|| {
        "Server jar not found next to the executable. Rebuild with cargo (unset TIME_TRACKER_SKIP_SERVER_BUILD)"
            .to_string()
    })?;
    println!("Starting server on port {}: {:?}", port, jar);

    let java = find_java();
    println!("Using Java: {:?}", java);
    let mut cmd = Command::new(&java);
    if let Some(parent) = jar.parent() {
        cmd.current_dir(parent);
    }
    cmd.arg("-jar")
        .arg(&jar)
        .arg(format!("--server.port={}", port))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to start server using {:?} (set JAVA_HOME or add Java to PATH): {}", java, e))
}

fn wait_until_ready(server: &Mutex<Option<Child>>, port: u16) -> Result<(), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let start = Instant::now();
    while start.elapsed() < STARTUP_TIMEOUT {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return Ok(());
        }
        // Detect a server that died during startup.
        if let Some(child) = server.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("Server exited during startup ({})", status));
            }
        }
        thread::sleep(Duration::from_millis(300));
    }
    Err("Timed out waiting for the server to start".to_string())
}

fn stop_server(server: &Mutex<Option<Child>>, app_dir: Option<&std::path::Path>) {
    if let Some(mut child) = server.lock().unwrap().take() {
        let pid = child.id();
        println!("Stopping server (PID: {})...", pid);
        if let Some(dir) = app_dir {
            log_to_app_log(dir, &format!("Server stopped (PID: {})", pid));
        }

        #[cfg(target_os = "windows")]
        {
            // Forcefully terminate the Java process and its entire process tree
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }

        let _ = child.kill();
        let _ = child.wait();
        println!("Server stopped successfully.");
    }
}

const DEFAULT_CONFIG_CONTENT: &str = "\
# Time Tracker Configuration
# Default lunch break start and end times (24-hour HH:mm format)
# The overlapping portion with the work interval is deducted from daily worked hours.
lunch.default.start=12:30
lunch.default.end=13:30

# Default expected working hours per day
work.default.hours.per.day=8

# Start work date (YYYY-MM-DD). Leave empty to be prompted on first app startup.
work.start.date=
";

fn ensure_default_config(app_dir: &std::path::Path) {
    let config_path = app_dir.join("config.properties");
    if !config_path.exists() {
        if let Err(e) = std::fs::write(&config_path, DEFAULT_CONFIG_CONTENT) {
            eprintln!("Failed to create default config.properties at {:?}: {}", config_path, e);
        } else {
            println!("Created default config.properties at {:?}", config_path);
        }
    }
}

fn main() {
    println!("Starting time_tracker_app...");

    let app_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    ensure_default_config(&app_dir);

    #[cfg(target_os = "windows")]
    {
        if let Err(e) = time_tracker_event_reader::sync_windows_events_to(&app_dir) {
            eprintln!("Failed to sync Windows events: {}", e);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // This gracefully calls the non-windows fallback from the library
        let _ = time_tracker_event_reader::sync_windows_events_to(&app_dir);
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = WindowBuilder::new()
        .with_title("Time Tracker")
        .with_inner_size(tao::dpi::LogicalSize::new(1200.0, 800.0))
        .build(&event_loop)
        .expect("failed to create window");

    let mut webview = Some(
        WebViewBuilder::new()
            .with_html(LOADING_HTML)
            .build(&window)
            .expect("failed to create webview"),
    );
    let mut window = Some(window);

    let server: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    // Start the server on a free high port and wait for it off the UI thread so the spinner keeps animating.
    {
        let server = Arc::clone(&server);
        let app_dir_for_thread = app_dir.clone();
        thread::spawn(move || {
            let port_res = find_free_high_port();
            let result = port_res.and_then(|port| {
                log_to_app_log(
                    &app_dir_for_thread,
                    &format!("Selected dynamic free port {}", port),
                );
                spawn_server(port).and_then(|child| {
                    let pid = child.id();
                    *server.lock().unwrap() = Some(child);
                    match wait_until_ready(&server, port) {
                        Ok(()) => {
                            log_to_app_log(
                                &app_dir_for_thread,
                                &format!("Server successfully started on port {} (PID: {})", port, pid),
                            );
                            Ok(port)
                        }
                        Err(e) => {
                            log_to_app_log(
                                &app_dir_for_thread,
                                &format!("Server on port {} failed to become ready: {}", port, e),
                            );
                            Err(e)
                        }
                    }
                })
            });
            let _ = proxy.send_event(match result {
                Ok(port) => UserEvent::ServerReady(port),
                Err(msg) => UserEvent::ServerFailed(msg),
            });
        });
    }

    let server_exit = Arc::clone(&server);
    let app_dir_exit = app_dir.clone();
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::ServerReady(port)) => {
                if let Some(webview) = webview.as_ref() {
                    let server_url = format!("http://localhost:{}", port);
                    let _ = webview.load_url(&server_url);
                }
            }
            Event::UserEvent(UserEvent::ServerFailed(msg)) => {
                eprintln!("{}", msg);
                stop_server(&server_exit, Some(&app_dir_exit));
                let html = error_html(&msg);
                if let Some(webview) = webview.as_ref() {
                    let _ = webview.evaluate_script(&format!(
                        "document.open();document.write({:?});document.close();",
                        html
                    ));
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                println!("Window close triggered. Stopping server and exiting...");
                drop(webview.take());
                drop(window.take());
            }
            Event::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            } => {
                stop_server(&server_exit, Some(&app_dir_exit));
                *control_flow = ControlFlow::Exit;
            }
            Event::LoopDestroyed => {
                stop_server(&server_exit, Some(&app_dir_exit));
            }
            _ => {}
        }
    });
}
