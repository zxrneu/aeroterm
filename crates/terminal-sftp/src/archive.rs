use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Read;
use tar::{Archive, Builder, Header};
use terminal_core::{Result, TerminalError};

/// Archive utility to bundle multiple files into a compressed tar.gz stream
pub struct StreamArchive;

impl StreamArchive {
    /// Create a compressed tar.gz payload from in-memory file entries
    pub fn pack_files(entries: &[(&str, &[u8])]) -> Result<Vec<u8>> {
        let mut gz = GzEncoder::new(Vec::new(), Compression::fast());
        {
            let mut tar = Builder::new(&mut gz);
            for (path, content) in entries {
                let mut header = Header::new_gnu();
                header.set_size(content.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();

                tar.append_data(&mut header, *path, *content).map_err(|e| {
                    TerminalError::Sftp(format!("Tar append error for '{}': {}", path, e))
                })?;
            }
            tar.finish()
                .map_err(|e| TerminalError::Sftp(format!("Tar finish error: {}", e)))?;
        }
        gz.finish()
            .map_err(|e| TerminalError::Sftp(format!("Gzip compression finish error: {}", e)))
    }

    /// Unpack a compressed tar.gz payload into list of (path, bytes)
    pub fn unpack_files(archive_bytes: &[u8]) -> Result<Vec<(String, Vec<u8>)>> {
        let gz = GzDecoder::new(archive_bytes);
        let mut tar = Archive::new(gz);

        let mut results = Vec::new();
        let entries = tar
            .entries()
            .map_err(|e| TerminalError::Sftp(format!("Failed to read tar entries: {}", e)))?;

        for entry_res in entries {
            let mut entry = entry_res
                .map_err(|e| TerminalError::Sftp(format!("Failed to parse tar entry: {}", e)))?;
            let path = entry
                .path()
                .map_err(|e| TerminalError::Sftp(format!("Invalid path in tar: {}", e)))?
                .to_string_lossy()
                .to_string();

            let mut data = Vec::new();
            entry.read_to_end(&mut data).map_err(|e| {
                TerminalError::Sftp(format!("Failed to read file data from tar: {}", e))
            })?;

            results.push((path, data));
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tar_gz_stream_pack_unpack_roundtrip() {
        let files = vec![
            (
                "config/app.json",
                br#"{"env": "prod", "workers": 4}"#.as_slice(),
            ),
            (
                "src/main.rs",
                b"fn main() { println!(\"Hello World\"); }".as_slice(),
            ),
            (
                "README.md",
                b"# Documentation\nFast streaming transfers".as_slice(),
            ),
        ];

        let compressed = StreamArchive::pack_files(&files).unwrap();
        assert!(!compressed.is_empty());

        let unpacked = StreamArchive::unpack_files(&compressed).unwrap();
        assert_eq!(unpacked.len(), 3);
        assert_eq!(unpacked[0].0, "config/app.json");
        assert_eq!(unpacked[0].1, files[0].1);
        assert_eq!(unpacked[1].0, "src/main.rs");
        assert_eq!(unpacked[1].1, files[1].1);
        assert_eq!(unpacked[2].0, "README.md");
        assert_eq!(unpacked[2].1, files[2].1);
    }
}
