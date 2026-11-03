# Match SSH's login startup order, then install hooks after user configuration.
if [ -r /etc/profile ]; then . /etc/profile; fi
if [ -r "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
elif [ -r "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
elif [ -r "$HOME/.profile" ]; then . "$HOME/.profile"
elif [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"
fi

__remoteai_directory_prompt() {
  local result=$? path=${PWD//%/%25}
  printf '\033]133;A\007\033]7;file://localhost%s\007' "$path"
  case "$PS1" in
    *'\[\e]133;B\a\]'*) ;;
    *) PS1="$PS1"'\[\e]133;B\a\]' ;;
  esac
  return "$result"
}
if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a'* ]]; then
  PROMPT_COMMAND+=(__remoteai_directory_prompt)
else
  PROMPT_COMMAND="${PROMPT_COMMAND-}"$'\n''__remoteai_directory_prompt'
fi
# PS0 is expanded after a complete command is read, before that command starts.
PS0=$'\e]133;C\a'"${PS0-}"
exec 3<&-
