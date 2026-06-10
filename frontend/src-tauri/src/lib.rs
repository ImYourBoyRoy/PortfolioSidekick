use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const RH_CLIENT_ID: &str = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS";
const RH_API: &str = "https://api.robinhood.com";
const VAULT_PLAINTEXT_LEGACY: &str = "robinhood_vault.json";
const VAULT_ENCRYPTED: &str = "robinhood_vault.enc";
const VAULT_KEY_FILE: &str = ".vault_key";

fn load_or_create_vault_key() -> Result<[u8; 32], String> {
    let path = portable_data_directory()?.join(VAULT_KEY_FILE);
    if path.is_file() {
        let bytes = std::fs::read(&path).map_err(|e| format!("read vault key: {e}"))?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
    }
    let mut key = [0u8; 32];
    rand::rng().fill(&mut key);
    std::fs::write(&path, key).map_err(|e| format!("write vault key: {e}"))?;
    auth_log_append_line("vault key created (.vault_key beside data/)");
    Ok(key)
}

fn encrypt_vault_bytes(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("vault cipher: {e}"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("vault encrypt: {e}"))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend(ciphertext);
    Ok(out)
}

fn decrypt_vault_bytes(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if data.len() < 13 {
        return Err("vault file corrupt or empty".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("vault cipher: {e}"))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("vault decrypt: {e}"))
}

fn migrate_plaintext_vault() -> Result<(), String> {
    let dir = portable_data_directory()?;
    let plain = dir.join(VAULT_PLAINTEXT_LEGACY);
    let enc = dir.join(VAULT_ENCRYPTED);
    if plain.is_file() && !enc.is_file() {
        let json = std::fs::read_to_string(&plain).map_err(|e| format!("read legacy vault: {e}"))?;
        vault_write_inner(&json)?;
        let _ = std::fs::remove_file(&plain);
        auth_log_append_line("vault migrated plaintext robinhood_vault.json -> AES-256-GCM enc");
    }
    Ok(())
}

fn vault_write_inner(json: &str) -> Result<(), String> {
    let key = load_or_create_vault_key()?;
    let enc = encrypt_vault_bytes(json.as_bytes(), &key)?;
    let path = portable_data_directory()?.join(VAULT_ENCRYPTED);
    std::fs::write(&path, enc).map_err(|e| format!("write encrypted vault: {e}"))?;
    let plain = portable_data_directory()?.join(VAULT_PLAINTEXT_LEGACY);
    if plain.is_file() {
        let _ = std::fs::remove_file(plain);
    }
    Ok(())
}

#[tauri::command]
fn vault_read() -> Result<String, String> {
    migrate_plaintext_vault()?;
    let enc_path = portable_data_directory()?.join(VAULT_ENCRYPTED);
    if !enc_path.is_file() {
        return Ok(r#"{"sessions":{},"challenges":{},"usernames":{}}"#.to_string());
    }
    let data = std::fs::read(&enc_path).map_err(|e| format!("read encrypted vault: {e}"))?;
    let key = load_or_create_vault_key()?;
    let plain = decrypt_vault_bytes(&data, &key)?;
    String::from_utf8(plain).map_err(|e| format!("vault utf8: {e}"))
}

#[tauri::command]
fn vault_write(json: String) -> Result<(), String> {
    vault_write_inner(&json)?;
    Ok(())
}

fn exe_directory() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Could not resolve executable directory".to_string())
}

fn portable_data_directory() -> Result<PathBuf, String> {
    let dir = exe_directory()?.join("data");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data directory: {e}"))?;
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

fn auth_log_append_line(line: &str) {
    if let Ok(dir) = portable_data_directory() {
        let path = dir.join("auth.log");
        let entry = format!("{} {line}\n", chrono_lite_timestamp());
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = file.write_all(entry.as_bytes());
        }
    }
}

#[tauri::command]
fn auth_log_append(line: String) -> Result<(), String> {
    auth_log_append_line(&line);
    Ok(())
}

fn build_robinhood_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .cookie_store(true)
        .connect_timeout(Duration::from_secs(16))
        .timeout(Duration::from_secs(16))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Failed to build Robinhood HTTP client: {e}"))
}

fn generate_device_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut token = String::new();
    let mut state = seed;
    for i in 0..16 {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
        let byte = ((state >> 32) & 0xff) as u8;
        token.push_str(&format!("{:02x}", byte));
        if [3, 5, 7, 9].contains(&i) {
            token.push('-');
        }
    }
    token
}

