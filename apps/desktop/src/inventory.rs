use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};
use uuid::Uuid;

use terminal_core::models::connection::{AuthMethod, Connection};
use terminal_core::{Result, TerminalError};

#[derive(Clone)]
pub struct InventoryManager {
    file_path: PathBuf,
    connections: Arc<RwLock<Vec<Connection>>>,
}

impl InventoryManager {
    pub fn new_default() -> Self {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let aeroterm_path = PathBuf::from(&home)
            .join(".aeroterm")
            .join("connections.json");
        let legacy_path = PathBuf::from(&home)
            .join(".terminal_pro")
            .join("connections.json");
        let file_path = if aeroterm_path.exists() {
            aeroterm_path
        } else if legacy_path.exists() {
            legacy_path
        } else {
            aeroterm_path
        };
        Self::new(file_path)
    }

    pub fn new(file_path: PathBuf) -> Self {
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let connections = if file_path.exists() {
            match fs::read_to_string(&file_path) {
                Ok(content) => {
                    serde_json::from_str::<Vec<Connection>>(&content).unwrap_or_else(|e| {
                        error!("Failed to parse connections.json: {}, using defaults", e);
                        Self::sample_connections()
                    })
                }
                Err(e) => {
                    error!("Failed to read connections.json: {}, using defaults", e);
                    Self::sample_connections()
                }
            }
        } else {
            let samples = Self::sample_connections();
            if let Ok(json) = serde_json::to_string_pretty(&samples) {
                let _ = fs::write(&file_path, json);
            }
            samples
        };

        Self {
            file_path,
            connections: Arc::new(RwLock::new(connections)),
        }
    }

    fn sample_connections() -> Vec<Connection> {
        let mut local = Connection::new_local_pty("Local (zsh)".to_string());
        local.tags = vec!["Local".to_string(), "Default".to_string()];

        let mut k8s = Connection::new_ssh(
            "prod-k8s-node-01".to_string(),
            "10.244.0.15".to_string(),
            22,
            "root".to_string(),
            AuthMethod::AskEveryTime,
        );
        k8s.tags = vec!["Production".to_string(), "Kubernetes".to_string()];
        k8s.note = Some("Main cluster control plane node".to_string());

        let mut db = Connection::new_ssh(
            "db-postgres-master".to_string(),
            "192.168.1.120".to_string(),
            5432,
            "postgres".to_string(),
            AuthMethod::AskEveryTime,
        );
        db.tags = vec!["Database".to_string(), "HA".to_string()];
        db.note = Some("PostgreSQL Primary Database Instance".to_string());

        vec![local, k8s, db]
    }

    pub async fn list(&self) -> Vec<Connection> {
        let lock = self.connections.read().await;
        lock.clone()
    }

    pub async fn get(&self, id: Uuid) -> Option<Connection> {
        let lock = self.connections.read().await;
        lock.iter().find(|c| c.id == id).cloned()
    }

    pub async fn add(&self, mut conn: Connection) -> Result<Connection> {
        if conn.id.is_nil() {
            conn.id = Uuid::new_v4();
        }
        let now = chrono::Utc::now();
        conn.created_at = now;
        conn.updated_at = now;

        let mut lock = self.connections.write().await;
        lock.push(conn.clone());
        drop(lock);

        self.persist().await?;
        info!("Added connection {} ({})", conn.name, conn.id);
        Ok(conn)
    }

    pub async fn update(&self, mut conn: Connection) -> Result<Connection> {
        conn.updated_at = chrono::Utc::now();
        let mut lock = self.connections.write().await;
        if let Some(existing) = lock.iter_mut().find(|c| c.id == conn.id) {
            *existing = conn.clone();
            drop(lock);
            self.persist().await?;
            info!("Updated connection {} ({})", conn.name, conn.id);
            Ok(conn)
        } else {
            Err(TerminalError::NotFound(format!(
                "Connection {} not found",
                conn.id
            )))
        }
    }

    pub async fn delete(&self, id: Uuid) -> Result<bool> {
        let mut lock = self.connections.write().await;
        let original_len = lock.len();
        lock.retain(|c| c.id != id);
        let removed = lock.len() < original_len;
        drop(lock);

        if removed {
            self.persist().await?;
            info!("Deleted connection {}", id);
        }
        Ok(removed)
    }

    pub async fn import_ssh_config(&self) -> Result<usize> {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let ssh_config_path = PathBuf::from(home).join(".ssh/config");
        if !ssh_config_path.exists() {
            return Ok(0);
        }

        let content = fs::read_to_string(&ssh_config_path)
            .map_err(|e| TerminalError::Config(format!("Failed to read ~/.ssh/config: {}", e)))?;

        let mut imported = 0;
        let mut current_host = String::new();
        let mut current_hostname = String::new();
        let mut current_user = "root".to_string();
        let mut current_port: u16 = 22;

        let commit_entry =
            |host: &str, hostname: &str, user: &str, port: u16| -> Option<Connection> {
                if host.is_empty() || host == "*" || host.contains('?') || host.contains('*') {
                    return None;
                }
                let target_host = if hostname.is_empty() { host } else { hostname };
                let mut conn = Connection::new_ssh(
                    host.to_string(),
                    target_host.to_string(),
                    port,
                    user.to_string(),
                    AuthMethod::AskEveryTime,
                );
                conn.tags = vec!["SSH Config".to_string()];
                Some(conn)
            };

        let mut new_conns = Vec::new();
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            let mut parts = trimmed.split_whitespace();
            let key = parts.next().unwrap_or("").to_lowercase();
            let value = parts.next().unwrap_or("");

            match key.as_str() {
                "host" => {
                    if let Some(conn) = commit_entry(
                        &current_host,
                        &current_hostname,
                        &current_user,
                        current_port,
                    ) {
                        new_conns.push(conn);
                    }
                    current_host = value.to_string();
                    current_hostname = String::new();
                    current_user = "root".to_string();
                    current_port = 22;
                }
                "hostname" => {
                    current_hostname = value.to_string();
                }
                "user" => {
                    current_user = value.to_string();
                }
                "port" => {
                    if let Ok(p) = value.parse::<u16>() {
                        current_port = p;
                    }
                }
                _ => {}
            }
        }
        if let Some(conn) = commit_entry(
            &current_host,
            &current_hostname,
            &current_user,
            current_port,
        ) {
            new_conns.push(conn);
        }

        let mut lock = self.connections.write().await;
        for conn in new_conns {
            if !lock.iter().any(|existing| existing.name == conn.name) {
                lock.push(conn);
                imported += 1;
            }
        }
        drop(lock);

        if imported > 0 {
            self.persist().await?;
            info!("Imported {} hosts from ~/.ssh/config", imported);
        }
        Ok(imported)
    }

    async fn persist(&self) -> Result<()> {
        let lock = self.connections.read().await;
        let json = serde_json::to_string_pretty(&*lock)
            .map_err(|e| TerminalError::Config(format!("JSON serialize error: {}", e)))?;
        fs::write(&self.file_path, json).map_err(|e| {
            TerminalError::Config(format!(
                "Failed to write {}: {}",
                self.file_path.display(),
                e
            ))
        })?;
        Ok(())
    }
}
