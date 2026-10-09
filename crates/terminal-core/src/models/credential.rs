use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialKind {
    Password,
    PrivateKey,
    Certificate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: Uuid,
    pub name: String,
    pub kind: CredentialKind,
    pub username: String,
    /// Reference key into the encrypted vault store
    pub secret_id: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Credential {
    pub fn new(name: String, kind: CredentialKind, username: String, secret_id: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            kind,
            username,
            secret_id,
            description: None,
            created_at: now,
            updated_at: now,
        }
    }
}
