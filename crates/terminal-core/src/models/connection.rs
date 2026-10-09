use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ssh,
    LocalPty,
    Rdp,
    Vnc,
    Telnet,
    Serial,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthMethod {
    Password {
        /// Encrypted vault secret ID or empty if ask every time
        secret_id: Option<String>,
    },
    PrivateKey {
        /// Encrypted private key secret ID in vault
        private_key_secret_id: String,
        /// Optional passphrase secret ID in vault
        passphrase_secret_id: Option<String>,
    },
    CredentialRef {
        credential_id: Uuid,
    },
    KeyboardInteractive,
    AskEveryTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProxyJumpConfig {
    pub target_host: String,
    pub target_port: u16,
    pub jump_connection_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: Uuid,
    pub name: String,
    pub group_id: Option<Uuid>,
    pub tags: Vec<String>,
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    pub proxy_jump: Option<ProxyJumpConfig>,
    pub keepalive_interval_secs: u32,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Connection {
    pub fn new_ssh(
        name: String,
        host: String,
        port: u16,
        username: String,
        auth: AuthMethod,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            group_id: None,
            tags: Vec::new(),
            protocol: Protocol::Ssh,
            host,
            port,
            username,
            auth,
            proxy_jump: None,
            keepalive_interval_secs: 30,
            note: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn new_local_pty(name: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            group_id: None,
            tags: Vec::new(),
            protocol: Protocol::LocalPty,
            host: "localhost".to_string(),
            port: 0,
            username: String::new(),
            auth: AuthMethod::AskEveryTime,
            proxy_jump: None,
            keepalive_interval_secs: 0,
            note: None,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionGroup {
    pub id: Uuid,
    pub name: String,
    pub parent_id: Option<Uuid>,
    pub order_index: i32,
    pub created_at: DateTime<Utc>,
}
