use std::collections::HashMap;
use std::io::Read;
use std::sync::Arc;
use terminal_core::{Result, TerminalError};
use terminal_pty::PtySession;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info};

#[allow(dead_code)]
pub enum SessionHandle {
    LocalPty {
        pty: Arc<tokio::sync::Mutex<PtySession>>,
    },
    RemoteSsh {
        sender: tokio::sync::mpsc::Sender<Vec<u8>>,
    },
}

pub struct ActiveSession {
    pub id: String,
    pub name: String,
    pub session_type: String,
    pub handle: SessionHandle,
    pub output_tx: broadcast::Sender<Vec<u8>>,
    pub history: Arc<std::sync::Mutex<Vec<u8>>>,
}

impl ActiveSession {
    pub fn new_local(id: String, name: String, rows: u16, cols: u16) -> Result<Self> {
        let pty = PtySession::spawn_default(rows, cols)?;
        let mut reader = pty.try_clone_reader()?;
        let pty_arc = Arc::new(tokio::sync::Mutex::new(pty));

        let history = Arc::new(std::sync::Mutex::new(Vec::new()));
        let history_clone = history.clone();

        let (output_tx, _) = broadcast::channel::<Vec<u8>>(1024);
        let tx_clone = output_tx.clone();
        let session_id_clone = id.clone();

        // Background reader thread to pump PTY bytes into broadcast channel and history
        std::thread::Builder::new()
            .name(format!("pty-reader-{}", id))
            .spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => {
                            info!("PTY session {} reached EOF", session_id_clone);
                            break;
                        }
                        Ok(n) => {
                            let chunk = buf[..n].to_vec();
                            if let Ok(mut hist) = history_clone.lock() {
                                hist.extend_from_slice(&chunk);
                                if hist.len() > 65536 {
                                    let trim = hist.len() - 65536;
                                    hist.drain(0..trim);
                                }
                            }
                            let _ = tx_clone.send(chunk);
                        }
                        Err(e) => {
                            error!("PTY session {} read error: {}", session_id_clone, e);
                            break;
                        }
                    }
                }
            })
            .map_err(|e| TerminalError::Pty(format!("Failed to spawn reader thread: {}", e)))?;

        Ok(Self {
            id,
            name,
            session_type: "local".to_string(),
            handle: SessionHandle::LocalPty { pty: pty_arc },
            output_tx,
            history,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new_ssh(
        id: String,
        name: String,
        host: String,
        port: u16,
        username: String,
        rows: u16,
        cols: u16,
    ) -> Result<Self> {
        let port_str = port.to_string();
        let target = if username.is_empty() {
            host.clone()
        } else {
            format!("{}@{}", username, host)
        };

        // Spawn system OpenSSH client inside a PTY for interactive auth & full terminal support
        let pty = PtySession::spawn("/usr/bin/ssh", &["-p", &port_str, &target], rows, cols)?;
        let mut reader = pty.try_clone_reader()?;
        let pty_arc = Arc::new(tokio::sync::Mutex::new(pty));

        let history = Arc::new(std::sync::Mutex::new(Vec::new()));
        let history_clone = history.clone();

        let (output_tx, _) = broadcast::channel::<Vec<u8>>(1024);
        let tx_clone = output_tx.clone();
        let session_id_clone = id.clone();

        std::thread::Builder::new()
            .name(format!("ssh-reader-{}", id))
            .spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => {
                            info!("SSH session {} reached EOF", session_id_clone);
                            break;
                        }
                        Ok(n) => {
                            let chunk = buf[..n].to_vec();
                            if let Ok(mut hist) = history_clone.lock() {
                                hist.extend_from_slice(&chunk);
                                if hist.len() > 65536 {
                                    let trim = hist.len() - 65536;
                                    hist.drain(0..trim);
                                }
                            }
                            let _ = tx_clone.send(chunk);
                        }
                        Err(e) => {
                            error!("SSH session {} read error: {}", session_id_clone, e);
                            break;
                        }
                    }
                }
            })
            .map_err(|e| TerminalError::Pty(format!("Failed to spawn SSH reader: {}", e)))?;

        Ok(Self {
            id,
            name,
            session_type: "ssh".to_string(),
            handle: SessionHandle::LocalPty { pty: pty_arc },
            output_tx,
            history,
        })
    }

    pub async fn write_input(&self, data: &[u8]) -> Result<()> {
        match &self.handle {
            SessionHandle::LocalPty { pty } => {
                let pty_guard = pty.lock().await;
                pty_guard.write_input(data)
            }
            SessionHandle::RemoteSsh { sender } => sender
                .send(data.to_vec())
                .await
                .map_err(|e| TerminalError::Ssh(format!("Failed to send SSH input: {}", e))),
        }
    }

    pub async fn resize(&self, rows: u16, cols: u16) -> Result<()> {
        match &self.handle {
            SessionHandle::LocalPty { pty } => {
                let pty_guard = pty.lock().await;
                pty_guard.resize(rows, cols)
            }
            SessionHandle::RemoteSsh { .. } => Ok(()),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.output_tx.subscribe()
    }

    pub fn get_history(&self) -> Vec<u8> {
        if let Ok(hist) = self.history.lock() {
            hist.clone()
        } else {
            Vec::new()
        }
    }
}

