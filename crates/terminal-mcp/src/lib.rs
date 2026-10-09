use axum::{
    extract::{Json, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpSecurityPolicy {
    pub enabled: bool,
    pub auth_token: Option<String>,
    pub require_confirmation_for_write: bool,
    pub allowed_connection_ids: Vec<String>,
}

impl Default for McpSecurityPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            auth_token: None,
            require_confirmation_for_write: true,
            allowed_connection_ids: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub struct McpServerState {
    pub policy: Arc<RwLock<McpSecurityPolicy>>,
    pub tools: Vec<McpToolDefinition>,
}

impl McpServerState {
    pub fn new(policy: McpSecurityPolicy) -> Self {
        let tools = vec![
            McpToolDefinition {
                name: "list_connections".to_string(),
                description: "List all configured servers and connections in TerminalPro"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {}
                }),
            },
            McpToolDefinition {
                name: "terminal_exec".to_string(),
                description:
                    "Execute a shell command on a specific connection and return stdout/stderr"
                        .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "connection_id": { "type": "string" },
                        "command": { "type": "string" }
                    },
                    "required": ["connection_id", "command"]
                }),
            },
            McpToolDefinition {
                name: "file_read".to_string(),
                description: "Read the contents of a remote file via SFTP".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "connection_id": { "type": "string" },
                        "remote_path": { "type": "string" }
                    },
                    "required": ["connection_id", "remote_path"]
                }),
            },
            McpToolDefinition {
                name: "file_write".to_string(),
                description: "Write content to a remote file via SFTP (subject to confirmation)"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "connection_id": { "type": "string" },
                        "remote_path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["connection_id", "remote_path", "content"]
                }),
            },
        ];

        Self {
            policy: Arc::new(RwLock::new(policy)),
            tools,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: Option<String>,
    pub id: Option<Value>,
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub result: Option<Value>,
    pub error: Option<Value>,
}

/// Create the Axum HTTP router for the MCP service
pub fn create_mcp_router(state: McpServerState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/mcp", post(mcp_rpc_handler))
        .route("/mcp/tools", get(list_tools_handler))
        .with_state(state)
}

async fn health_handler() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "TerminalPro MCP",
        "version": "0.1.0"
    }))
}

async fn list_tools_handler(
    headers: HeaderMap,
    State(state): State<McpServerState>,
) -> std::result::Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_auth(&headers, &state).await?;
    Ok(Json(json!({
        "tools": state.tools
    })))
}

async fn mcp_rpc_handler(
    headers: HeaderMap,
    State(state): State<McpServerState>,
    Json(req): Json<JsonRpcRequest>,
) -> std::result::Result<Json<JsonRpcResponse>, (StatusCode, Json<Value>)> {
    verify_auth(&headers, &state).await?;

    let res = match req.method.as_str() {
        "tools/list" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: Some(json!({ "tools": state.tools })),
            error: None,
        },
        "tools/call" => {
            let params = req.params.unwrap_or_else(|| json!({}));
            let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let empty_args = json!({});
            let arguments = params.get("arguments").unwrap_or(&empty_args);

            match tool_name {
                "list_connections" => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: Some(json!({
                        "content": [{
                            "type": "text",
                            "text": "[]" // returns list of allowed connections
                        }]
                    })),
                    error: None,
                },
                "terminal_exec" => {
                    let cmd = arguments
                        .get("command")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req.id,
                        result: Some(json!({
                            "content": [{
                                "type": "text",
                                "text": format!("Executed command (simulated): {}", cmd)
                            }]
                        })),
                        error: None,
                    }
                }
                _ => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: None,
                    error: Some(json!({
                        "code": -32601,
                        "message": format!("Tool not found: {}", tool_name)
                    })),
                },
            }
        }
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(json!({
                "code": -32601,
                "message": format!("Method not found: {}", req.method)
            })),
        },
    };

    Ok(Json(res))
}

async fn verify_auth(
    headers: &HeaderMap,
    state: &McpServerState,
) -> std::result::Result<(), (StatusCode, Json<Value>)> {
    let policy = state.policy.read().await;
    if !policy.enabled {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "MCP service is disabled" })),
        ));
    }

    if let Some(ref required_token) = policy.auth_token {
        let auth_header = headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let expected_bearer = format!("Bearer {}", required_token);
        if auth_header != expected_bearer {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Unauthorized: Invalid or missing token" })),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_mcp_health_check() {
        let state = McpServerState::new(McpSecurityPolicy::default());
        let app = create_mcp_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_mcp_auth_enforcement() {
        let policy = McpSecurityPolicy {
            auth_token: Some("secret-token-123".to_string()),
            ..Default::default()
        };

        let state = McpServerState::new(policy);
        let app = create_mcp_router(state);

        // Request without token fails
        let unauth_res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/mcp/tools")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauth_res.status(), StatusCode::UNAUTHORIZED);

        // Request with valid token succeeds
        let auth_res = app
            .oneshot(
                Request::builder()
                    .uri("/mcp/tools")
                    .header("Authorization", "Bearer secret-token-123")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(auth_res.status(), StatusCode::OK);
    }
}
