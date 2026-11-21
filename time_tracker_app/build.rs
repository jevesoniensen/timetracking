use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Name of the jar copied next to the compiled executable.
const JAR_NAME: &str = "time-tracker-server.jar";
/// Name of the CDS shared archive generated next to the compiled executable.
const JSA_NAME: &str = "time-tracker-server.jsa";

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest_dir.parent().unwrap().to_path_buf();
    let server_dir = root.join("time-tracker-local-server");

    // Rebuild when the server or UI sources change.
    println!("cargo:rerun-if-changed={}", manifest_dir.join("config.properties").display());
    println!("cargo:rerun-if-changed={}", server_dir.join("src/main/java").display());
    println!("cargo:rerun-if-changed={}", server_dir.join("src/main/resources/application.yaml").display());
    println!("cargo:rerun-if-changed={}", server_dir.join("src/main/resources/config.properties").display());
    println!("cargo:rerun-if-changed={}", server_dir.join("build.gradle").display());
    println!("cargo:rerun-if-changed={}", server_dir.join("build/libs").display());
    println!("cargo:rerun-if-changed={}", root.join("time-tracker-ui").join("src").display());
    println!("cargo:rerun-if-changed={}", root.join("time-tracker-ui").join("package.json").display());
    println!("cargo:rerun-if-env-changed=TIME_TRACKER_SKIP_SERVER_BUILD");

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let profile_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("unexpected OUT_DIR layout")
        .to_path_buf();

    // Ensure config.properties exists next to the executable (copy default template if missing).
    let src_config = manifest_dir.join("config.properties");
    let dst_config = profile_dir.join("config.properties");
    if src_config.exists() && !dst_config.exists() {
        let _ = fs::copy(&src_config, &dst_config);
        println!("cargo:warning=config.properties copied to {}", dst_config.display());
    }

    let skip_gradle = env::var_os("TIME_TRACKER_SKIP_SERVER_BUILD").is_some();
    if skip_gradle {
        println!("cargo:warning=Skipping Spring Boot Gradle build (TIME_TRACKER_SKIP_SERVER_BUILD set)");
    } else {
        // 1. Build the Spring Boot jar (this also builds the React UI via Gradle).
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(["/c", "gradlew.bat", "bootJar", "--console=plain"]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["./gradlew", "bootJar", "--console=plain"]);
            c
        };
        cmd.current_dir(&server_dir);

        if env::var_os("JAVA_HOME").is_none() {
            let dev_sdk = Path::new(r"D:\dev\sdk\java\jdk-25.0.4.1+1");
            if dev_sdk.exists() {
                cmd.env("JAVA_HOME", dev_sdk);
                if let Some(path) = env::var_os("PATH") {
                    let mut new_path = dev_sdk.join("bin").into_os_string();
                    new_path.push(";");
                    new_path.push(path);
                    cmd.env("PATH", new_path);
                }
            }
        }

        let status = cmd.status();
        match status {
            Ok(s) if s.success() => {}
            Ok(s) => panic!("Gradle bootJar failed with {}", s),
            Err(e) => panic!("Could not run Gradle in {:?}: {}", server_dir, e),
        }
    }

    // 2. Locate the executable jar (skip the "-plain" jar).
    let libs = server_dir.join("build").join("libs");
    let jar = fs::read_dir(&libs)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            name.ends_with(".jar") && !name.ends_with("-plain.jar")
        })
        .max_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok());

    let Some(jar) = jar else {
        if skip_gradle {
            println!("cargo:warning=No bootJar found in {:?}; skipping jar copy and JRE creation", libs);
            return;
        }
        panic!("No bootJar found in {:?}", libs);
    };

    // 3. Copy it to the target profile dir (e.g. target/debug), next to the executable.
    let target_jar = profile_dir.join(JAR_NAME);
    let jar_updated = copy_jar(&jar, &target_jar);

    // 4. Ensure an embedded minimal JRE exists next to the executable.
    let jre_dir = profile_dir.join("jre");
    create_embedded_jre(&jre_dir);

    // 5. Train the JVM CDS archive (time-tracker-server.jsa) if building via cargo directly.
    let target_jsa = profile_dir.join(JSA_NAME);
    if !skip_gradle && (jar_updated || !target_jsa.exists()) {
        train_cds_archive(&profile_dir, &jre_dir);
    }
}

