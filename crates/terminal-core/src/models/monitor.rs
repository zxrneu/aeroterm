use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskMetric {
    pub filesystem: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub use_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMetric {
    pub interface: String,
    pub rx_bytes_per_sec: u64,
    pub tx_bytes_per_sec: u64,
    pub rx_packets_per_sec: u64,
    pub tx_packets_per_sec: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuMetric {
    pub index: u32,
    pub name: String,
    pub temperature_c: f32,
    pub utilization_percent: f32,
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessItem {
    pub pid: u32,
    pub user: String,
    pub cpu_percent: f32,
    pub mem_percent: f32,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_usage_percent: f32,
    pub cpu_cores: Vec<f32>,
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub load_1m: f32,
    pub load_5m: f32,
    pub load_15m: f32,
    pub uptime_secs: u64,
    pub disks: Vec<DiskMetric>,
    pub networks: Vec<NetworkMetric>,
    pub gpus: Vec<GpuMetric>,
    pub top_processes: Vec<ProcessItem>,
    pub timestamp: DateTime<Utc>,
}
