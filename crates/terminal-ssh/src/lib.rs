pub mod client;
pub mod session;

pub use client::*;
pub use session::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_handler_creation() {
        let handler = SshClientHandler::new(true);
        assert!(handler.accept_all_host_keys);

        let strict_handler = SshClientHandler::new(false);
        assert!(!strict_handler.accept_all_host_keys);
    }
}
