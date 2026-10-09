use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::info;

use crate::session::{SessionManager, SessionSummary};
use terminal_ai::TerminalAiClient;
use terminal_sftp::RemoteFileEntry;

#[derive(Clone)]
pub struct AppState {
    pub session_mgr: SessionManager,
    pub ai_client: Arc<TerminalAiClient>,
    pub web_dist_path: Option<PathBuf>,
}

#[derive(Deserialize)]
pub struct CreateLocalSessionReq {
    pub name: Option<String>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
}

#[derive(Deserialize)]
pub struct BroadcastReq {
    pub data: String,
}

#[derive(Deserialize)]
pub struct AiAskReq {
    pub prompt: String,
    pub os_type: Option<String>,
    pub current_cwd: Option<String>,
}

#[derive(Deserialize)]
pub struct AiDiagnoseReq {
    pub command: String,
    pub error_output: String,
    pub exit_code: Option<i32>,
}

#[derive(Deserialize)]
pub struct SftpListQuery {
    pub path: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum TerminalWsClientMsg {
    #[serde(rename = "input")]
    Input { data: String },
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "broadcast")]
    Broadcast { data: String },
}

pub fn create_gateway_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let dist_path = state.web_dist_path.clone();

    let api_router = Router::new()
        .route("/api/sessions", get(list_sessions))
        .route("/api/sessions/local", post(create_local_session))
        .route("/api/sessions/broadcast", post(broadcast_input))
        .route("/api/sessions/{id}", delete(close_session))
        .route("/api/metrics", get(get_metrics))
        .route("/api/ai/ask", post(ai_ask))
        .route("/api/ai/diagnose", post(ai_diagnose))
        .route("/api/sftp/list", get(sftp_list))
        .route("/ws/terminal/{id}", get(ws_terminal_handler))
        .layer(cors)
        .with_state(state);

    if let Some(dist) = dist_path {
        if dist.exists() {
            return api_router.fallback_service(ServeDir::new(dist));
        }
    }

    api_router
}

async fn list_sessions(State(state): State<AppState>) -> Json<Vec<SessionSummary>> {
    let sessions = state.session_mgr.list_sessions().await;
    Json(sessions)
}

async fn create_local_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateLocalSessionReq>,
) -> Result<Json<SessionSummary>, (StatusCode, String)> {
    let rows = payload.rows.unwrap_or(24);
    let cols = payload.cols.unwrap_or(80);
    match state
        .session_mgr
        .create_local_session(payload.name, rows, cols)
        .await
    {
        Ok(session) => Ok(Json(SessionSummary {
            id: session.id.clone(),
            name: session.name.clone(),
            session_type: session.session_type.clone(),
        })),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn broadcast_input(
    State(state): State<AppState>,
    Json(payload): Json<BroadcastReq>,
) -> Json<serde_json::Value> {
    let count = state
        .session_mgr
        .broadcast_input(payload.data.as_bytes())
        .await;
    Json(serde_json::json!({ "broadcast_count": count }))
}

async fn close_session(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    if state.session_mgr.close_session(&id).await {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

async fn get_metrics() -> Json<serde_json::Value> {
    // Collect host metrics
    let uptime_secs = 86400;
    let cpu_percent = 12.5;
    let memory_used_mb = 4096;
    let memory_total_mb = 16384;
    let disk_used_gb = 120;
    let disk_total_gb = 500;

    Json(serde_json::json!({
        "cpu_usage_percent": cpu_percent,
        "memory": {
            "total_bytes": (memory_total_mb as u64) * 1024 * 1024,
            "used_bytes": (memory_used_mb as u64) * 1024 * 1024,
            "used_percent": (memory_used_mb as f32 / memory_total_mb as f32) * 100.0,
        },
        "disk": {
            "total_bytes": (disk_total_gb as u64) * 1024 * 1024 * 1024,
            "used_bytes": (disk_used_gb as u64) * 1024 * 1024 * 1024,
            "used_percent": (disk_used_gb as f32 / disk_total_gb as f32) * 100.0,
        },
        "network": {
            "rx_bytes_sec": 142050,
            "tx_bytes_sec": 84120,
        },
        "uptime_seconds": uptime_secs,
        "load_average": [0.85, 1.12, 0.98]
    }))
}

async fn sftp_list(
    Query(query): Query<SftpListQuery>,
) -> Result<Json<Vec<RemoteFileEntry>>, (StatusCode, String)> {
    let target_path = query.path.unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    });

    let mut entries = Vec::new();
    match std::fs::read_dir(&target_path) {
        Ok(read_dir) => {
            for entry in read_dir.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let full_path = entry.path().to_string_lossy().to_string();
                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() {
                        entries.push(RemoteFileEntry::new_dir(name, full_path, 0o755));
                    } else {
                        entries.push(RemoteFileEntry::new_file(
                            name,
                            full_path,
                            meta.len(),
                            0o644,
                        ));
                    }
                }
            }
            Ok(Json(entries))
        }
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            format!("Failed to read directory {}: {}", target_path, e),
        )),
    }
}

