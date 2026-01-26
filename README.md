# install
```bash
bun install
bun run cli
```

`spall` uses small (less than a billion parameter) LLMs for embedding and reranking. These models have to be loaded into memory, which takes a few seconds.

By default, `spall` spins up a server every time it runs, so that when e.g. Claude rips four queries in parallel, you don't out-of-memory trying to load the LLMs four times. This server persists for 30 seconds from the last request it receives, so that burts of usage are extremely fast but we're polite with your VRAM.

If you'd like everything to be instant all the time, you can run the `spall` server as a persistent daemon (in a spare terminal panel, or as a systemd unit, or however you prefer):
```bash
spall serve --daemon --force
```