fn rh_headers() -> HeaderMap {
    let mut map = HeaderMap::new();
    map.insert("accept", HeaderValue::from_static("*/*"));
    map.insert("user-agent", HeaderValue::from_static("*"));
    map.insert(
        "x-robinhood-api-version",
        HeaderValue::from_static("1.431.4"),
    );
    map
}

fn form_bool(value: bool) -> String {
    if value {
        "True".into()
    } else {
        "False".into()
    }
}

fn build_login_form(username: &str, password: &str, device_token: &str) -> HashMap<String, String> {
    HashMap::from([
        ("client_id".into(), RH_CLIENT_ID.into()),
        ("expires_in".into(), "86400".into()),
        ("grant_type".into(), "password".into()),
        ("password".into(), password.into()),
        ("scope".into(), "internal".into()),
        ("username".into(), username.into()),
        ("device_token".into(), device_token.into()),
        ("try_passkeys".into(), form_bool(false)),
        ("token_request_path".into(), "/login".into()),
        (
            "create_read_only_secondary_token".into(),
            form_bool(true),
        ),
    ])
}

#[derive(Clone, Serialize, Deserialize)]
struct PendingChallenge {
    device_token: String,
    login_form: HashMap<String, String>,
    workflow_id: String,
    machine_id: String,
    challenge_type: String,
    challenge_id: Option<String>,
    challenge_status: Option<String>,
    inquiries_url: String,
}

