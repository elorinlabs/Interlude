//! Prompt hooks report the shell's actual directory without parsing visible prompt text.
use crate::{connection::HostKey, Error, Result};
use russh::{client, Channel, ChannelMsg};
use std::time::Duration;

const PROBE_LIMIT: usize = 8192;
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const SHELL_MARKER: &str = "__REMOTEAI_SHELL__";
/// Persist input dirtiness in replayed output, including when the cursor returns to the prompt column.
pub(crate) const INPUT_MARKER: &[u8] = b"\x1b]633;P;RemoteAiInput=1\x07";

/// Unsupported shells retain their normal login behavior and can still supply OSC 7 themselves.
pub(crate) async fn start(
    session: &client::Handle<HostKey>,
    channel: &Channel<client::Msg>,
) -> Result<()> {
    let shell = detect_shell(session).await;
    match shell.and_then(|shell| launch_command(&shell)) {
        Some(command) => channel.exec(true, command).await,
        None => channel.request_shell(true).await,
    }
    .map_err(|_| Error::Connection)
}

async fn detect_shell(session: &client::Handle<HostKey>) -> Option<String> {
    let mut channel = tokio::time::timeout(PROBE_TIMEOUT, session.channel_open_session())
        .await
        .ok()?
        .ok()?;
    let shell = tokio::time::timeout(PROBE_TIMEOUT, async {
        channel
            .exec(true, "printf '__REMOTEAI_SHELL__%s\\n' \"$SHELL\"")
            .await
            .ok()?;
        read_shell(&mut channel).await
    })
    .await
    .ok()
    .flatten();
    // The probe may already have exited; close is best-effort and owns no user session.
    let _ = channel.close().await;
    shell
}

async fn read_shell(channel: &mut Channel<client::Msg>) -> Option<String> {
    let mut output = Vec::new();
    while let Some(message) = channel.wait().await {
        match message {
            ChannelMsg::Data { data } if output.len() + data.len() <= PROBE_LIMIT => {
                output.extend_from_slice(&data);
                if let Some(shell) = parse_shell(&output) {
                    return Some(shell);
                }
            }
            ChannelMsg::Close | ChannelMsg::Failure | ChannelMsg::Data { .. } => break,
            _ => {}
        }
    }
    None
}

fn parse_shell(output: &[u8]) -> Option<String> {
    std::str::from_utf8(output)
        .ok()?
        .split_inclusive('\n')
        .find_map(|line| {
            let shell = line
                .strip_suffix('\n')?
                .trim_end_matches('\r')
                .strip_prefix(SHELL_MARKER)?;
            (shell.starts_with('/') && !shell.chars().any(char::is_control))
                .then(|| shell.to_owned())
        })
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn launch_command(shell: &str) -> Option<String> {
    let script = match shell.rsplit('/').next()? {
        "bash" => format!(
            "exec {} --rcfile /dev/fd/3 -i 3<<'REMOTEAI_INIT'\n{}\nREMOTEAI_INIT",
            quote(shell),
            include_str!("shell_integration/bash.sh")
        ),
        "zsh" => {
            include_str!("shell_integration/zsh.sh").replace("REMOTEAI_SHELL_PATH", &quote(shell))
        }
        "fish" => format!(
            "exec {} --login --interactive --init-command {}",
            quote(shell),
            quote(include_str!("shell_integration/fish.fish"))
        ),
        _ => return None,
    };
    Some(format!("sh -c {}", quote(&script)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_complete_absolute_shell_reports() {
        assert_eq!(
            parse_shell(b"banner\n__REMOTEAI_SHELL__/bin/bash\n"),
            Some("/bin/bash".into())
        );
        assert_eq!(parse_shell(b"__REMOTEAI_SHELL__bash\n"), None);
        assert_eq!(parse_shell(b"__REMOTEAI_SHELL__/bin/ba\x1bsh\n"), None);
    }

    #[test]
    fn unknown_shells_keep_the_standard_shell_request() {
        assert!(launch_command("/bin/csh").is_none());
        for shell in ["/bin/bash", "/usr/bin/zsh", "/usr/local/bin/fish"] {
            assert!(launch_command(shell).is_some());
        }
    }

    #[test]
    fn shell_paths_cannot_inject_into_the_outer_command() {
        assert_eq!(quote("a'b $(touch bad)"), "'a'\"'\"'b $(touch bad)'");
    }
}
