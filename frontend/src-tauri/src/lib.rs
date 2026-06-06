use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

fn exe_directory() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Could not resolve executable directory".to_string())
}

fn portable_data_directory() -> Result<PathBuf, String> {
    let dir = exe_directory()?.join("data");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data directory: {e}"))?;
    Ok(dir)
}

fn sanitize_filename(filename: &str) -> Result<String, String> {
    if filename.is_empty()
        || filename.contains("..")
        || filename.contains('/')
        || filename.contains('\\')
    {
        return Err(format!("Invalid portable filename: {filename}"));
    }
    Ok(filename.to_string())
}

fn python_candidates() -> Vec<String> {
    if cfg!(windows) {
        vec![
            "python".into(),
            "py".into(),
            "python3".into(),
        ]
    } else {
        vec!["python3".into(), "python".into()]
    }
}

fn auth_script_path() -> Option<PathBuf> {
    let exe_dir = exe_directory().ok()?;
    let candidates = [
        exe_dir.join("rh_auth_bridge.py"),
        exe_dir.join("backend").join("rh_auth_bridge.py"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

#[tauri::command]
fn portable_data_path() -> Result<String, String> {
    Ok(portable_data_directory()?.to_string_lossy().to_string())
}

#[tauri::command]
fn portable_write_file(filename: String, contents: Vec<u8>) -> Result<(), String> {
    let safe = sanitize_filename(&filename)?;
    let path = portable_data_directory()?.join(&safe);
    fs::write(&path, contents).map_err(|e| format!("Failed to write {safe}: {e}"))?;
    Ok(())
}

#[tauri::command]
fn portable_read_file(filename: String) -> Result<Vec<u8>, String> {
    let safe = sanitize_filename(&filename)?;
    let path = portable_data_directory()?.join(&safe);
    fs::read(&path).map_err(|e| format!("Failed to read {safe}: {e}"))
}

#[tauri::command]
fn portable_file_exists(filename: String) -> Result<bool, String> {
    let safe = sanitize_filename(&filename)?;
    let path = portable_data_directory()?.join(&safe);
    Ok(path.is_file())
}

fn append_auth_log(line: &str) {
    if let Ok(dir) = portable_data_directory() {
        let path = dir.join("auth.log");
        let entry = format!("{} {}\n", chrono_lite_timestamp(), line);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = file.write_all(entry.as_bytes());
        }
    }
}

#[tauri::command]
fn rh_python_login(
    username: String,
    password: String,
    mfa_code: Option<String>,
    profile_name: String,
) -> Result<String, String> {
    let script = auth_script_path().ok_or_else(|| {
        "rh_auth_bridge.py not found beside the executable. Copy backend Python auth scripts into the EXE folder.".to_string()
    })?;

    let workdir = script
        .parent()
        .ok_or_else(|| "Invalid auth script path".to_string())?;

    let mut last_error = String::from("No Python interpreter found on PATH");

    for python in python_candidates() {
        let mut cmd = Command::new(&python);
        cmd.current_dir(workdir);
        cmd.arg(&script);
        cmd.arg("login");
        cmd.arg(&username);
        cmd.arg(&password);
        if let Some(ref code) = mfa_code {
            if !code.is_empty() {
                cmd.arg(code);
            }
        }
        cmd.arg("--profile").arg(&profile_name);

        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    append_auth_log(&format!(
                        "python_login profile={profile_name} exit={} stdout={stdout}",
                        output.status
                    ));
                    return Ok(stdout);
                }
                last_error = if stderr.is_empty() {
                    format!("Python auth exited with status {}", output.status)
                } else {
                    stderr
                };
            }
            Err(err) => {
                last_error = format!("Failed to run {python}: {err}");
            }
        }
    }

    append_auth_log(&format!("python_login profile={profile_name} failed: {last_error}"));
    Err(last_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            portable_data_path,
            portable_write_file,
            portable_read_file,
            portable_file_exists,
            rh_python_login,
        ])
        .setup(|app| {
            if let Ok(data_dir) = portable_data_directory() {
                let bootstrap = data_dir.join("storage_ready.json");
                if !bootstrap.exists() {
                    let payload = format!(
                        "{{\"created\":\"{}\",\"path\":\"{}\"}}",
                        chrono_lite_timestamp(),
                        data_dir.display()
                    );
                    let _ = fs::write(&bootstrap, payload);
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}