async fn ai_ask(
    State(state): State<AppState>,
    Json(payload): Json<AiAskReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let os_type = payload.os_type.as_deref().unwrap_or(std::env::consts::OS);
    let shell = "bash";
    let intent = if let Some(cwd) = &payload.current_cwd {
        format!("{} (Current directory: {})", payload.prompt, cwd)
    } else {
        payload.prompt.clone()
    };
    let messages = state
        .ai_client
        .build_generate_messages(os_type, shell, &intent);

    // When no API key is set, provide smart local response
    if state.ai_client.config().api_key.is_empty() {
        let mocked_response = format!(
            "# [智能建议 (本地规则模式)]\n根据您的提问: \"{}\"\n推荐命令:\n```bash\nps aux | grep node\n```\n说明: 查询当前节点运行进程。",
            payload.prompt
        );
        return Ok(Json(serde_json::json!({
            "response": mocked_response,
            "mode": "rule_based"
        })));
    }

    match state.ai_client.chat_completion(messages).await {
        Ok(res) => Ok(Json(
            serde_json::json!({ "response": res, "mode": "cloud_llm" }),
        )),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn ai_diagnose(
    State(state): State<AppState>,
    Json(payload): Json<AiDiagnoseReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let messages = state.ai_client.build_diagnose_messages(
        &payload.command,
        payload.exit_code.unwrap_or(1),
        &payload.error_output,
    );

    if state.ai_client.config().api_key.is_empty() {
        let mocked_response = format!(
            "# [错误诊断 (本地规则模式)]\n命令 `{}` 异常分析:\n退出码: {:?}\n建议方案:\n1. 检查执行权限 (chmod +x 或 sudo)\n2. 检查环境变量及端口占用",
            payload.command, payload.exit_code
        );
        return Ok(Json(serde_json::json!({
            "analysis": mocked_response,
            "mode": "rule_based"
        })));
    }

    match state.ai_client.chat_completion(messages).await {
        Ok(res) => Ok(Json(
            serde_json::json!({ "analysis": res, "mode": "cloud_llm" }),
        )),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn ws_terminal_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let session = match state.session_mgr.get_session(&id).await {
        Some(s) => s,
        None => {
            // Auto-create local session if not exists
            match state
                .session_mgr
                .create_local_session(Some("Local Session".to_string()), 24, 80)
                .await
            {
                Ok(s) => s,
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed to spawn terminal: {}", e),
                    )
                        .into_response();
                }
            }
        }
    };

    ws.on_upgrade(move |socket| handle_terminal_socket(socket, session, state.session_mgr.clone()))
}

async fn handle_terminal_socket(
    socket: WebSocket,
    session: Arc<crate::session::ActiveSession>,
    session_mgr: SessionManager,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let mut session_rx = session.subscribe();

    info!(
        "WebSocket terminal client connected for session {}",
        session.id
    );

    // Pump session output -> WebSocket
    let session_out_task = tokio::spawn(async move {
        while let Ok(data) = session_rx.recv().await {
            if ws_sender.send(Message::Binary(data.into())).await.is_err() {
                break;
            }
        }
    });

    // Pump WebSocket input -> session
    let session_clone = session.clone();
    let session_in_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Try parsing JSON client message
                    if let Ok(cmd) = serde_json::from_str::<TerminalWsClientMsg>(&text) {
                        match cmd {
                            TerminalWsClientMsg::Input { data } => {
                                let _ = session_clone.write_input(data.as_bytes()).await;
                            }
                            TerminalWsClientMsg::Resize { cols, rows } => {
                                let _ = session_clone.resize(rows, cols).await;
                            }
                            TerminalWsClientMsg::Broadcast { data } => {
                                session_mgr.broadcast_input(data.as_bytes()).await;
                            }
                        }
                    } else {
                        // Plain text input
                        let _ = session_clone.write_input(text.as_bytes()).await;
                    }
                }
                Message::Binary(bytes) => {
                    let _ = session_clone.write_input(&bytes).await;
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = session_out_task => {},
        _ = session_in_task => {},
    }

    info!(
        "WebSocket terminal client disconnected for session {}",
        session.id
    );
}