struct RobinhoodAuthState {
    client: reqwest::Client,
    pending: HashMap<String, PendingChallenge>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RobinhoodLoginRequest {
    profile_id: i64,
    username: String,
    password: String,
    mfa_code: Option<String>,
    continue_mfa: bool,
}

#[derive(Serialize)]
struct LoginResult {
    status: String,
    mode: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    challenge_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    challenge_issued: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session: Option<SessionPayload>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SessionPayload {
    token_type: String,
    access_token: String,
    refresh_token: String,
    device_token: String,
}

async fn rh_form_post(
    client: &reqwest::Client,
    url: &str,
    form: &HashMap<String, String>,
) -> Result<(u16, Value), String> {
    auth_log_append_line(&format!("POST {url} (form)"));
    let mut headers = rh_headers();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded; charset=utf-8"),
    );
    let res = client
        .post(url)
        .headers(headers)
        .form(form)
        .send()
        .await
        .map_err(|e| format!("Robinhood POST failed: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| format!("Read body failed: {e}"))?;
    auth_log_append_line(&format!("POST {url} -> HTTP {status} len={}", text.len()));
    let data: Value = serde_json::from_str(&text).unwrap_or(json!({ "raw": text }));
    Ok((status, data))
}

async fn rh_json_post(client: &reqwest::Client, url: &str, body: Value) -> Result<(u16, Value), String> {
    auth_log_append_line(&format!("POST {url} (json)"));
    let res = client
        .post(url)
        .headers(rh_headers())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Robinhood JSON POST failed: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| format!("Read body failed: {e}"))?;
    auth_log_append_line(&format!("POST {url} -> HTTP {status} len={}", text.len()));
    let data: Value = serde_json::from_str(&text).unwrap_or(json!({ "raw": text }));
    Ok((status, data))
}

async fn rh_get(client: &reqwest::Client, url: &str) -> Result<(u16, Value), String> {
    auth_log_append_line(&format!("GET {url}"));
    let res = client
        .get(url)
        .headers(rh_headers())
        .send()
        .await
        .map_err(|e| format!("Robinhood GET failed: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| format!("Read body failed: {e}"))?;
    auth_log_append_line(&format!("GET {url} -> HTTP {status} len={}", text.len()));
    let data: Value = serde_json::from_str(&text).unwrap_or(json!({ "raw": text }));
    Ok((status, data))
}

fn extract_sheriff_challenge(data: &Value) -> Option<(String, Option<String>, Option<String>)> {
    let challenge = data.pointer("/context/sheriff_challenge")?;
    let challenge_type = challenge.get("type")?.as_str()?.to_string();
    let challenge_id = challenge.get("id").and_then(|v| v.as_str()).map(str::to_string);
    let challenge_status = challenge
        .get("status")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    Some((challenge_type, challenge_id, challenge_status))
}

fn workflow_approved(data: &Value) -> bool {
    data.pointer("/type_context/result")
        .and_then(|v| v.as_str())
        == Some("workflow_status_approved")
        || data
            .pointer("/verification_workflow/workflow_status")
            .and_then(|v| v.as_str())
            == Some("workflow_status_approved")
}

async fn poll_workflow(client: &reqwest::Client, inquiries_url: &str) {
    for attempt in 0..5 {
        if let Ok((_, data)) = rh_json_post(
            client,
            inquiries_url,
            json!({ "sequence": 0, "user_input": { "status": "continue" } }),
        )
        .await
        {
            if workflow_approved(&data) {
                auth_log_append_line("workflow_status_approved");
                return;
            }
        }
        if attempt < 4 {
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
    auth_log_append_line("workflow poll finished (proceeding)");
}

async fn complete_challenge(
    client: &reqwest::Client,
    mut pending: PendingChallenge,
    mfa_code: Option<&str>,
) -> (LoginResult, PendingChallenge, bool) {
    if let Ok((status, inq)) = rh_get(client, &pending.inquiries_url).await {
        auth_log_append_line(&format!(
            "inquiries refresh HTTP {status} challenge={}",
            inq.pointer("/context/sheriff_challenge/id")
                .and_then(|v| v.as_str())
                .unwrap_or("none")
        ));
        if let Some((ctype, cid, cstatus)) = extract_sheriff_challenge(&inq) {
            pending.challenge_type = ctype;
            pending.challenge_id = cid;
            pending.challenge_status = cstatus;
        }
    }

    if pending.challenge_type == "prompt" {
        let Some(challenge_id) = pending.challenge_id.clone() else {
            return (
                LoginResult {
                    status: "mfa_required".into(),
                    mode: "live".into(),
                    message: "Waiting for Robinhood to issue the app push. Keep the Robinhood app open.".into(),
                    challenge_type: Some("prompt".into()),
                    challenge_issued: Some(false),
                    session: None,
                },
                pending,
                false,
            );
        };
        let push_url = format!("{RH_API}/push/{challenge_id}/get_prompts_status/");
        let (push_status, push) = rh_get(client, &push_url).await.unwrap_or((0, json!({})));
        let push_state = push
            .get("challenge_status")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        auth_log_append_line(&format!("push status HTTP {push_status} state={push_state}"));
        if !matches!(push_state, "validated" | "redeemed" | "approved" | "completed") {
            return (
                LoginResult {
                    status: "mfa_required".into(),
                    mode: "live".into(),
                    message: "Push sent — approve the login in your Robinhood app.".into(),
                    challenge_type: Some("prompt".into()),
                    challenge_issued: Some(false),
                    session: None,
                },
                pending,
                false,
            );
        }
        auth_log_append_line("push challenge validated");
    } else {
        let challenge_id = match pending.challenge_id.clone() {
            Some(id) => id,
            None => {
                return (
                    LoginResult {
                        status: "mfa_required".into(),
                        mode: "live".into(),
                        message: "Robinhood is still preparing your verification challenge.".into(),
                        challenge_type: Some(pending.challenge_type.clone()),
                        challenge_issued: Some(false),
                        session: None,
                    },
                    pending,
                    false,
                );
            }
        };
        if pending.challenge_status.as_deref() != Some("issued") {
            return (
                LoginResult {
                    status: "mfa_required".into(),
                    mode: "live".into(),
                    message: format!(
                        "Waiting for {} verification code...",
                        pending.challenge_type
                    ),
                    challenge_type: Some(pending.challenge_type.clone()),
                    challenge_issued: Some(false),
                    session: None,
                },
                pending,
                false,
            );
        }
        let code = match mfa_code {
            Some(c) if !c.is_empty() => c,
            _ => {
                return (
                    LoginResult {
                        status: "mfa_required".into(),
                        mode: "live".into(),
                        message: format!("Enter the {} verification code.", pending.challenge_type),
                        challenge_type: Some(pending.challenge_type.clone()),
                        challenge_issued: Some(true),
                        session: None,
                    },
                    pending,
                    false,
                );
            }
        };
        let respond_url = format!("{RH_API}/challenge/{challenge_id}/respond/");
        let form = HashMap::from([("response".into(), code.to_string())]);
        let (_, resp) = rh_form_post(client, &respond_url, &form)
            .await
            .unwrap_or((0, json!({})));
        if resp.get("status").and_then(|v| v.as_str()) != Some("validated") {
            return (
                LoginResult {
                    status: "mfa_required".into(),
                    mode: "live".into(),
                    message: "Invalid verification code. Please re-enter.".into(),
                    challenge_type: Some(pending.challenge_type.clone()),
                    challenge_issued: Some(true),
                    session: None,
                },
                pending,
                false,
            );
        }
    }

    poll_workflow(client, &pending.inquiries_url).await;

    let login_url = format!("{RH_API}/oauth2/token/");
    let (_, data) = rh_form_post(client, &login_url, &pending.login_form)
        .await
        .unwrap_or((0, json!({})));

    if let Some(token) = data.get("access_token").and_then(|v| v.as_str()) {
        let session = SessionPayload {
            token_type: data
                .get("token_type")
                .and_then(|v| v.as_str())
                .unwrap_or("Bearer")
                .to_string(),
            access_token: token.to_string(),
            refresh_token: data
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            device_token: pending.device_token.clone(),
        };
        return (
            LoginResult {
                status: "success".into(),
                mode: "live".into(),
                message: "Successfully connected to Robinhood account!".into(),
                challenge_type: None,
                challenge_issued: None,
                session: Some(session),
            },
            pending,
            true,
        );
    }

    (
        LoginResult {
            status: "error".into(),
            mode: "live".into(),
            message: data
                .get("detail")
                .and_then(|v| v.as_str())
                .unwrap_or("Login failed after verification.")
                .to_string(),
            challenge_type: None,
            challenge_issued: None,
            session: None,
        },
        pending,
        false,
    )
}

#[tauri::command]
async fn rh_robinhood_login(
    state: tauri::State<'_, Mutex<RobinhoodAuthState>>,
    payload: RobinhoodLoginRequest,
) -> Result<LoginResult, String> {
    let profile_id = payload.profile_id;
    let username = payload.username;
    let password = payload.password;
    let mfa_code = payload.mfa_code;
    let continue_mfa = payload.continue_mfa;
    let profile_key = profile_id.to_string();
    auth_log_append_line(&format!(
        "rh_robinhood_login profile={profile_id} continue_mfa={continue_mfa}"
    ));

    if continue_mfa {
        let (client, pending) = {
            let guard = state.lock().map_err(|e| e.to_string())?;
            (
                guard.client.clone(),
                guard.pending.get(&profile_key).cloned(),
            )
        };
        let Some(pending) = pending else {
            auth_log_append_line("continue_mfa skipped — pending already cleared (login complete)");
            return Ok(LoginResult {
                status: "success".into(),
                mode: "live".into(),
                message: "Successfully connected to Robinhood account!".into(),
                challenge_type: None,
                challenge_issued: None,
                session: None,
            });
        };
        let (result, updated, clear) =
            complete_challenge(&client, pending, mfa_code.as_deref()).await;
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if clear {
            guard.pending.remove(&profile_key);
        } else {
            guard.pending.insert(profile_key, updated);
        }
        return Ok(result);
    }

    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.client = build_robinhood_client()?;
        guard.pending.remove(&profile_key);
    }

    let client = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.client.clone()
    };

    let device_token = generate_device_token();
    let login_form = build_login_form(&username, &password, &device_token);
    let login_url = format!("{RH_API}/oauth2/token/");

    let (status, data) = rh_form_post(&client, &login_url, &login_form).await?;

    if let Some(token) = data.get("access_token").and_then(|v| v.as_str()) {
        let session = SessionPayload {
            token_type: data
                .get("token_type")
                .and_then(|v| v.as_str())
                .unwrap_or("Bearer")
                .to_string(),
            access_token: token.to_string(),
            refresh_token: data
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            device_token,
        };
        return Ok(LoginResult {
            status: "success".into(),
            mode: "live".into(),
            message: "Connected to Robinhood account!".into(),
            challenge_type: None,
            challenge_issued: None,
            session: Some(session),
        });
    }

    if data.get("verification_workflow").is_some() {
        let workflow_id = data
            .pointer("/verification_workflow/id")
            .and_then(|v| v.as_str())
            .ok_or("Missing verification workflow id")?
            .to_string();

        let pathfinder_url = format!("{RH_API}/pathfinder/user_machine/");
        let (_, machine) = rh_json_post(
            &client,
            &pathfinder_url,
            json!({
                "device_id": device_token,
                "flow": "suv",
                "input": { "workflow_id": workflow_id }
            }),
        )
        .await?;

        let machine_id = machine
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or("Pathfinder did not return machine id")?
            .to_string();

        let inquiries_url = format!("{RH_API}/pathfinder/inquiries/{machine_id}/user_view/");

        let pending = PendingChallenge {
            device_token,
            login_form,
            workflow_id,
            machine_id,
            challenge_type: "prompt".into(),
            challenge_id: None,
            challenge_status: None,
            inquiries_url,
        };
        {
            let mut guard = state.lock().map_err(|e| e.to_string())?;
            guard.pending.insert(profile_key, pending);
        }

        auth_log_append_line("phase1 complete -> mfa_required (prompt)");

        return Ok(LoginResult {
            status: "mfa_required".into(),
            mode: "live".into(),
            message: "Check your Robinhood app for a login approval request.".into(),
            challenge_type: Some("prompt".into()),
            challenge_issued: Some(false),
            session: None,
        });
    }

    let detail = data
        .get("detail")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown login error");

    Ok(LoginResult {
        status: if status == 400 || status == 401 {
            "error".into()
        } else {
            "error".into()
        },
        mode: "live".into(),
        message: format!("Login failed: {detail}"),
        challenge_type: None,
        challenge_issued: None,
        session: None,
    })
}

#[tauri::command]
fn portable_data_path() -> Result<String, String> {
    Ok(portable_data_directory()?.to_string_lossy().to_string())
}

#[tauri::command]
fn portable_write_file(filename: String, contents: Vec<u8>) -> Result<(), String> {
    let safe = sanitize_filename(&filename)?;
    let path = portable_data_directory()?.join(&safe);
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write {safe}: {e}"))?;
    Ok(())
}

#[tauri::command]
fn portable_read_file(filename: String) -> Result<Vec<u8>, String> {
    let safe = sanitize_filename(&filename)?;
    let path = portable_data_directory()?.join(&safe);
    std::fs::read(&path).map_err(|e| format!("Failed to read {safe}: {e}"))
}

#[tauri::command]
fn portable_file_exists(filename: String) -> Result<bool, String> {
    let safe = sanitize_filename(&filename)?;
    let path = portable_data_directory()?.join(&safe);
    Ok(path.is_file())
}

#[tauri::command]
fn rh_desktop_ready() -> Result<bool, String> {
    auth_log_append_line("rh_desktop_ready ping");
    Ok(true)
}

#[derive(Serialize)]
struct RhHttpResult {
    status: u16,
    body: String,
}

#[tauri::command]
async fn rh_http_request(
    state: tauri::State<'_, Mutex<RobinhoodAuthState>>,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    json_body: Option<Value>,
) -> Result<RhHttpResult, String> {
    let client = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.client.clone()
    };

    let method_upper = method.to_uppercase();
    let mut req = match method_upper.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        _ => return Err(format!("Unsupported HTTP method: {method}")),
    };

    let mut header_map = rh_headers();
    for (key, value) in headers {
        if let (Ok(name), Ok(val)) = (
            HeaderName::from_bytes(key.as_bytes()),
            HeaderValue::from_str(&value),
        ) {
            header_map.insert(name, val);
        }
    }
    req = req.headers(header_map);

    if let Some(json) = json_body {
        req = req.json(&json);
    } else if let Some(form_body) = body {
        let mut h = rh_headers();
        h.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/x-www-form-urlencoded; charset=utf-8"),
        );
        req = req.headers(h).body(form_body);
    }

