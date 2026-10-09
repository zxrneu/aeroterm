use thiserror::Error;

#[derive(Error, Debug)]
pub enum TerminalError {
    #[error("Vault error: {0}")]
    Vault(String),

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Connection error: {0}")]
    Connection(String),

    #[error("SSH protocol error: {0}")]
    Ssh(String),

    #[error("SFTP error: {0}")]
    Sftp(String),

    #[error("PTY error: {0}")]
    Pty(String),

    #[error("Tunnel error: {0}")]
    Tunnel(String),

    #[error("Monitor error: {0}")]
    Monitor(String),

    #[error("MCP service error: {0}")]
    Mcp(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid configuration: {0}")]
    Config(String),
}

pub type Result<T> = std::result::Result<T, TerminalError>;
