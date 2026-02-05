# motivation
Loose Markdown files and source comments rot, and are hard to search. Context -- designs, decisions, workarounds, usage guides -- are critical for humans and LLMs. `spall` provides fast, searchable corpora which are automatically kept up to date via LLM re-evaluations.

Anything which you, or another developer, may need to reference should be stored in `spall`. Rule of thumb: If you would include a piece of information when prompting a fresh LLM to complete your task, put it in `spall`.

# install
```bash
bun install
bun run link
spall --help
```

I recommend installing shell completions using our interactive CLI, before use
```bash
spall integrate
```

## usage
See which corpora are available, and which are included in searches
```bash
spall corpus list
```

Add an empty corpus
```bash
spall corpus create cloudflare
```

Populate or create a corpus from existing documents, interactively. If you'd like to follow along, clone the [Cloudflare docs](https://github.com/cloudflare/cloudflare-docs/tree/production). I really ought to pick a smaller repository.
```bash
spall sync path/to/cloudflare-docs/src/content/docs/workers
```

Explore the shape of the workspace's corpora, plus any additional relevant ones. Completions work with the corpus.
```bash
spall list
spall list --corpus cloudflare
spall list "workers/*" --corpus cloudflare // Glob paths accepted
spall list "workers/wrangler" --corpus cloudflare --all // Includes document names
```

Fetch full content for relevant documents
```bash
spall get "workers/wrangler/*"
spall get "workers/wrangler/*" -o table
spall get "workers/wrangler/*" -o tree
```

Create a workspace to define which corpora are included in searches by default
```bash
spall workspace init
```

Fast keyword and vector search across all corpora included in the workspace
```bash
spall search "wrangler dev"
spall vsearch "can you use kv binding with wrangler dev"
```

# plugins
`spall` will integrate itself, frictionlessly, into any tool you use. Friction is a bug. `spall integrate` is an interactive CLI which will install `spall` into various tools. We provide native plugins for `bash`, `zsh`, `claude code`, and `opencode`.

## claude code
```bash
claude plugin marketplace add tspader/spall
claude plugin install spall@spall-marketplace
```

# sdk
Anything you can do with the CLI can be done with a native TypeScript SDK or over the HTTP API.

# more
- Documents are organized in a directory structure into a corpus. Each document within a corpus has a unique path
- The core workflow is:
  - Use broad queries (e.g. `list`, `search`, `vsearch`) to find candidate documents
  - Use `fetch` to retrieve specific, full documents
- Queries return a query ID. To `fetch` documents, you must provide your query ID
- Use in addition to `grep`, not as a replacement
- Documents are automatically kept up to date, and age out if not used. It is therefore preferable to be liberal rather than conservative with what is stored in `spall`


# latency
`spall` uses small (less than a billion parameter) LLMs for embedding and reranking. These models have to be loaded into memory, which takes a few seconds.

By default, `spall` spins up a server every time it runs, so that when e.g. Claude rips four queries in parallel, you don't out-of-memory trying to load the LLMs four times. This server persists for 30 seconds from the last request it receives, so that burts of usage are extremely fast but we're polite with your VRAM.

If you'd like everything to be instant all the time, you can run the `spall` server as a persistent daemon (in a spare terminal panel, or as a systemd unit, or however you prefer):
```bash
spall serve --daemon --force
```
