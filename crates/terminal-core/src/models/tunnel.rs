use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TunnelMode {
    /// Local Port Forwarding (-L): local_port -> remote SSH -> target_host:target_port
    Local,
    /// Remote Port Forwarding (-R): remote SSH:remote_port -> local_host:local_port
    Remote,
    /// Dynamic Port Forwarding (-D): SOCKS5 server on local_port
    DynamicSocks5,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelConfig {
    pub id: Uuid,
    pub name: String,
    pub connection_id: Uuid,
    pub mode: TunnelMode,
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub auto_start: bool,
    pub created_at: DateTime<Utc>,
}

impl TunnelConfig {
    pub fn new_local(
        name: String,
        connection_id: Uuid,
        local_port: u16,
        remote_host: String,
        remote_port: u16,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            connection_id,
            mode: TunnelMode::Local,
            local_host: "127.0.0.1".to_string(),
            local_port,
            remote_host,
            remote_port,
            auto_start: false,
            created_at: Utc::now(),
        }
    }

    pub fn new_socks5(name: String, connection_id: Uuid, local_port: u16) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            connection_id,
            mode: TunnelMode::DynamicSocks5,
            local_host: "127.0.0.1".to_string(),
            local_port,
            remote_host: String::new(),
            remote_port: 0,
            auto_start: false,
            created_at: Utc::now(),
        }
    }
}
