pub mod archive;

pub use archive::StreamArchive;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub permissions: u32,
    pub modified_timestamp: u64,
}

impl RemoteFileEntry {
    pub fn new_file(name: String, path: String, size_bytes: u64, permissions: u32) -> Self {
        Self {
            name,
            path,
            is_dir: false,
            size_bytes,
            permissions,
            modified_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }

    pub fn new_dir(name: String, path: String, permissions: u32) -> Self {
        Self {
            name,
            path,
            is_dir: true,
            size_bytes: 0,
            permissions,
            modified_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub total_files: usize,
    pub completed_files: usize,
    pub current_file: String,
}

impl TransferProgress {
    pub fn progress_percent(&self) -> f32 {
        if self.total_bytes == 0 {
            100.0
        } else {
            ((self.transferred_bytes as f32 / self.total_bytes as f32) * 100.0).clamp(0.0, 100.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remote_file_entry_creation() {
        let file = RemoteFileEntry::new_file(
            "app.log".to_string(),
            "/var/log/app.log".to_string(),
            1048576,
            0o644,
        );
        assert!(!file.is_dir);
        assert_eq!(file.size_bytes, 1048576);

        let dir = RemoteFileEntry::new_dir("log".to_string(), "/var/log".to_string(), 0o755);
        assert!(dir.is_dir);
        assert_eq!(dir.size_bytes, 0);
    }

    #[test]
    fn test_transfer_progress_percent() {
        let progress = TransferProgress {
            total_bytes: 1000,
            transferred_bytes: 450,
            total_files: 5,
            completed_files: 2,
            current_file: "image.png".to_string(),
        };

        assert!((progress.progress_percent() - 45.0).abs() < 0.01);
    }
}
