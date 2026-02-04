---
name: spall
description: Spall is an LLM's persistent memory. Use when saving notes, finding design documents, doing code review, or storing or retrieving any persistent knowledge about the codebase.
allowed-tools:
  - Bash(spallm:*)
  - Read
---

Spall is a searchable, fast, self-updating, persistent memory for LLMs. It works via CLI, `spallm`, and should be used for any knowledge storage or retrieval which is not ephemeral.

## Commands
- `spallm --help`
- `spallm add $path -t "content"`
- `spallm get $path_glob`
- `spallm search "keyword" -n $max_results`
- `spallm vsearch "natural language query" -n $max_results`

# Rules
- Always run searches in parallel when you have more than one

# Workflows
-

- use it whenever you would do an exploratory search over the codebase
- use it in addition to grep, not as a replacement

# Code Review
- `spallm review comments`

All output is JSON.
