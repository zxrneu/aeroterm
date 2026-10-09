pub mod socks5;

pub use socks5::Socks5Negotiation;

use std::collections::HashMap;
use std::sync::Arc;
use terminal_core::{Result, TerminalError, TunnelConfig};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelStatus {
    Running,
    Stopped,
    Error,
}

pub struct ActiveTunnel {
    pub config: TunnelConfig,
    pub status: TunnelStatus,
    handle: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct TunnelManager {
    tunnels: Arc<Mutex<HashMap<Uuid, ActiveTunnel>>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a tunnel configuration
    pub async fn add_tunnel(&self, config: TunnelConfig) {
        let id = config.id;
        let mut map = self.tunnels.lock().await;
        map.insert(
            id,
            ActiveTunnel {
                config,
                status: TunnelStatus::Stopped,
                handle: None,
            },
        );
    }

    /// Check if a tunnel is registered and its status
    pub async fn get_status(&self, id: &Uuid) -> Option<TunnelStatus> {
        let map = self.tunnels.lock().await;
        map.get(id).map(|t| t.status)
    }

    /// Stop a running tunnel
    pub async fn stop_tunnel(&self, id: &Uuid) -> Result<()> {
        let mut map = self.tunnels.lock().await;
        if let Some(tunnel) = map.get_mut(id) {
            if let Some(handle) = tunnel.handle.take() {
                handle.abort();
            }
            tunnel.status = TunnelStatus::Stopped;
            Ok(())
        } else {
            Err(TerminalError::Tunnel(format!("Tunnel not found: {}", id)))
        }
    }

    /// Remove a tunnel
    pub async fn remove_tunnel(&self, id: &Uuid) -> bool {
        let _ = self.stop_tunnel(id).await;
        let mut map = self.tunnels.lock().await;
        map.remove(id).is_some()
    }
}

/// Start a local TCP listener to verify port bindability
pub async fn verify_local_port_available(port: u16) -> Result<bool> {
    match TcpListener::bind(("127.0.0.1", port)).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_tunnel_manager_lifecycle() {
        let manager = TunnelManager::new();
        let config = TunnelConfig::new_local(
            "mysql-tunnel".to_string(),
            Uuid::new_v4(),
            3306,
            "127.0.0.1".to_string(),
            3306,
        );
        let id = config.id;

        manager.add_tunnel(config).await;
        assert_eq!(manager.get_status(&id).await, Some(TunnelStatus::Stopped));

        manager.stop_tunnel(&id).await.unwrap();
        assert_eq!(manager.get_status(&id).await, Some(TunnelStatus::Stopped));

        assert!(manager.remove_tunnel(&id).await);
        assert_eq!(manager.get_status(&id).await, None);
    }
}
