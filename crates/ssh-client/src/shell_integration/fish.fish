function __remoteai_directory_prompt --on-event fish_prompt
    set -l directory (string replace -a '%' '%25' -- "$PWD")
    printf '\033]133;A\007\033]7;file://localhost%s\007' "$directory"
end
function __remoteai_directory_preexec --on-event fish_preexec
    printf '\033]133;C\007'
end
functions -c fish_prompt __remoteai_original_prompt
function fish_prompt
    __remoteai_original_prompt
    printf '\033]133;B\007'
end
