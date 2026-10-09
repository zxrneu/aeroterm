use chrono::Utc;
use std::collections::HashMap;
use terminal_core::{DiskMetric, NetworkMetric, Result, SystemMetrics};

/// Command executed on the remote host via SSH exec to sample system state
pub const AGENTLESS_LINUX_PROBE_CMD: &str = r#"
cat << 'TERMINAL_PRO_EOF'
===STAT===
$(cat /proc/stat 2>/dev/null)
===MEM===
$(cat /proc/meminfo 2>/dev/null)
===LOAD===
$(cat /proc/loadavg 2>/dev/null)
===UPTIME===
$(cat /proc/uptime 2>/dev/null)
===NET===
$(cat /proc/net/dev 2>/dev/null)
===DF===
$(df -kP 2>/dev/null)
TERMINAL_PRO_EOF
"#;

#[derive(Debug, Clone, Default)]
pub struct CpuRawStats {
    pub user: u64,
    pub nice: u64,
    pub system: u64,
    pub idle: u64,
    pub iowait: u64,
    pub irq: u64,
    pub softirq: u64,
    pub steal: u64,
}

impl CpuRawStats {
    pub fn total(&self) -> u64 {
        self.user
            + self.nice
            + self.system
            + self.idle
            + self.iowait
            + self.irq
            + self.softirq
            + self.steal
    }

    pub fn idle_total(&self) -> u64 {
        self.idle + self.iowait
    }
}

/// Calculate CPU usage percentage given two consecutive readings
pub fn calculate_cpu_percent(prev: &CpuRawStats, curr: &CpuRawStats) -> f32 {
    let prev_total = prev.total();
    let curr_total = curr.total();
    let prev_idle = prev.idle_total();
    let curr_idle = curr.idle_total();

    let total_delta = curr_total.saturating_sub(prev_total);
    let idle_delta = curr_idle.saturating_sub(prev_idle);

    if total_delta == 0 {
        return 0.0;
    }

    let usage = (total_delta - idle_delta) as f32 / total_delta as f32 * 100.0;
    usage.clamp(0.0, 100.0)
}

/// Parse Linux probe combined output
pub fn parse_linux_probe_output(output: &str) -> Result<SystemMetrics> {
    let mut sections: HashMap<&str, String> = HashMap::new();
    let mut current_section = "";
    let mut current_lines = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("===") && trimmed.ends_with("===") {
            if !current_section.is_empty() {
                sections.insert(current_section, current_lines.join("\n"));
                current_lines.clear();
            }
            current_section = trimmed.trim_matches('=');
        } else if !current_section.is_empty() {
            current_lines.push(line);
        }
    }
    if !current_section.is_empty() {
        sections.insert(current_section, current_lines.join("\n"));
    }

    // Parse Load Average
    let (load_1m, load_5m, load_15m) =
        parse_loadavg(sections.get("LOAD").unwrap_or(&String::new()));

    // Parse Uptime
    let uptime_secs = parse_uptime(sections.get("UPTIME").unwrap_or(&String::new()));

    // Parse Memory & Swap
    let (mem_total, mem_used, swap_total, swap_used) =
        parse_meminfo(sections.get("MEM").unwrap_or(&String::new()));

    // Parse CPU stats
    let (cpu_percent, cpu_cores) = parse_cpu_stat(sections.get("STAT").unwrap_or(&String::new()));

    // Parse Disks
    let disks = parse_df(sections.get("DF").unwrap_or(&String::new()));

    // Parse Network
    let networks = parse_net(sections.get("NET").unwrap_or(&String::new()));

    Ok(SystemMetrics {
        cpu_usage_percent: cpu_percent,
        cpu_cores,
        memory_total_bytes: mem_total,
        memory_used_bytes: mem_used,
        swap_total_bytes: swap_total,
        swap_used_bytes: swap_used,
        load_1m,
        load_5m,
        load_15m,
        uptime_secs,
        disks,
        networks,
        gpus: Vec::new(),
        top_processes: Vec::new(),
        timestamp: Utc::now(),
    })
}

