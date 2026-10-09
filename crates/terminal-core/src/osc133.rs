/// Shell Integration (OSC 133 & OSC 7) Protocol Parser
///
/// Implements standard shell escape sequences:
/// - OSC 133 ; A ST  : Prompt start
/// - OSC 133 ; B ST  : Command input start
/// - OSC 133 ; C ST  : Command execution started (output begins)
/// - OSC 133 ; D [; exit_code] ST : Command execution finished with exit code
/// - OSC 7 ; file://host/path ST  : Working directory changed (CWD)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellIntegrationEvent {
    PromptStart,
    CommandInputStart,
    CommandExecuteStart,
    CommandFinished { exit_code: Option<i32> },
    CwdChanged(String),
}

#[derive(Debug, Default)]
pub struct Osc133Parser {
    in_escape: bool,
    in_osc: bool,
    osc_buffer: Vec<u8>,
}

impl Osc133Parser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a chunk of incoming terminal output bytes and extract Shell Integration events
    pub fn process_bytes(&mut self, data: &[u8]) -> Vec<ShellIntegrationEvent> {
        let mut events = Vec::new();
        let mut i = 0;

        while i < data.len() {
            let b = data[i];

            if !self.in_osc {
                if b == 0x1B {
                    // ESC
                    self.in_escape = true;
                } else if self.in_escape && b == b']' {
                    // ESC ] -> OSC start
                    self.in_osc = true;
                    self.in_escape = false;
                    self.osc_buffer.clear();
                } else {
                    self.in_escape = false;
                }
            } else {
                // Inside OSC sequence, look for terminator BEL (0x07) or ST (ESC \)
                if b == 0x07 {
                    // BEL terminates OSC
                    if let Some(event) = self.parse_osc_buffer() {
                        events.push(event);
                    }
                    self.in_osc = false;
                    self.osc_buffer.clear();
                } else if b == 0x1B {
                    // Potential ST (ESC \)
                    if i + 1 < data.len() && data[i + 1] == b'\\' {
                        if let Some(event) = self.parse_osc_buffer() {
                            events.push(event);
                        }
                        self.in_osc = false;
                        self.osc_buffer.clear();
                        i += 1; // skip '\'
                    }
                } else {
                    self.osc_buffer.push(b);
                }
            }
            i += 1;
        }

        events
    }

    fn parse_osc_buffer(&self) -> Option<ShellIntegrationEvent> {
        let content = std::str::from_utf8(&self.osc_buffer).ok()?;

        // OSC 133
        if let Some(rest) = content.strip_prefix("133;") {
            let parts: Vec<&str> = rest.split(';').collect();
            match parts.first().copied() {
                Some("A") => Some(ShellIntegrationEvent::PromptStart),
                Some("B") => Some(ShellIntegrationEvent::CommandInputStart),
                Some("C") => Some(ShellIntegrationEvent::CommandExecuteStart),
                Some("D") => {
                    let exit_code = parts
                        .get(1)
                        .and_then(|code_str| code_str.parse::<i32>().ok());
                    Some(ShellIntegrationEvent::CommandFinished { exit_code })
                }
                _ => None,
            }
        } else if let Some(url) = content.strip_prefix("7;") {
            // OSC 7;file://hostname/path
            if let Some(path_idx) = url.find("://") {
                let after_proto = &url[path_idx + 3..];
                if let Some(slash_idx) = after_proto.find('/') {
                    let path = &after_proto[slash_idx..];
                    return Some(ShellIntegrationEvent::CwdChanged(path.to_string()));
                }
            }
            Some(ShellIntegrationEvent::CwdChanged(url.to_string()))
        } else {
            None
        }
    }
}

/// Command Block representation pairing a command with its execution output and status
#[derive(Debug, Clone)]
pub struct CommandBlock {
    pub command: String,
    pub output: Vec<u8>,
    pub exit_code: Option<i32>,
    pub start_timestamp: u64,
    pub duration_millis: Option<u64>,
    pub is_finished: bool,
}

impl CommandBlock {
    pub fn new(command: String) -> Self {
        Self {
            command,
            output: Vec::new(),
            exit_code: None,
            start_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            duration_millis: None,
            is_finished: false,
        }
    }

    pub fn append_output(&mut self, bytes: &[u8]) {
        self.output.extend_from_slice(bytes);
    }

    pub fn finish(&mut self, exit_code: Option<i32>, duration_millis: u64) {
        self.exit_code = exit_code;
        self.duration_millis = Some(duration_millis);
        self.is_finished = true;
    }

    pub fn is_success(&self) -> bool {
        self.exit_code == Some(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_osc133_prompt_and_command_events() {
        let mut parser = Osc133Parser::new();

        // Simulate OSC 133;A\x07 (Prompt start)
        let prompt_bytes = b"\x1b]133;A\x07user@mac:~$ ";
        let events = parser.process_bytes(prompt_bytes);
        assert_eq!(events, vec![ShellIntegrationEvent::PromptStart]);

        // Simulate OSC 133;B\x1b\\ (Command input start)
        let input_bytes = b"\x1b]133;B\x1b\\ls -la\n";
        let events = parser.process_bytes(input_bytes);
        assert_eq!(events, vec![ShellIntegrationEvent::CommandInputStart]);

        // Simulate OSC 133;C\x07 (Command execution start)
        let exec_bytes = b"\x1b]133;C\x07total 16\ndrwxr-xr-x 2 user\n";
        let events = parser.process_bytes(exec_bytes);
        assert_eq!(events, vec![ShellIntegrationEvent::CommandExecuteStart]);

        // Simulate OSC 133;D;0\x07 (Command finished with exit code 0)
        let finish_bytes = b"\x1b]133;D;0\x07";
        let events = parser.process_bytes(finish_bytes);
        assert_eq!(
            events,
            vec![ShellIntegrationEvent::CommandFinished { exit_code: Some(0) }]
        );

        // Simulate error exit code 127
        let err_finish = b"\x1b]133;D;127\x07";
        let events = parser.process_bytes(err_finish);
        assert_eq!(
            events,
            vec![ShellIntegrationEvent::CommandFinished {
                exit_code: Some(127)
            }]
        );
    }

    #[test]
    fn test_osc7_cwd_change() {
        let mut parser = Osc133Parser::new();
        let cwd_bytes = b"\x1b]7;file://zxr-MacBook-Pro.local/Users/zxr/coding/terminal_pro\x07";
        let events = parser.process_bytes(cwd_bytes);
        assert_eq!(
            events,
            vec![ShellIntegrationEvent::CwdChanged(
                "/Users/zxr/coding/terminal_pro".to_string()
            )]
        );
    }
}
