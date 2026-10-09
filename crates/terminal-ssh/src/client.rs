use russh::client::Handler;
use russh::keys::PublicKeyOrCertificate;

/// Default SSH client handler accepting or verifying host keys
#[derive(Debug, Clone, Default)]
pub struct SshClientHandler {
    pub accept_all_host_keys: bool,
}

impl SshClientHandler {
    pub fn new(accept_all_host_keys: bool) -> Self {
        Self {
            accept_all_host_keys,
        }
    }
}

impl Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        if self.accept_all_host_keys {
            Ok(true)
        } else {
            // Strict host key verification: rejects unknown keys by default
            Ok(false)
        }
    }
}
