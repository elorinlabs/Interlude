# Zsh needs startup proxy files so hooks run after the user's normal login setup.
remoteai_dir=$(mktemp -d "${TMPDIR:-/tmp}/remoteai-shell.XXXXXXXX") || exec REMOTEAI_SHELL_PATH -l
REMOTEAI_ORIGINAL_ZDOTDIR=${ZDOTDIR:-$HOME}
REMOTEAI_INTEGRATION_DIR=$remoteai_dir
export REMOTEAI_ORIGINAL_ZDOTDIR REMOTEAI_INTEGRATION_DIR
for remoteai_startup in .zshenv .zprofile .zshrc; do
  printf '%s\n' 'ZDOTDIR=$REMOTEAI_ORIGINAL_ZDOTDIR' \
    "[[ -r \"\$ZDOTDIR/$remoteai_startup\" ]] && source \"\$ZDOTDIR/$remoteai_startup\"" \
    'REMOTEAI_ORIGINAL_ZDOTDIR=${ZDOTDIR:-$HOME}' 'ZDOTDIR=$REMOTEAI_INTEGRATION_DIR' \
    > "$remoteai_dir/$remoteai_startup"
done
cat > "$remoteai_dir/.zlogin" <<'REMOTEAI_LOGIN'
ZDOTDIR=$REMOTEAI_ORIGINAL_ZDOTDIR
[[ -r "$ZDOTDIR/.zlogin" ]] && source "$ZDOTDIR/.zlogin"
__remoteai_directory_prompt() {
  local result=$? directory=${PWD//\%/%25}
  printf '\033]133;A\007\033]7;file://localhost%s\007' "$directory"
  local marker=$'%{\e]133;B\a%}'
  [[ $PROMPT == *$marker* ]] || PROMPT="$PROMPT$marker"
  return $result
}
__remoteai_directory_preexec() { printf '\033]133;C\007'; }
precmd_functions+=(__remoteai_directory_prompt)
preexec_functions+=(__remoteai_directory_preexec)
rm -f -- "$REMOTEAI_INTEGRATION_DIR/.zshenv" "$REMOTEAI_INTEGRATION_DIR/.zprofile" \
  "$REMOTEAI_INTEGRATION_DIR/.zshrc" "$REMOTEAI_INTEGRATION_DIR/.zlogin"
rmdir -- "$REMOTEAI_INTEGRATION_DIR"
unset REMOTEAI_ORIGINAL_ZDOTDIR REMOTEAI_INTEGRATION_DIR
REMOTEAI_LOGIN
ZDOTDIR=$remoteai_dir
export ZDOTDIR
exec REMOTEAI_SHELL_PATH -l
