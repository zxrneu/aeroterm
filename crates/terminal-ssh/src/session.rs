use crate::client::SshClientHandler;
use russh::client::{self, Handle};
use russh::keys::decode_secret_key;
use russh::Channel;
use std::sync::Arc;
use terminal_core::{AuthMethod, Result, TerminalError};
use terminal_vault::CredentialVault;

pub struct SshSession {
    handle: Handle<SshClientHandler>,
    host: String,
    port: u16,
    username: String,
}

impl SshSession {
    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn username(&self) -> &str {
        &self.username
    }
    /// Connect and authenticate an SSH session
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        auth: &AuthMethod,
        vault: Option<&CredentialVault>,
        master_key: Option<&[u8; 32]>,
    ) -> Result<Self> {
        let config = Arc::new(client::Config::default());
        let handler = SshClientHandler::new(true);

        let mut handle = client::connect(config, (host, port), handler)
            .await
            .map_err(|e| {
                TerminalError::Connection(format!("Failed to connect to {}:{}: {}", host, port, e))
            })?;

        // Authenticate based on method
        match auth {
            AuthMethod::Password { secret_id } => {
                let password = match secret_id {
                    Some(id) => {
                        let v = vault.ok_or_else(|| {
                            TerminalError::Vault("Vault required to decrypt password".to_string())
                        })?;
                        let k = master_key.ok_or_else(|| {
                            TerminalError::Vault(
                                "Vault master key required to decrypt password".to_string(),
                            )
                        })?;
                        let raw = v.get_secret(id, k)?;
                        String::from_utf8(raw.to_vec()).map_err(|e| {
                            TerminalError::Vault(format!("Password utf8 decode failed: {}", e))
                        })?
                    }
                    None => {
                        return Err(TerminalError::Auth(
                            "No password or secret ID provided".to_string(),
                        ));
                    }
                };

                let auth_res = handle
                    .authenticate_password(username, &password)
                    .await
                    .map_err(|e| {
                        TerminalError::Auth(format!("Password authentication failed: {}", e))
                    })?;

                if !auth_res.success() {
                    return Err(TerminalError::Auth(
                        "Invalid SSH username or password".to_string(),
                    ));
                }
            }
            AuthMethod::PrivateKey {
                private_key_secret_id,
                passphrase_secret_id,
            } => {
                let v = vault.ok_or_else(|| {
                    TerminalError::Vault("Vault required to decrypt private key".to_string())
                })?;
                let k = master_key.ok_or_else(|| {
                    TerminalError::Vault(
                        "Vault master key required to decrypt private key".to_string(),
                    )
                })?;

                let key_bytes = v.get_secret(private_key_secret_id, k)?;
                let key_str = std::str::from_utf8(&key_bytes).map_err(|e| {
                    TerminalError::Vault(format!("Private key utf8 decode failed: {}", e))
                })?;

                let passphrase = match passphrase_secret_id {
                    Some(pass_id) => {
                        let pass_bytes = v.get_secret(pass_id, k)?;
                        Some(String::from_utf8(pass_bytes.to_vec()).map_err(|e| {
                            TerminalError::Vault(format!("Passphrase utf8 decode failed: {}", e))
                        })?)
                    }
                    None => None,
                };

                let key_pair = decode_secret_key(key_str, passphrase.as_deref()).map_err(|e| {
                    TerminalError::Auth(format!("Failed to parse private key: {}", e))
                })?;

                let key_with_alg =
                    russh::keys::key::PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
                let auth_res = handle
                    .authenticate_publickey(username, key_with_alg)
                    .await
                    .map_err(|e| {
                        TerminalError::Auth(format!("Public key authentication failed: {}", e))
                    })?;

                if !auth_res.success() {
                    return Err(TerminalError::Auth(
                        "Public key authentication rejected by server".to_string(),
                    ));
                }
            }
            _ => {
                return Err(TerminalError::Auth(
                    "Unsupported authentication method for automated connect".to_string(),
                ));
            }
        }

        Ok(Self {
            handle,
            host: host.to_string(),
            port,
            username: username.to_string(),
        })
    }

    /// Open an interactive PTY shell channel
    pub async fn open_shell(&mut self, rows: u16, cols: u16) -> Result<Channel<client::Msg>> {
        let channel =
            self.handle.channel_open_session().await.map_err(|e| {
                TerminalError::Ssh(format!("Failed to open session channel: {}", e))
            })?;

        channel
            .request_pty(false, "xterm-256color", cols as u32, rows as u32, 0, 0, &[])
            .await
            .map_err(|e| TerminalError::Ssh(format!("Failed to request PTY: {}", e)))?;

        channel
            .request_shell(false)
            .await
            .map_err(|e| TerminalError::Ssh(format!("Failed to request shell: {}", e)))?;

        Ok(channel)
    }

    /// Execute a non-interactive command and capture its stdout/stderr output
    pub async fn exec(&mut self, command: &str) -> Result<String> {
        let mut channel =
            self.handle.channel_open_session().await.map_err(|e| {
                TerminalError::Ssh(format!("Failed to open session channel: {}", e))
            })?;

        channel.exec(true, command).await.map_err(|e| {
            TerminalError::Ssh(format!("Failed to exec command '{}': {}", command, e))
        })?;

        let mut output = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                russh::ChannelMsg::Data { ref data } => {
                    output.extend_from_slice(data);
                }
                russh::ChannelMsg::ExtendedData { ref data, .. } => {
                    output.extend_from_slice(data);
                }
                russh::ChannelMsg::ExitStatus { .. } => {
                    break;
                }
                _ => {}
            }
        }

        String::from_utf8(output)
            .map_err(|e| TerminalError::Ssh(format!("Output utf8 decoding failed: {}", e)))
    }

    /// Open a direct-tcpip channel for local port forwarding or tunneling
    pub async fn open_direct_tcpip(
        &mut self,
        target_host: &str,
        target_port: u16,
        originator_host: &str,
        originator_port: u16,
    ) -> Result<Channel<client::Msg>> {
        self.handle
            .channel_open_direct_tcpip(
                target_host,
                target_port as u32,
                originator_host,
                originator_port as u32,
            )
            .await
            .map_err(|e| TerminalError::Tunnel(format!("Direct TCP/IP channel failed: {}", e)))
    }
}
