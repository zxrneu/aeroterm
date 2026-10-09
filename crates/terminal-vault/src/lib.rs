use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{password_hash::rand_core::OsRng, Argon2};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use terminal_core::{Result, TerminalError};
use zeroize::Zeroizing;

const NONCE_LEN: usize = 12; // 96-bit AES-GCM nonce
const SALT_LEN: usize = 16; // 128-bit salt
const KEY_LEN: usize = 32; // 256-bit AES key

/// Encrypted secret envelope stored in the vault
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedEnvelope {
    pub secret_id: String,
    pub nonce_hex: String,
    pub ciphertext_hex: String,
}

/// Metadata and master salt for vault authentication and key derivation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultHeader {
    pub salt_hex: String,
    pub test_ciphertext_hex: String,
    pub test_nonce_hex: String,
}

/// The Zero-Knowledge Credential Vault
#[derive(Debug, Clone, Default)]
pub struct CredentialVault {
    header: Option<VaultHeader>,
    secrets: HashMap<String, EncryptedEnvelope>,
}

impl CredentialVault {
    pub fn new() -> Self {
        Self {
            header: None,
            secrets: HashMap::new(),
        }
    }

    /// Check if the vault has been initialized with a master password
    pub fn is_initialized(&self) -> bool {
        self.header.is_some()
    }

    /// Initialize the vault with a new master password
    pub fn initialize(&mut self, master_password: &str) -> Result<()> {
        if master_password.is_empty() {
            return Err(TerminalError::Vault(
                "Master password cannot be empty".to_string(),
            ));
        }

        let mut salt = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut salt);

        let derived_key = Self::derive_key(master_password, &salt)?;

        // Create a test encryption verification token (encrypting "TERMINAL_PRO_VAULT_OK")
        let test_nonce = Self::generate_nonce();
        let cipher = Aes256Gcm::new_from_slice(derived_key.as_ref())
            .map_err(|e| TerminalError::Vault(format!("Cipher init error: {}", e)))?;

        let test_plaintext = b"TERMINAL_PRO_VAULT_OK";
        let test_ciphertext = cipher
            .encrypt(Nonce::from_slice(&test_nonce), test_plaintext.as_ref())
            .map_err(|e| {
                TerminalError::Vault(format!("Failed to encrypt verification token: {}", e))
            })?;

        self.header = Some(VaultHeader {
            salt_hex: hex_encode(&salt),
            test_nonce_hex: hex_encode(&test_nonce),
            test_ciphertext_hex: hex_encode(&test_ciphertext),
        });

