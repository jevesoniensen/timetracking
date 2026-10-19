use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const SERVER_PORT: u16 = 8080;
const SERVER_URL: &str = "http://localhost:8080";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);

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
    ServerReady,
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

fn spawn_server() -> Result<Child, String> {
    let jar = find_server_jar().ok_or_else(|| {
        "Server jar not found next to the executable. Rebuild with cargo (unset TIME_TRACKER_SKIP_SERVER_BUILD)"
            .to_string()
    })?;
    println!("Starting server: {:?}", jar);

    let java = find_java();
    println!("Using Java: {:?}", java);
    let mut cmd = Command::new(&java);
    if let Some(parent) = jar.parent() {
        cmd.current_dir(parent);
    }
    cmd.arg("-jar")
        .arg(&jar)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to start server using {:?} (set JAVA_HOME or add Java to PATH): {}", java, e))
}

fn wait_until_ready(server: &Mutex<Option<Child>>) -> Result<(), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], SERVER_PORT));
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

fn stop_server(server: &Mutex<Option<Child>>) {
    if let Some(mut child) = server.lock().unwrap().take() {
        let pid = child.id();
        println!("Stopping server (PID: {})...", pid);

        #[cfg(target_os = "windows")]
        {
            // Forcefully terminate the Java process and its entire process tree
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }

        let _ = child.kill();
        let _ = child.wait();
        println!("Server stopped successfully.");
    }
}

#[cfg(target_os = "windows")]
fn kill_orphaned_server_if_port_busy() {
    let addr = SocketAddr::from(([127, 0, 0, 1], SERVER_PORT));
    if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
        println!("Port {} is in use. Terminating orphaned process...", SERVER_PORT);
        let script = format!(
            "Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | \
             ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}",
            SERVER_PORT
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output();
        thread::sleep(Duration::from_millis(500));
    }
}

const DEFAULT_CONFIG_CONTENT: &str = "\
# Time Tracker Configuration
# Default lunch break start and end times (24-hour HH:mm format)
# The overlapping portion with the work interval is deducted from daily worked hours.
lunch.default.start=12:30
lunch.default.end=13:30
";

fn ensure_default_config(app_dir: & std::path::Path) {
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

    #[cfg(target_os = "windows")]
    kill_orphaned_server_if_port_busy();

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

    // Start the server and wait for it off the UI thread so the spinner keeps animating.
    {
        let server = Arc::clone(&server);
        thread::spawn(move || {
            let result = spawn_server().and_then(|child| {
                *server.lock().unwrap() = Some(child);
                wait_until_ready(&server)
            });
            let _ = proxy.send_event(match result {
                Ok(()) => UserEvent::ServerReady,
                Err(msg) => UserEvent::ServerFailed(msg),
            });
        });
    }

    let server_exit = Arc::clone(&server);
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::ServerReady) => {
                if let Some(webview) = webview.as_ref() {
                    let _ = webview.load_url(SERVER_URL);
                }
            }
            Event::UserEvent(UserEvent::ServerFailed(msg)) => {
                eprintln!("{}", msg);
                stop_server(&server_exit);
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
                stop_server(&server_exit);
                *control_flow = ControlFlow::Exit;
            }
            Event::LoopDestroyed => {
                stop_server(&server_exit);
            }
            _ => {}
        }
    });
}