    auth_log_append_line(&format!("{method_upper} {url} (rh_http_request)"));
    let res = req
        .send()
        .await
        .map_err(|e| format!("Robinhood HTTP failed: {e}"))?;
    let status = res.status().as_u16();
    let response_body = res
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;
    auth_log_append_line(&format!("{method_upper} {url} -> HTTP {status}"));
    Ok(RhHttpResult {
        status,
        body: response_body,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = build_robinhood_client().expect("Robinhood HTTP client must initialize");

    tauri::Builder::default()
        .manage(Mutex::new(RobinhoodAuthState {
            client,
            pending: HashMap::new(),
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            auth_log_append,
            portable_data_path,
            portable_write_file,
            portable_read_file,
            portable_file_exists,
            vault_read,
            vault_write,
            rh_desktop_ready,
            rh_robinhood_login,
            rh_http_request,
        ])
        .setup(|app| {
            if let Ok(data_dir) = portable_data_directory() {
                auth_log_append_line(&format!(
                    "app boot exe={} data={}",
                    std::env::current_exe()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default(),
                    data_dir.display()
                ));
                let bootstrap = data_dir.join("storage_ready.json");
                if !bootstrap.exists() {
                    let payload = format!(
                        "{{\"created\":\"{}\",\"path\":\"{}\"}}",
                        chrono_lite_timestamp(),
                        data_dir.display()
                    );
                    let _ = std::fs::write(&bootstrap, payload);
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
