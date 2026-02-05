# Zsh completion for spall
#
# Source this file or add to ~/.zshrc:
#   source /path/to/spall.zsh

# Requires the completion system to be loaded.
# Add 'autoload -Uz compinit && compinit' to your .zshrc before sourcing this file.
if ! type compdef &>/dev/null; then
  echo "spall: completion requires compinit (add 'autoload -Uz compinit && compinit' to your .zshrc)" >&2
  return
fi

_spall() {
  local -a subcmds=(
    'add:Add a note to a corpus'
    'get:Get note(s) by path or glob'
    'list:List note paths as a tree'
    'search:Search note content'
    'vsearch:Semantic search'
    'sync:Sync a dir tree to a corpus'
    'commit:Update note weights from queries'
    'serve:Start the spall server'
    'corpus:Manage corpora'
    'workspace:Manage the current workspace'
    'tui:Launch the interactive TUI'
    'review:Manage reviews'
  )

  # Complete subcommands at position 1
  if (( CURRENT == 2 )); then
    _describe 'command' subcmds
    return
  fi

  local cmd="${words[2]}"

  case "$cmd" in
    list|get)
      # Skip options
      if [[ "$PREFIX" == -* ]]; then
        return
      fi

      local -a completions
      completions=("${(@f)$(spall list "$PREFIX" --completion 2>/dev/null)}")

      # Filter out empty entries
      completions=("${(@)completions:#}")

      if (( ${#completions} == 0 )); then
        return
      fi

      # Separate dirs and files so dirs don't get a trailing space
      local -a dirs files
      for c in "${completions[@]}"; do
        if [[ "$c" == */ ]]; then
          dirs+=("$c")
        else
          files+=("$c")
        fi
      done

      if (( ${#files} )); then
        compadd -Q -- "${files[@]}"
      fi
      if (( ${#dirs} )); then
        compadd -Q -S '' -- "${dirs[@]}"
      fi
      ;;
    sync)
      # Complete filesystem directories for `spall sync <dir>`
      _files -/
      ;;
  esac
}

compdef _spall spall
