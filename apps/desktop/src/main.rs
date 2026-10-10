mod gateway;
mod inventory;
mod session;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use terminal_ai::{AiClientConfig, TerminalAiClient};
use terminal_mcp::{create_mcp_router, McpSecurityPolicy, McpServerState};
use terminal_vault::CredentialVault;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use crate::gateway::{create_gateway_router, AppState};
use crate::inventory::InventoryManager;
use crate::session::SessionManager;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    println!(
        r#"
  ======================================================
     AeroTerm (Ultra-Lightweight Workstation)
     Pure Rust Async Engine | Multi-Tab | MCP | AI
  ======================================================
"#
    );

    // 2. Initialize Vault
    let mut vault = CredentialVault::new();
    vault.initialize("AeroTerm_Default_Vault_Key_2026")?;
    info!("Credential Vault initialized with Argon2id + AES-256-GCM");

    // 3. Initialize Session Manager, Inventory & AI Copilot Client
    let session_mgr = SessionManager::new();
    let inventory_mgr = InventoryManager::new_default();
    if let Ok(count) = inventory_mgr.import_ssh_config().await {
        if count > 0 {
            info!(
                "Auto-discovered and imported {} hosts from ~/.ssh/config",
                count
            );
        }
    }
    let ai_config = AiClientConfig::default();
    let ai_client = Arc::new(TerminalAiClient::new(ai_config));

    // Try locating web-ui dist directory
    let mut web_dist_path = PathBuf::from("apps/web-ui/dist");
    if !web_dist_path.exists() {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let p = PathBuf::from(manifest_dir).join("../web-ui/dist");
            if p.exists() {
                web_dist_path = p;
            }
        }
    }

    let app_state = AppState {
        session_mgr,
        ai_client,
        inventory_mgr,
        web_dist_path: if web_dist_path.exists() {
            Some(web_dist_path)
        } else {
            None
        },
    };

    // 4. Initialize MCP Service & Merge with Gateway Router
    let policy = McpSecurityPolicy {
        enabled: true,
        auth_token: None, // No token required by default on localhost loopback
        require_confirmation_for_write: true,
        allowed_connection_ids: Vec::new(),
    };
    let mcp_state = McpServerState::new(policy);
    let mcp_router = create_mcp_router(mcp_state);
    let gateway_router = create_gateway_router(app_state);

    // Merge routers
    let app = gateway_router.merge(mcp_router);

    let addr = SocketAddr::from(([127, 0, 0, 1], 12335));
    info!(
        "AeroTerm unified gateway server listening on http://{}",
        addr
    );
    info!("  - Web UI: http://{}/", addr);
    info!(
        "  - WebSocket Terminal: ws://{}/ws/terminal/{{session_id}}",
        addr
    );
    info!("  - MCP Endpoints: http://{}/mcp/v1/tools", addr);
    info!("  - Server Metrics: http://{}/api/metrics", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            tracing::warn!("AeroTerm is already running on port 12335. Opening browser tab...");
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open")
                .arg("http://127.0.0.1:12335/")
                .spawn();
            return Ok(());
        }
        Err(e) => return Err(e.into()),
    };

    // Auto-open default browser on macOS unless AEROTERM_NO_OPEN is set
    if std::env::var("AEROTERM_NO_OPEN").is_err() && std::env::var("TERMINAL_PRO_NO_OPEN").is_err()
    {
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("open")
                    .arg("http://127.0.0.1:12335/")
                    .spawn();
            }
        });
    }

    tokio::select! {
        res = axum::serve(listener, app) => {
            if let Err(e) = res {
                tracing::error!("Gateway server error: {}", e);
            }
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Received shutdown signal, terminating AeroTerm cleanly.");
        }
    }

    Ok(())
}
