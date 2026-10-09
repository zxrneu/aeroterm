use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandParameter {
    pub name: String,
    pub description: Option<String>,
    pub default_value: Option<String>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickCommand {
    pub id: Uuid,
    pub title: String,
    pub command_template: String,
    pub category: String,
    pub tags: Vec<String>,
    pub parameters: Vec<CommandParameter>,
    pub created_at: DateTime<Utc>,
}

impl QuickCommand {
    pub fn new(title: String, command_template: String, category: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            title,
            command_template,
            category,
            tags: Vec::new(),
            parameters: Vec::new(),
            created_at: Utc::now(),
        }
    }
}
