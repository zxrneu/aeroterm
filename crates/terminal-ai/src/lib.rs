use serde::{Deserialize, Serialize};
use serde_json::json;
use terminal_core::{Result, TerminalError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiClientConfig {
    pub endpoint_url: String,
    pub api_key: String,
    pub model_name: String,
}

impl Default for AiClientConfig {
    fn default() -> Self {
        Self {
            endpoint_url: "https://api.deepseek.com/v1".to_string(),
            api_key: String::new(),
            model_name: "deepseek-coder".to_string(),
        }
    }
}

pub struct TerminalAiClient {
    config: AiClientConfig,
    client: reqwest::Client,
}

impl TerminalAiClient {
    pub fn new(config: AiClientConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    /// Build prompt to generate executable shell command from natural language
    pub fn build_generate_messages(
        &self,
        os: &str,
        shell: &str,
        user_intent: &str,
    ) -> Vec<ChatMessage> {
        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "You are 'XiaoYi' (小易), an expert AI terminal assistant for TerminalPro. The user is running on {} with {} shell. Generate the exact, optimal shell command matching their request. Output only the command, or a concise explanation followed by the command in a markdown code block.",
                    os, shell
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_intent.to_string(),
            },
        ]
    }

    /// Build prompt to diagnose command execution error
    pub fn build_diagnose_messages(
        &self,
        command: &str,
        exit_code: i32,
        stderr: &str,
    ) -> Vec<ChatMessage> {
        vec![
            ChatMessage {
                role: "system".to_string(),
                content: "You are 'XiaoYi' (小易), an expert Linux/Unix sysadmin diagnostic assistant. Analyze the failed command, exit code, and stderr output. Explain the root cause in 1-2 concise sentences and provide the exact corrective command.".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "Failed Command: `{}`\nExit Code: {}\nStderr Output:\n```\n{}\n```",
                    command, exit_code, stderr
                ),
            },
        ]
    }

    /// Build prompt to explain a complex shell command
    pub fn build_explain_messages(&self, command: &str) -> Vec<ChatMessage> {
        vec![
            ChatMessage {
                role: "system".to_string(),
                content: "You are 'XiaoYi' (小易), an expert terminal assistant. Explain what this command does, break down each flag and argument clearly, and warn if it has potentially destructive side effects.".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!("Please explain this command: `{}`", command),
            },
        ]
    }

    /// Send chat completion request to the OpenAI-compatible endpoint
    pub async fn chat_completion(&self, messages: Vec<ChatMessage>) -> Result<String> {
        if self.config.api_key.is_empty() {
            return Err(TerminalError::Config(
                "AI Assistant API Key is not configured in settings".to_string(),
            ));
        }

        let url = format!(
            "{}/chat/completions",
            self.config.endpoint_url.trim_end_matches('/')
        );

        let body = json!({
            "model": self.config.model_name,
            "messages": messages,
            "temperature": 0.2,
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| TerminalError::Network(format!("AI API request failed: {}", e)))?;

        let json_resp: serde_json::Value = response
            .json()
            .await
            .map_err(|e| TerminalError::Ai(format!("Failed to parse AI response: {}", e)))?;

        if let Some(err) = json_resp.get("error") {
            return Err(TerminalError::Network(format!("AI API error: {}", err)));
        }

        let answer = json_resp["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(answer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_generate_prompt() {
        let client = TerminalAiClient::new(AiClientConfig::default());
        let messages =
            client.build_generate_messages("Ubuntu 24.04", "bash", "查找并删除所有空目录");

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "system");
        assert!(messages[0].content.contains("Ubuntu 24.04"));
        assert_eq!(messages[1].content, "查找并删除所有空目录");
    }

    #[test]
    fn test_build_diagnose_prompt() {
        let client = TerminalAiClient::new(AiClientConfig::default());
        let messages = client.build_diagnose_messages(
            "systemctl restart nginx",
            1,
            "Job for nginx.service failed because the control process exited with error code.",
        );

        assert_eq!(messages.len(), 2);
        assert!(messages[1].content.contains("Exit Code: 1"));
        assert!(messages[1].content.contains("Job for nginx.service failed"));
    }
}
