Spall is a fast, local, searchable, self-updating memory for LLMs. It provides a CLI, `spallm`. Use it in place of AGENTS.md, CLAUDE.md, unstructured Markdown documentation, and brittle comments in code. This skill provides a basic guide.

# Motivation
Loose Markdown files and source comments rot, and are hard to search. Context -- designs, decisions, workarounds, usage guides -- are the most important thing for you, the LLM. `spall` provides fast, searchable corpora which are automatically kept up to date.

Anything which you, or another developer, may need to reference should be stored in `spall`. Rule of thumb: If you would include a piece of information when prompting a fresh LLM to complete your task, put it in `spall`.

# Use Cases
- Style guides and formatting instructions
- Build and test instructions
- Manual testing workflows
- Design documentation
- Decisions or tradeoffs made while developing
- Internal documentation

# Overview
- Documents are organized in a directory structure into corpora. Each document within a corpus has a unique path
- The core workflow is:
  - Explore the corpus structure with `list`
  - Use `search` and `vsearch` to find candidate documents
  - Use `fetch` to retrieve specific, full documents
- Queries return a query ID. To `fetch` documents, you must provide your query ID
- Use in addition to `grep`, not as a replacement
- Documents are automatically kept up to date, and age out if not used. It is therefore preferable to be liberal rather than conservative when deciding whether to add documents to a  `spall` corpus

# Workflows
We'll use Cloudflare Workers documentation when we need an example corpus.

## Find Documentation
See which corpora are available, and which are included in searches

```bash
spallm status
```

Explore the shape of the workspace's corpora, plus any additional relevant ones

```bash
spallm list
spallm list --corpus cloudflare
spallm list "workers/wrangler" --corpus cloudflare --all
```

Fetch full content for relevant documents

```bash
spallm fetch -q $query_id --ids $ids
```

Search across all corpora included in the workspace

```bash
spallm search "wrangler dev"
spallm vsearch "can you use kv binding with wrangler dev"
spallm fetch -q 1 --ids 12 19 19 73
```

Search across all corpora included in the workspace

```bash
spallm search "wrangler dev" --corpus cloudflare
spallm vsearch "can you use kv binding with wrangler dev" --corpus cloudflare
spallm fetch -q 8 --ids 5 2 19 70
```

## Figuring Out `spall` Usage
Wherever a shell is available, the `spall` CLI has standard help commands.

```bash
spallm --help
spallm $command --help
```

If a command ever behaves unexpectedly or returns an error without a hint, run the command's help.

# Rules
- Always ensure documents are concise, but complete
- Prefer to run non-serial queries in parallel
- Prefer to follow existing directory structure, but you can make new directories if needed
- Prefer `spall` to `grep` when searching for prose, documentation, context, instructions, etc.
- Prefer `grep` to `spall` when searching for code, exact symbols, complex regexes

## Commands
- `spallm --help`
- `spallm search "keyword" --limit $limit`
- `spallm vsearch "natural language query" --limit $limit`
- `spallm fetch --query_id $qid --ids $ids`
