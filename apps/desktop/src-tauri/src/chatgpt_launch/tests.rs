use super::*;

struct Fixture {
    root: PathBuf,
    settings: PathBuf,
    executable: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("chatgpt-launch-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let executable = root.join("ChatGPT.exe");
        fs::write(&executable, b"fixture, never executed").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        }
        Self {
            settings: root.join("settings.json"),
            root,
            executable,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).unwrap();
    }
}

#[test]
fn manual_path_persists_independently_and_clearing_restores_discovery() {
    let fixture = Fixture::new();
    assert!(configured_executable_from(&fixture.settings)
        .unwrap()
        .is_none());
    let path = fixture.executable.to_str().unwrap();
    assert_eq!(
        save_preference(&fixture.settings, &format!("  \"{path}\"  ")).unwrap(),
        Some(path.into())
    );
    fs::write(&fixture.settings, br#"{"closeToTray":false}"#).unwrap();
    assert_eq!(
        configured_executable_from(&fixture.settings).unwrap(),
        Some(fixture.executable.clone())
    );
    save_preference(&fixture.settings, "  ").unwrap();
    assert!(configured_executable_from(&fixture.settings)
        .unwrap()
        .is_none());
}

#[test]
fn invalid_edit_preserves_the_saved_path() {
    let fixture = Fixture::new();
    save_preference(&fixture.settings, fixture.executable.to_str().unwrap()).unwrap();
    for invalid in ["relative/ChatGPT.exe", fixture.root.to_str().unwrap(), "\0"] {
        assert!(matches!(
            save_preference(&fixture.settings, invalid),
            Err(LaunchPathError::Invalid)
        ));
    }
    assert_eq!(
        configured_executable_from(&fixture.settings).unwrap(),
        Some(fixture.executable.clone())
    );
}

#[test]
fn missing_manual_executable_is_an_error_instead_of_automatic_fallback() {
    let fixture = Fixture::new();
    save_preference(&fixture.settings, fixture.executable.to_str().unwrap()).unwrap();
    fs::remove_file(&fixture.executable).unwrap();
    assert!(matches!(
        configured_executable_from(&fixture.settings),
        Err(LaunchPathError::Invalid)
    ));
    assert!(read_preference(&fixture.settings).unwrap().is_some());
    save_preference(&fixture.settings, "").unwrap();
    assert!(configured_executable_from(&fixture.settings)
        .unwrap()
        .is_none());
}

#[test]
fn corrupt_preference_is_not_treated_as_automatic_mode() {
    let fixture = Fixture::new();
    fs::write(
        fixture.settings.with_file_name(PREFERENCE_FILENAME),
        b"broken",
    )
    .unwrap();
    assert!(matches!(
        configured_executable_from(&fixture.settings),
        Err(LaunchPathError::Load)
    ));
}

#[cfg(target_os = "windows")]
#[test]
fn windows_rejects_non_executable_files() {
    let fixture = Fixture::new();
    let document = fixture.root.join("ChatGPT.txt");
    fs::write(&document, b"not an executable").unwrap();
    assert!(matches!(
        validate_executable(&document),
        Err(LaunchPathError::Invalid)
    ));
}

#[cfg(target_os = "macos")]
#[test]
fn macos_resolves_application_bundles() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new();
    let bundle = fixture.root.join("ChatGPT.app");
    let executable = bundle.join("Contents/MacOS/ChatGPT");
    fs::create_dir_all(executable.parent().unwrap()).unwrap();
    fs::write(&executable, b"fixture").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
    save_preference(&fixture.settings, bundle.to_str().unwrap()).unwrap();
    assert_eq!(
        configured_executable_from(&fixture.settings).unwrap(),
        Some(executable)
    );
}
