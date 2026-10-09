use std::net::SocketAddr;
use terminal_mcp::{create_mcp_router, McpSecurityPolicy, McpServerState};
use terminal_pty::PtySession;
use terminal_vault::CredentialVault;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    println!(
        r#"
  ======================================================
     TerminalPro (XTerminal Benchmark Workstation)
     Pure Rust Async Engine | Tauri 2.0 Host
  ======================================================
"#
    );

    // 2. Initialize Vault
    let mut vault = CredentialVault::new();
    vault.initialize("TerminalPro_Default_Vault_Key_2026")?;
    info!("Credential Vault initialized with Argon2id + AES-256-GCM");

    // 3. Test Local PTY
    let pty = PtySession::spawn_default(24, 80)?;
    info!("Local PTY engine spawned successfully");
    drop(pty);

    // 4. Start embedded MCP Service on 127.0.0.1:12335
    let policy = McpSecurityPolicy {
        enabled: true,
        auth_token: None, // No token required by default on localhost loopback
        require_confirmation_for_write: true,
        allowed_connection_ids: Vec::new(),
    };
    let state = McpServerState::new(policy);
    let app = create_mcp_router(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 12335));
    info!(
        "Starting local Model Context Protocol (MCP) server on http://{}",
        addr
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("TerminalPro backend runtime is ready and listening");

    // In desktop mode, this runs in the background while GUI window is active.
    // For standalone daemon mode, serve until shutdown.
    tokio::select! {
        res = axum::serve(listener, app) => {
            if let Err(e) = res {
                tracing::error!("MCP server error: {}", e);
            }
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Received shutdown signal, terminating TerminalPro cleanly.");
        }
    }

    Ok(())
}
