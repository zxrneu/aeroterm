use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: Uuid,
    pub title: String,
    pub markdown_content: String,
    pub connection_id: Option<Uuid>,
    pub group_id: Option<Uuid>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Note {
    pub fn new(title: String, markdown_content: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            title,
            markdown_content,
            connection_id: None,
            group_id: None,
            tags: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }
}