        Ok(())
    }

    /// Verify if a master password matches the vault header
    pub fn unlock(&self, master_password: &str) -> Result<Zeroizing<[u8; KEY_LEN]>> {
        let header = self.header.as_ref().ok_or_else(|| {
            TerminalError::Vault(
                "Vault has not been initialized with a master password".to_string(),
            )
        })?;

        let salt = hex_decode(&header.salt_hex)
            .map_err(|e| TerminalError::Vault(format!("Corrupted vault salt: {}", e)))?;
        let test_nonce = hex_decode(&header.test_nonce_hex)
            .map_err(|e| TerminalError::Vault(format!("Corrupted vault test nonce: {}", e)))?;
        let test_ciphertext = hex_decode(&header.test_ciphertext_hex)
            .map_err(|e| TerminalError::Vault(format!("Corrupted vault test ciphertext: {}", e)))?;

        let derived_key = Self::derive_key(master_password, &salt)?;

        let cipher = Aes256Gcm::new_from_slice(derived_key.as_ref())
            .map_err(|e| TerminalError::Vault(format!("Cipher init error: {}", e)))?;

        let decrypted = cipher
            .decrypt(Nonce::from_slice(&test_nonce), test_ciphertext.as_ref())
            .map_err(|_| TerminalError::Auth("Incorrect master password".to_string()))?;

        if decrypted != b"TERMINAL_PRO_VAULT_OK" {
            return Err(TerminalError::Auth(
                "Verification token mismatch".to_string(),
            ));
        }

        Ok(derived_key)
    }

    /// Store and encrypt a secret (e.g., password, SSH private key)
    pub fn set_secret(
        &mut self,
        secret_id: impl Into<String>,
        secret_data: &[u8],
        master_key: &[u8; KEY_LEN],
    ) -> Result<()> {
        let secret_id = secret_id.into();
        let nonce = Self::generate_nonce();

        let cipher = Aes256Gcm::new_from_slice(master_key)
            .map_err(|e| TerminalError::Vault(format!("Cipher init error: {}", e)))?;

        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), secret_data)
            .map_err(|e| TerminalError::Vault(format!("Failed to encrypt secret: {}", e)))?;

        let envelope = EncryptedEnvelope {
            secret_id: secret_id.clone(),
            nonce_hex: hex_encode(&nonce),
            ciphertext_hex: hex_encode(&ciphertext),
        };

        self.secrets.insert(secret_id, envelope);
        Ok(())
    }

    /// Decrypt and retrieve a secret. Returns a zeroized memory buffer.
    pub fn get_secret(
        &self,
        secret_id: &str,
        master_key: &[u8; KEY_LEN],
    ) -> Result<Zeroizing<Vec<u8>>> {
        let envelope = self
            .secrets
            .get(secret_id)
            .ok_or_else(|| TerminalError::Vault(format!("Secret not found: {}", secret_id)))?;

        let nonce = hex_decode(&envelope.nonce_hex)
            .map_err(|e| TerminalError::Vault(format!("Invalid nonce hex: {}", e)))?;
        let ciphertext = hex_decode(&envelope.ciphertext_hex)
            .map_err(|e| TerminalError::Vault(format!("Invalid ciphertext hex: {}", e)))?;

        let cipher = Aes256Gcm::new_from_slice(master_key)
            .map_err(|e| TerminalError::Vault(format!("Cipher init error: {}", e)))?;

        let decrypted = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|e| {
                TerminalError::Vault(format!("Decryption failed or corrupted payload: {}", e))
            })?;

        Ok(Zeroizing::new(decrypted))
    }

    /// Remove a secret from the vault
    pub fn remove_secret(&mut self, secret_id: &str) -> bool {
        self.secrets.remove(secret_id).is_some()
    }

    // --- Internal cryptographic helpers ---

    fn derive_key(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; KEY_LEN]>> {
        let mut key = Zeroizing::new([0u8; KEY_LEN]);
        let argon2 = Argon2::default();

        argon2
            .hash_password_into(password.as_bytes(), salt, key.as_mut())
            .map_err(|e| TerminalError::Vault(format!("Key derivation failed: {}", e)))?;

        Ok(key)
    }

    fn generate_nonce() -> [u8; NONCE_LEN] {
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        nonce
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        write!(&mut s, "{:02x}", b).unwrap();
    }
    s
}

fn hex_decode(s: &str) -> std::result::Result<Vec<u8>, String> {
    if !s.len().is_multiple_of(2) {
        return Err("Odd length hex string".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_initialization_and_unlock() {
        let mut vault = CredentialVault::new();
        assert!(!vault.is_initialized());

        vault.initialize("SuperSecretMasterPassword!2026").unwrap();
        assert!(vault.is_initialized());

        // Correct password succeeds
        let master_key = vault.unlock("SuperSecretMasterPassword!2026").unwrap();
        assert_ne!(master_key.as_ref(), &[0u8; 32]);

        // Wrong password fails
        let wrong_attempt = vault.unlock("WrongPassword");
        assert!(wrong_attempt.is_err());
    }

    #[test]
    fn test_secret_encrypt_and_decrypt() {
        let mut vault = CredentialVault::new();
        vault.initialize("AdminVaultPass123").unwrap();
        let key = vault.unlock("AdminVaultPass123").unwrap();

        let secret_id = "server-prod-root-ssh-key";
        let secret_payload = b"-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA...\n-----END OPENSSH PRIVATE KEY-----";

        vault.set_secret(secret_id, secret_payload, &key).unwrap();

        let retrieved = vault.get_secret(secret_id, &key).unwrap();
        assert_eq!(retrieved.as_slice(), secret_payload);
    }

    #[test]
    fn test_secret_tamper_detection() {
        let mut vault = CredentialVault::new();
        vault.initialize("Pass123").unwrap();
        let key = vault.unlock("Pass123").unwrap();

        vault.set_secret("test", b"hello world", &key).unwrap();

        // Corrupt the ciphertext
        if let Some(env) = vault.secrets.get_mut("test") {
            let mut raw = hex_decode(&env.ciphertext_hex).unwrap();
            raw[0] ^= 0xFF; // flip bits
            env.ciphertext_hex = hex_encode(&raw);
        }

        let result = vault.get_secret("test", &key);
        assert!(result.is_err());
    }
}
