use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

    /// Interpolate template variables (e.g. `{{port}}`, `{{container_id}}`) with provided values
    pub fn interpolate(&self, values: &HashMap<&str, &str>) -> String {
        let mut result = self.command_template.clone();
        for param in &self.parameters {
            let pattern = format!("{{{{{}}}}}", param.name);
            let val = values
                .get(param.name.as_str())
                .copied()
                .or(param.default_value.as_deref())
                .unwrap_or("");
            result = result.replace(&pattern, val);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quick_command_interpolation() {
        let mut cmd = QuickCommand::new(
            "Docker logs tail".to_string(),
            "docker logs -f --tail={{lines}} {{container}}".to_string(),
            "Docker".to_string(),
        );
        cmd.parameters.push(CommandParameter {
            name: "lines".to_string(),
            description: Some("Number of lines".to_string()),
            default_value: Some("100".to_string()),
            required: false,
        });
        cmd.parameters.push(CommandParameter {
            name: "container".to_string(),
            description: Some("Container name".to_string()),
            default_value: None,
            required: true,
        });

        let mut values = HashMap::new();
        values.insert("container", "api_gateway");

        // Uses default lines=100 and provided container
        let interpolated = cmd.interpolate(&values);
        assert_eq!(interpolated, "docker logs -f --tail=100 api_gateway");

        // Override lines
        values.insert("lines", "500");
        let custom = cmd.interpolate(&values);
        assert_eq!(custom, "docker logs -f --tail=500 api_gateway");
    }
}