#[derive(Clone, Default)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Arc<ActiveSession>>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_or_create_session(
        &self,
        id: &str,
        name: Option<String>,
        rows: u16,
        cols: u16,
    ) -> Result<Arc<ActiveSession>> {
        {
            let lock = self.sessions.read().await;
            if let Some(s) = lock.get(id) {
                return Ok(s.clone());
            }
        }

        let session_name = name.unwrap_or_else(|| {
            if id == "local" {
                "Local Terminal".to_string()
            } else {
                format!("Session {}", id)
            }
        });

        let session = Arc::new(ActiveSession::new_local(
            id.to_string(),
            session_name,
            rows,
            cols,
        )?);

        let mut lock = self.sessions.write().await;
        lock.insert(id.to_string(), session.clone());
        Ok(session)
    }

    pub async fn create_local_session(
        &self,
        name: Option<String>,
        rows: u16,
        cols: u16,
    ) -> Result<Arc<ActiveSession>> {
        let id = format!("sess_{}", uuid_simple());
        let session_name = name.unwrap_or_else(|| "Local Terminal".to_string());
        let session = Arc::new(ActiveSession::new_local(
            id.clone(),
            session_name,
            rows,
            cols,
        )?);

        let mut lock = self.sessions.write().await;
        lock.insert(id, session.clone());
        Ok(session)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_ssh_session(
        &self,
        id: String,
        name: String,
        host: String,
        port: u16,
        username: String,
        rows: u16,
        cols: u16,
    ) -> Result<Arc<ActiveSession>> {
        {
            let lock = self.sessions.read().await;
            if let Some(s) = lock.get(&id) {
                return Ok(s.clone());
            }
        }

        let session = Arc::new(ActiveSession::new_ssh(
            id.clone(),
            name,
            host,
            port,
            username,
            rows,
            cols,
        )?);

        let mut lock = self.sessions.write().await;
        lock.insert(id, session.clone());
        Ok(session)
    }

    pub async fn get_session(&self, id: &str) -> Option<Arc<ActiveSession>> {
        let lock = self.sessions.read().await;
        lock.get(id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<SessionSummary> {
        let lock = self.sessions.read().await;
        lock.values()
            .map(|s| SessionSummary {
                id: s.id.clone(),
                name: s.name.clone(),
                session_type: s.session_type.clone(),
            })
            .collect()
    }

    pub async fn close_session(&self, id: &str) -> bool {
        let mut lock = self.sessions.write().await;
        lock.remove(id).is_some()
    }

    pub async fn broadcast_input(&self, data: &[u8]) -> usize {
        let lock = self.sessions.read().await;
        let mut count = 0;
        for session in lock.values() {
            if session.write_input(data).await.is_ok() {
                count += 1;
            }
        }
        count
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SessionSummary {
    pub id: String,
    pub name: String,
    pub session_type: String,
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", nanos)
}
