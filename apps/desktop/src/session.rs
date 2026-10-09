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
}

impl ActiveSession {
    pub fn new_local(id: String, name: String, rows: u16, cols: u16) -> Result<Self> {
        let pty = PtySession::spawn_default(rows, cols)?;
        let mut reader = pty.try_clone_reader()?;
        let pty_arc = Arc::new(tokio::sync::Mutex::new(pty));

        let (output_tx, _) = broadcast::channel::<Vec<u8>>(1024);
        let tx_clone = output_tx.clone();
        let session_id_clone = id.clone();

        // Background reader thread to pump PTY bytes into broadcast channel
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
                            if tx_clone.send(buf[..n].to_vec()).is_err() {
                                // No active subscribers, keep reading or ignore
                            }
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
            SessionHandle::RemoteSsh { .. } => {
                // Russh window change if needed
                Ok(())
            }
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.output_tx.subscribe()
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
