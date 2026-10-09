use std::net::{Ipv4Addr, Ipv6Addr};
use terminal_core::{Result, TerminalError};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub struct Socks5Negotiation;

impl Socks5Negotiation {
    /// Perform SOCKS5 RFC 1928 handshake and extract target (host, port)
    pub async fn handshake<S>(stream: &mut S) -> Result<(String, u16)>
    where
        S: AsyncRead + AsyncWrite + Unpin,
    {
        // 1. Version & Method negotiation
        let ver = stream
            .read_u8()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("SOCKS5 version read failed: {}", e)))?;
        if ver != 0x05 {
            return Err(TerminalError::Tunnel(format!(
                "Unsupported SOCKS version: {}",
                ver
            )));
        }

        let nmethods = stream
            .read_u8()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read nmethods: {}", e)))?;
        let mut methods = vec![0u8; nmethods as usize];
        stream
            .read_exact(&mut methods)
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read methods: {}", e)))?;

        // Reply with 0x00 (NO AUTHENTICATION REQUIRED)
        stream
            .write_all(&[0x05, 0x00])
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to write method reply: {}", e)))?;

        // 2. Request details
        let req_ver = stream
            .read_u8()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read request version: {}", e)))?;
        if req_ver != 0x05 {
            return Err(TerminalError::Tunnel(
                "Invalid SOCKS request version".to_string(),
            ));
        }

        let cmd = stream
            .read_u8()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read command: {}", e)))?;
        let _rsv = stream
            .read_u8()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read reserved: {}", e)))?;
        let atyp = stream
            .read_u8()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read atyp: {}", e)))?;

        // We only support CONNECT (0x01)
        if cmd != 0x01 {
            let _ = stream
                .write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await;
            return Err(TerminalError::Tunnel(format!(
                "Unsupported SOCKS command: {}",
                cmd
            )));
        }

        let target_host =
            match atyp {
                0x01 => {
                    // IPv4
                    let mut ip = [0u8; 4];
                    stream.read_exact(&mut ip).await.map_err(|e| {
                        TerminalError::Tunnel(format!("Failed to read IPv4: {}", e))
                    })?;
                    Ipv4Addr::from(ip).to_string()
                }
                0x03 => {
                    // Domain name
                    let len = stream.read_u8().await.map_err(|e| {
                        TerminalError::Tunnel(format!("Failed to read domain length: {}", e))
                    })?;
                    let mut domain = vec![0u8; len as usize];
                    stream.read_exact(&mut domain).await.map_err(|e| {
                        TerminalError::Tunnel(format!("Failed to read domain: {}", e))
                    })?;
                    String::from_utf8(domain)
                        .map_err(|e| TerminalError::Tunnel(format!("Invalid domain utf8: {}", e)))?
                }
                0x04 => {
                    // IPv6
                    let mut ip = [0u8; 16];
                    stream.read_exact(&mut ip).await.map_err(|e| {
                        TerminalError::Tunnel(format!("Failed to read IPv6: {}", e))
                    })?;
                    Ipv6Addr::from(ip).to_string()
                }
                _ => {
                    let _ = stream
                        .write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                        .await;
                    return Err(TerminalError::Tunnel(format!("Unsupported ATYP: {}", atyp)));
                }
            };

        let target_port = stream
            .read_u16()
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to read target port: {}", e)))?;

        // Reply success: 0x00 = succeeded
        stream
            .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Failed to write success reply: {}", e)))?;

        Ok((target_host, target_port))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn test_socks5_handshake_ipv4() {
        let (mut client, mut server) = duplex(1024);

        let client_task = tokio::spawn(async move {
            // Send client greeting: ver 5, 1 method (0x00 no auth)
            client.write_all(&[0x05, 0x01, 0x00]).await.unwrap();

            // Read server choice
            let mut choice = [0u8; 2];
            client.read_exact(&mut choice).await.unwrap();
            assert_eq!(choice, [0x05, 0x00]);

            // Send CONNECT request: ver 5, cmd 1, rsv 0, atyp 1 (127.0.0.1), port 8080 (0x1F90)
            client
                .write_all(&[0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0x1F, 0x90])
                .await
                .unwrap();

            // Read server response
            let mut reply = [0u8; 10];
            client.read_exact(&mut reply).await.unwrap();
            assert_eq!(reply[0], 0x05);
            assert_eq!(reply[1], 0x00); // success
        });

        let server_task = tokio::spawn(async move {
            let (host, port) = Socks5Negotiation::handshake(&mut server).await.unwrap();
            assert_eq!(host, "127.0.0.1");
            assert_eq!(port, 8080);
        });

        tokio::try_join!(client_task, server_task).unwrap();
    }
}
