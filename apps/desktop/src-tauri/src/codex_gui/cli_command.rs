//! GUI engines must reach their private loopback services even with a global HTTP proxy.
use std::{ffi::OsString, path::Path};
use tokio::process::Command;

const LOOPBACK_BYPASS: &str = "localhost,127.0.0.1,::1";

/// Preserve external proxy settings and extend bypass rules only in the child environment.
pub(super) fn new(executable: &Path) -> Command {
    let bypass = merged_bypass([std::env::var_os("NO_PROXY"), std::env::var_os("no_proxy")]);
    let mut command = Command::new(executable);
    // Unix clients differ on casing; Windows treats these names as the same variable.
    command.env("NO_PROXY", &bypass).env("no_proxy", bypass);
    command
}

fn merged_bypass(values: [Option<OsString>; 2]) -> OsString {
    let mut rules = Vec::new();
    for value in values.into_iter().flatten() {
        if !value.is_empty() && !rules.contains(&value) {
            rules.push(value);
        }
    }
    // Keep native environment values intact, including non-Unicode entries on Unix.
    rules.push(OsString::from(LOOPBACK_BYPASS));
    rules.join(std::ffi::OsStr::new(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_and_empty_bypass_still_protect_loopback() {
        for values in [[None, None], [Some(OsString::new()), Some(OsString::new())]] {
            assert_eq!(merged_bypass(values), LOOPBACK_BYPASS);
        }
    }

    #[test]
    fn preserves_both_casings_and_existing_rule_formats() {
        assert_eq!(
            merged_bypass([
                Some(".internal.example,10.0.0.0/8, host:8080 ".into()),
                Some("[2001:db8::1],other.example".into()),
            ]),
            ".internal.example,10.0.0.0/8, host:8080 ,[2001:db8::1],other.example,localhost,127.0.0.1,::1"
        );
    }

    #[test]
    fn windows_aliases_are_not_duplicated_and_wildcard_is_preserved() {
        assert_eq!(
            merged_bypass([Some("*".into()), Some("*".into())]),
            "*,localhost,127.0.0.1,::1"
        );
    }

    #[cfg(unix)]
    #[test]
    fn preserves_non_unicode_environment_entries() {
        use std::os::unix::ffi::{OsStrExt, OsStringExt};
        let value = OsString::from_vec(b"internal-\xff".to_vec());
        let merged = merged_bypass([Some(value), None]);
        assert_eq!(merged.as_bytes(), b"internal-\xff,localhost,127.0.0.1,::1");
    }
}

#[cfg(test)]
mod cli_tests;
