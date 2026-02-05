# Bash completion for spall
#
# Source this file or add to ~/.bashrc:
#   source /path/to/spall.bash

_spall_completions() {
  local cur prev words cword
  if type _init_completion &>/dev/null; then
    _init_completion || return
  else
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD - 1]}"
    words=("${COMP_WORDS[@]}")
    cword=$COMP_CWORD
  fi

  local cmd=""
  # Find the subcommand (first non-option arg after "spall")
  for ((i = 1; i < cword; i++)); do
    case "${words[i]}" in
      -*) continue ;;
      *)
        cmd="${words[i]}"
        break
        ;;
    esac
  done

  # Top-level: complete subcommands
  if [[ -z "$cmd" ]]; then
    local subcmds="add get list search vsearch sync commit serve corpus workspace tui review"
    COMPREPLY=($(compgen -W "$subcmds" -- "$cur"))
    return
  fi

  # Commands that take a path positional
  case "$cmd" in
    list|get)
      # Don't complete options
      if [[ "$cur" == -* ]]; then
        return
      fi

      local completions
      completions="$(spall list "$cur" --completion 2>/dev/null)"
      if [[ $? -ne 0 ]]; then
        return
      fi

      # Use mapfile for safe handling of paths with spaces
      local IFS=$'\n'
      COMPREPLY=($(compgen -W "$completions" -- "$cur"))

      # If every completion is a directory (ends with /), don't append a space
      # so the user can keep tabbing deeper.
      if [[ ${#COMPREPLY[@]} -eq 1 && "${COMPREPLY[0]}" == */ ]]; then
        compopt -o nospace
      fi
      ;;
    sync)
      # Complete filesystem directories for `spall sync <dir>`
      if [[ "$cur" == -* ]]; then
        return
      fi

      COMPREPLY=($(compgen -d -- "$cur"))
      # Don't add a space after directories so users can keep tabbing
      compopt -o nospace -o dirnames 2>/dev/null
      ;;
  esac
}

complete -F _spall_completions spall