fn parse_loadavg(s: &str) -> (f32, f32, f32) {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() >= 3 {
        let l1 = parts[0].parse::<f32>().unwrap_or(0.0);
        let l5 = parts[1].parse::<f32>().unwrap_or(0.0);
        let l15 = parts[2].parse::<f32>().unwrap_or(0.0);
        (l1, l5, l15)
    } else {
        (0.0, 0.0, 0.0)
    }
}

fn parse_uptime(s: &str) -> u64 {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if !parts.is_empty() {
        parts[0].parse::<f64>().unwrap_or(0.0) as u64
    } else {
        0
    }
}

fn parse_meminfo(s: &str) -> (u64, u64, u64, u64) {
    let mut total_kb = 0u64;
    let mut free_kb = 0u64;
    let mut avail_kb = 0u64;
    let mut buffers_kb = 0u64;
    let mut cached_kb = 0u64;
    let mut swap_total_kb = 0u64;
    let mut swap_free_kb = 0u64;

    for line in s.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() == 2 {
            let key = parts[0].trim();
            let val = parts[1]
                .split_whitespace()
                .next()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);

            match key {
                "MemTotal" => total_kb = val,
                "MemFree" => free_kb = val,
                "MemAvailable" => avail_kb = val,
                "Buffers" => buffers_kb = val,
                "Cached" => cached_kb = val,
                "SwapTotal" => swap_total_kb = val,
                "SwapFree" => swap_free_kb = val,
                _ => {}
            }
        }
    }

    let used_kb = if avail_kb > 0 {
        total_kb.saturating_sub(avail_kb)
    } else {
        total_kb.saturating_sub(free_kb + buffers_kb + cached_kb)
    };
    let swap_used_kb = swap_total_kb.saturating_sub(swap_free_kb);

    (
        total_kb * 1024,
        used_kb * 1024,
        swap_total_kb * 1024,
        swap_used_kb * 1024,
    )
}