fn copy_jar(from: &Path, to: &Path) -> bool {
    if let Ok(dest_meta) = fs::metadata(to) {
        if let Ok(src_meta) = fs::metadata(from) {
            if let (Ok(dest_time), Ok(src_time)) = (dest_meta.modified(), src_meta.modified()) {
                if dest_time >= src_time {
                    return false;
                }
            }
        }
    }
    fs::copy(from, to).unwrap_or_else(|e| panic!("Failed to copy {:?} to {:?}: {}", from, to, e));
    println!("cargo:warning=Server jar copied to {}", to.display());
    true
}

fn find_jlink() -> PathBuf {
    let exe = if cfg!(target_os = "windows") { "jlink.exe" } else { "jlink" };

    if let Some(home) = env::var_os("JAVA_HOME") {
        let candidate = PathBuf::from(home).join("bin").join(exe);
        if candidate.exists() {
            return candidate;
        }
    }

    let dev_sdk = PathBuf::from(r"D:\dev\sdk\java\jdk-25.0.4.1+1\bin").join(exe);
    if dev_sdk.exists() {
        return dev_sdk;
    }

    PathBuf::from(exe)
}

fn create_embedded_jre(target_jre_dir: &Path) {
    let java_exe = target_jre_dir.join("bin").join(if cfg!(target_os = "windows") { "java.exe" } else { "java" });
    if java_exe.exists() {
        return;
    }

    if target_jre_dir.exists() {
        let _ = fs::remove_dir_all(target_jre_dir);
    }

    let jlink_exe = find_jlink();
    println!("cargo:warning=Creating embedded minimal JRE in {}...", target_jre_dir.display());

    let modules = [
        "java.base",
        "java.logging",
        "java.naming",
        "java.desktop",
        "java.management",
        "java.security.jgss",
        "java.instrument",
        "java.sql",
        "java.xml",
        "java.net.http",
        "jdk.unsupported",
    ].join(",");

    let status = Command::new(&jlink_exe)
        .args([
            "--no-header-files",
            "--no-man-pages",
            "--strip-debug",
            "--generate-cds-archive",
            "--add-modules",
            &modules,
            "--output",
        ])
        .arg(target_jre_dir)
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=Embedded minimal JRE generated successfully.");
        }
        Ok(s) => panic!("jlink failed with exit code: {}", s),
        Err(e) => panic!("Failed to run jlink ({:?}): {}", jlink_exe, e),
    }
}

fn train_cds_archive(profile_dir: &Path, jre_dir: &Path) {
    let java_exe = jre_dir.join("bin").join(if cfg!(target_os = "windows") { "java.exe" } else { "java" });
    if !java_exe.exists() {
        return;
    }

    let win_base_cds = jre_dir.join("bin").join("server").join("classes.jsa");
    let unix_base_cds = jre_dir.join("lib").join("server").join("classes.jsa");
    if !win_base_cds.exists() && !unix_base_cds.exists() {
        let _ = Command::new(&java_exe)
            .arg("-Xshare:dump")
            .current_dir(profile_dir)
            .status();
    }

    let jsa_path = profile_dir.join(JSA_NAME);
    if jsa_path.exists() {
        let _ = fs::remove_file(&jsa_path);
    }

    println!("cargo:warning=Training CDS archive at {}...", jsa_path.display());
    let status = Command::new(&java_exe)
        .current_dir(profile_dir)
        .arg(format!("-XX:ArchiveClassesAtExit={}", JSA_NAME))
        .arg("-Dspring.context.exit=onRefresh")
        .arg("-jar")
        .arg(JAR_NAME)
        .status();

    match status {
        Ok(s) if s.success() && jsa_path.exists() => {
            println!("cargo:warning=CDS archive generated at {}", jsa_path.display());
        }
        Ok(s) => panic!("CDS training run failed with exit code: {}", s),
        Err(e) => panic!("Failed to run Java for CDS training ({:?}): {}", java_exe, e),
    }
}
