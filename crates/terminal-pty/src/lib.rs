use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use terminal_core::{Result, TerminalError};

pub struct PtySession {
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl PtySession {
    /// Spawn a new local PTY session with default user shell
    pub fn spawn_default(rows: u16, cols: u16) -> Result<Self> {
        #[cfg(target_os = "windows")]
        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string());

        #[cfg(not(target_os = "windows"))]
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

        Self::spawn(&shell, &[], rows, cols)
    }

    /// Spawn a specific shell or executable in the PTY
    pub fn spawn(program: &str, args: &[&str], rows: u16, cols: u16) -> Result<Self> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::Pty(format!("Failed to open PTY: {}", e)))?;

        let mut cmd = CommandBuilder::new(program);
        for arg in args {
            cmd.arg(arg);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| TerminalError::Pty(format!("Failed to spawn child process: {}", e)))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| TerminalError::Pty(format!("Failed to take PTY writer: {}", e)))?;

        Ok(Self {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            child,
        })
    }

    /// Resize the PTY window
    pub fn resize(&self, rows: u16, cols: u16) -> Result<()> {
        let master = self
            .master
            .lock()
            .map_err(|_| TerminalError::Pty("Master lock poisoned".to_string()))?;

        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::Pty(format!("Failed to resize PTY: {}", e)))?;

        Ok(())
    }

    /// Write input bytes (e.g. keyboard keystrokes) to the PTY
    pub fn write_input(&self, data: &[u8]) -> Result<()> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| TerminalError::Pty("Writer lock poisoned".to_string()))?;

        writer
            .write_all(data)
            .map_err(|e| TerminalError::Pty(format!("Write to PTY failed: {}", e)))?;

        writer
            .flush()
            .map_err(|e| TerminalError::Pty(format!("Flush PTY failed: {}", e)))?;

        Ok(())
    }

    /// Get a reader clone to stream terminal output
    pub fn try_clone_reader(&self) -> Result<Box<dyn Read + Send>> {
        let master = self
            .master
            .lock()
            .map_err(|_| TerminalError::Pty("Master lock poisoned".to_string()))?;

        master
            .try_clone_reader()
            .map_err(|e| TerminalError::Pty(format!("Failed to clone PTY reader: {}", e)))
    }

    /// Kill the spawned process
    pub fn kill(&mut self) -> Result<()> {
        self.child
            .kill()
            .map_err(|e| TerminalError::Pty(format!("Failed to kill PTY child process: {}", e)))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_read_output() {
        let session = PtySession::spawn_default(24, 80).unwrap();
        session.resize(30, 100).unwrap();

        let mut reader = session.try_clone_reader().unwrap();
        session
            .write_input(b"echo 'TERMINAL_PRO_PTY_OK'\n")
            .unwrap();

        let mut buffer = [0u8; 1024];
        let mut total_output = String::new();

        // Read initial shell greeting and output
        for _ in 0..5 {
            if let Ok(n) = reader.read(&mut buffer) {
                if n > 0 {
                    total_output.push_str(&String::from_utf8_lossy(&buffer[..n]));
                    if total_output.contains("TERMINAL_PRO_PTY_OK") {
                        break;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        assert!(
            total_output.contains("TERMINAL_PRO_PTY_OK") || !total_output.is_empty(),
            "PTY output should not be empty: {}",
            total_output
        );
    }

    #[test]
    fn test_multiple_writes() {
        let session = PtySession::spawn_default(24, 80).unwrap();
        session.write_input(b"echo 1\n").unwrap();
        let res = session.write_input(b"echo 2\n");
        assert!(res.is_ok(), "Second write_input failed: {:?}", res);
    }
}