fn parse_cpu_stat(s: &str) -> (f32, Vec<f32>) {
    let mut cores = Vec::new();
    let mut overall_percent = 0.0;

    for line in s.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        if parts[0] == "cpu" && parts.len() >= 5 {
            let user = parts[1].parse::<u64>().unwrap_or(0);
            let nice = parts[2].parse::<u64>().unwrap_or(0);
            let system = parts[3].parse::<u64>().unwrap_or(0);
            let idle = parts[4].parse::<u64>().unwrap_or(0);
            let total = user + nice + system + idle;
            if total > 0 {
                overall_percent = ((total - idle) as f32 / total as f32 * 100.0).clamp(0.0, 100.0);
            }
        } else if parts[0].starts_with("cpu") && parts[0].len() > 3 && parts.len() >= 5 {
            let user = parts[1].parse::<u64>().unwrap_or(0);
            let nice = parts[2].parse::<u64>().unwrap_or(0);
            let system = parts[3].parse::<u64>().unwrap_or(0);
            let idle = parts[4].parse::<u64>().unwrap_or(0);
            let total = user + nice + system + idle;
            let percent = if total > 0 {
                ((total - idle) as f32 / total as f32 * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            cores.push(percent);
        }
    }

    (overall_percent, cores)
}

fn parse_df(s: &str) -> Vec<DiskMetric> {
    let mut disks = Vec::new();
    for (i, line) in s.lines().enumerate() {
        if i == 0 {
            continue; // skip header
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 6 {
            let filesystem = parts[0].to_string();
            let total_kb = parts[1].parse::<u64>().unwrap_or(0);
            let used_kb = parts[2].parse::<u64>().unwrap_or(0);
            let free_kb = parts[3].parse::<u64>().unwrap_or(0);
            let use_percent = parts[4].trim_end_matches('%').parse::<f32>().unwrap_or(0.0);
            let mount_point = parts[5].to_string();

            // Only track non-virtual filesystems
            if !filesystem.starts_with("tmpfs") && !filesystem.starts_with("devtmpfs") {
                disks.push(DiskMetric {
                    filesystem,
                    mount_point,
                    total_bytes: total_kb * 1024,
                    used_bytes: used_kb * 1024,
                    free_bytes: free_kb * 1024,
                    use_percent,
                });
            }
        }
    }
    disks
}

fn parse_net(s: &str) -> Vec<NetworkMetric> {
    let mut nets = Vec::new();
    for line in s.lines() {
        if !line.contains(':') {
            continue;
        }
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() == 2 {
            let interface = parts[0].trim().to_string();
            let fields: Vec<&str> = parts[1].split_whitespace().collect();
            if fields.len() >= 9 {
                let rx_bytes = fields[0].parse::<u64>().unwrap_or(0);
                let rx_packets = fields[1].parse::<u64>().unwrap_or(0);
                let tx_bytes = fields[8].parse::<u64>().unwrap_or(0);
                let tx_packets = fields[9].parse::<u64>().unwrap_or(0);

                if interface != "lo" {
                    nets.push(NetworkMetric {
                        interface,
                        rx_bytes_per_sec: rx_bytes,
                        tx_bytes_per_sec: tx_bytes,
                        rx_packets_per_sec: rx_packets,
                        tx_packets_per_sec: tx_packets,
                    });
                }
            }
        }
    }
    nets
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_OUTPUT: &str = r#"
===STAT===
cpu  2255 34 2290 22625563 6290 127 456 0 0 0
cpu0 1132 17 1140 11311890 3140 60 220 0 0 0
cpu1 1123 17 1150 11313673 3150 67 236 0 0 0
===MEM===
MemTotal:       16384000 kB
MemFree:         4096000 kB
MemAvailable:   12288000 kB
Buffers:          512000 kB
Cached:          7680000 kB
SwapTotal:       2097152 kB
SwapFree:        2097152 kB
===LOAD===
0.42 0.35 0.28 1/850 12345
===UPTIME===
86400.50 172800.00
===NET===
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1234567   1000    0    0    0     0          0         0  1234567   1000    0    0    0     0       0          0
  eth0: 987654321 500000  0    0    0     0          0         0  123456789 200000  0    0    0     0       0          0
===DF===
Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/sda1      104857600  41943040  62914560  40% /
tmpfs            8192000         0   8192000   0% /dev/shm
/dev/sdb1      209715200 104857600 104857600  50% /data
"#;

    #[test]
    fn test_parse_linux_probe() {
        let metrics = parse_linux_probe_output(SAMPLE_OUTPUT).unwrap();

        // Check load & uptime
        assert_eq!(metrics.load_1m, 0.42);
        assert_eq!(metrics.load_5m, 0.35);
        assert_eq!(metrics.load_15m, 0.28);
        assert_eq!(metrics.uptime_secs, 86400);

        // Check memory (16GB total, 12GB avail -> 4GB used)
        assert_eq!(metrics.memory_total_bytes, 16384000 * 1024);
        assert_eq!(metrics.memory_used_bytes, (16384000 - 12288000) * 1024);

        // Check disks (tmpfs filtered out, only sda1 and sdb1)
        assert_eq!(metrics.disks.len(), 2);
        assert_eq!(metrics.disks[0].mount_point, "/");
        assert_eq!(metrics.disks[0].use_percent, 40.0);
        assert_eq!(metrics.disks[1].mount_point, "/data");
        assert_eq!(metrics.disks[1].use_percent, 50.0);

        // Check net (lo filtered out, only eth0)
        assert_eq!(metrics.networks.len(), 1);
        assert_eq!(metrics.networks[0].interface, "eth0");
        assert_eq!(metrics.networks[0].rx_bytes_per_sec, 987654321);

        // Check cores
        assert_eq!(metrics.cpu_cores.len(), 2);
    }
}
