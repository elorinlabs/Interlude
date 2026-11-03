use super::*;

fn variables(values: &[(&str, &str)]) -> Vec<(OsString, OsString)> {
    values
        .iter()
        .map(|(name, value)| (name.into(), value.into()))
        .collect()
}

#[test]
fn refreshed_nvm_settings_replace_stale_values_and_keep_launcher_environment() {
    let mut command = CommandBuilder::new("powershell.exe");
    let inherited = variables(&[
        ("PATH", r"C:\old-node;C:\Windows;C:\launcher-tools"),
        ("NVM_HOME", r"C:\old-nvm"),
        ("NVM_SYMLINK", r"C:\old-node"),
        ("LAUNCHER_SETTING", "keep me"),
    ]);
    let current = variables(&[
        ("Path", r"C:\Windows;C:\nvm;C:\nodejs"),
        ("NVM_HOME", r"C:\nvm"),
        ("NVM_SYMLINK", r"C:\nodejs"),
    ]);
    apply(&mut command, inherited, current);
    assert_eq!(command.get_env("NVM_HOME"), Some(OsStr::new(r"C:\nvm")));
    assert_eq!(
        command.get_env("NVM_SYMLINK"),
        Some(OsStr::new(r"C:\nodejs"))
    );
    assert_eq!(
        command.get_env("LAUNCHER_SETTING"),
        Some(OsStr::new("keep me"))
    );
    assert_eq!(
        command.get_env("PATH"),
        Some(OsStr::new(
            r"C:\Windows;C:\nvm;C:\nodejs;C:\old-node;C:\launcher-tools"
        ))
    );
}

#[test]
fn every_new_terminal_uses_the_latest_environment_snapshot() {
    let inherited = variables(&[("PATH", r"C:\Windows")]);
    let mut first = CommandBuilder::new("powershell.exe");
    apply(
        &mut first,
        inherited.clone(),
        variables(&[("PATH", r"C:\Windows")]),
    );
    let mut second = CommandBuilder::new("powershell.exe");
    apply(
        &mut second,
        inherited,
        variables(&[
            ("PATH", r"C:\Windows;C:\nodejs"),
            ("NVM_SYMLINK", r"C:\nodejs"),
        ]),
    );
    assert_eq!(first.get_env("PATH"), Some(OsStr::new(r"C:\Windows")));
    assert_eq!(
        second.get_env("PATH"),
        Some(OsStr::new(r"C:\Windows;C:\nodejs"))
    );
    assert_eq!(
        second.get_env("NVM_SYMLINK"),
        Some(OsStr::new(r"C:\nodejs"))
    );
}

#[test]
fn path_merge_preserves_spaces_and_unicode_without_duplicates_or_empty_search_entries() {
    let merged = merge_path(
        OsStr::new(r#"C:\Windows;;"C:\Program Files\nodejs";C:\用户\npm;"#),
        Some(OsStr::new(r"c:\WINDOWS;C:\tools;;")),
    );
    assert_eq!(
        merged,
        OsStr::new(r"C:\Windows;C:\Program Files\nodejs;C:\用户\npm;C:\tools")
    );
    assert_eq!(merge_path(OsStr::new(""), None), OsStr::new(""));
    assert_eq!(
        merge_path(OsStr::new(r#""C:\tools;extra";C:\Windows"#), None),
        OsStr::new(r#""C:\tools;extra";C:\Windows"#)
    );
}

#[test]
fn environment_entries_preserve_empty_values_unicode_and_equals_in_values() {
    for (entry, expected) in [
        (
            "NVM_HOME=C:\\用户\\nvm",
            Some(("NVM_HOME", "C:\\用户\\nvm")),
        ),
        ("EMPTY=", Some(("EMPTY", ""))),
        ("SETTING=a=b", Some(("SETTING", "a=b"))),
        ("=C:=C:\\project", None),
        ("invalid", None),
    ] {
        assert_eq!(
            parse_entry(&entry.encode_utf16().collect::<Vec<_>>()),
            expected.map(|(name, value)| (name.into(), value.into()))
        );
    }
}

#[test]
fn windows_provides_a_fresh_environment_for_the_current_user() {
    let block = EnvironmentBlock::current().expect("Windows environment snapshot");
    let values = block.variables();
    for required in ["SystemRoot", "USERPROFILE", "PATH"] {
        assert!(values
            .iter()
            .any(|(name, value)| name.eq_ignore_ascii_case(required) && !value.is_empty()));
    }
}

#[test]
fn fresh_terminal_recovers_from_a_stale_parent_process_without_restarting_it() {
    const CHILD: &str = "CSW_TERMINAL_STALE_ENV_TEST";
    if std::env::var_os(CHILD).is_none() {
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                concat!(
                    module_path!(),
                    "::fresh_terminal_recovers_from_a_stale_parent_process_without_restarting_it"
                ),
            ])
            .env(CHILD, "1")
            .env("PATH", r"C:\csw-stale-path")
            .env("NVM_HOME", r"C:\csw-stale-nvm")
            .env("NVM_SYMLINK", r"C:\csw-stale-node")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
        return;
    }
    let cwd = std::env::temp_dir().canonicalize().unwrap();
    let (command, _) = super::super::shell(&cwd).unwrap();
    for (name, value) in EnvironmentBlock::current().unwrap().variables() {
        if name.eq_ignore_ascii_case("NVM_HOME") || name.eq_ignore_ascii_case("NVM_SYMLINK") {
            assert_eq!(command.get_env(name), Some(value.as_os_str()));
        }
    }
    let output = std::process::Command::new(&command.get_argv()[0])
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-Command cmd.exe -ErrorAction Stop).Name",
        ])
        .env_clear()
        .envs(command.iter_full_env_as_str())
        .output()
        .unwrap();
    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("cmd.exe"));
    assert_eq!(std::env::var("PATH").unwrap(), r"C:\csw-stale-path");
}
