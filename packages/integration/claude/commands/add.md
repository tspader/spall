Add a note to the spall corpus.

Run: `spallm add "$ARGUMENTS" -t "CONTENT"`

If the user provides content inline, use it directly. Otherwise ask what the note should contain.

On error, check if the note already exists (use `--update`) or has duplicate content (use `--dupe`).
