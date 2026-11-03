use super::*;

#[tokio::test]
async fn binary_input_validates_bytes_and_size_before_session_lookup() {
    let client = Client::default();
    let valid: Command = serde_json::from_value(serde_json::json!({
        "type": "writeBinary", "id": "ssh-missing", "data": [0, 24, 127, 128, 255]
    }))
    .unwrap();
    assert!(matches!(client.command(valid).await, Err(Error::Closed)));
    for bytes in [
        serde_json::json!([-1]),
        serde_json::json!([256]),
        serde_json::json!([1.5]),
    ] {
        assert!(serde_json::from_value::<Command>(serde_json::json!({
            "type": "writeBinary", "id": "ssh-missing", "data": bytes
        }))
        .is_err());
    }
    assert!(matches!(
        client
            .command(Command::WriteBinary {
                id: "ssh-missing".into(),
                data: vec![0; MAX_INPUT_BYTES + 1]
            })
            .await,
        Err(Error::Invalid)
    ));
}

#[test]
fn upload_chunks_validate_ranges_without_limiting_total_file_size() {
    use crate::uploads::{decode_chunk, validate_range};
    use base64::{engine::general_purpose::STANDARD, Engine};
    assert!(decode_chunk(&STANDARD.encode(vec![0; UPLOAD_CHUNK_BYTES])).is_ok());
    assert!(decode_chunk(&STANDARD.encode(vec![0; UPLOAD_CHUNK_BYTES + 1])).is_err());
    assert!(decode_chunk("not base64").is_err());
    assert!(decode_chunk("").is_err());
    assert_eq!(validate_range(0, 4, 0, 5 * 1024 * 1024 * 1024).unwrap(), 4);
    assert_eq!(validate_range(0, 4, 4, 8).unwrap(), 4);
    for (offset, length, written, size) in [
        (5, 1, 4, 8),
        (3, 2, 4, 8),
        (8, 1, 8, 8),
        (u64::MAX, 2, u64::MAX, u64::MAX),
    ] {
        assert!(validate_range(offset, length, written, size).is_err());
    }
}

#[test]
fn numbered_names_preserve_extensions_and_hidden_files() {
    use crate::upload_destination::numbered_path;
    assert_eq!(numbered_path("/home/report.txt", 2), "/home/report (2).txt");
    assert_eq!(numbered_path("/.env", 1), "/.env (1)");
    assert_eq!(numbered_path("/name", 1), "/name (1)");
    assert_eq!(numbered_path("/中文.tar.gz", 3), "/中文.tar (3).gz");
}

#[test]
fn rejects_invalid_endpoints_sizes_and_paths() {
    for host in ["", "host\nname", "user@host", "host/path"] {
        assert!(Endpoint {
            host: host.into(),
            port: 22
        }
        .validate()
        .is_err());
    }
    assert!(Endpoint {
        host: "::1".into(),
        port: 22
    }
    .validate()
    .is_ok());
    assert!(Endpoint {
        host: "localhost".into(),
        port: 0
    }
    .validate()
    .is_err());
    for (cols, rows) in [(0, 24), (80, 0), (501, 24)] {
        assert!(Size { cols, rows }.validate().is_err());
    }
    for path in ["", "/tmp/a\0b", "/tmp/a\nb"] {
        assert!(crate::files::validate_path(path).is_err());
    }
    assert!(crate::files::validate_path("/home/用户/my file.txt").is_ok());
}

#[tokio::test]
async fn closed_sessions_reject_input_and_files_but_close_is_idempotent() {
    let client = Client::default();
    assert!(client
        .command(Command::Close {
            id: "ssh-missing".into()
        })
        .await
        .is_ok());
    assert!(matches!(
        client
            .command(Command::Write {
                id: "ssh-missing".into(),
                data: "x".into()
            })
            .await,
        Err(Error::Closed)
    ));
    assert!(matches!(
        client
            .files("ssh-missing", FileAction::List { path: ".".into() })
            .await,
        Err(Error::Closed)
    ));
}
