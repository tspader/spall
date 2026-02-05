FROM alpine:3.20

RUN apk add --no-cache curl bash nodejs npm

# Install OpenCode
RUN curl -fsSL https://opencode.ai/install | bash

# Stub spallm so plugin tools can be exercised without a spall server.
RUN install -d /usr/local/bin && \
  printf '%s\n' \
    '#!/usr/bin/env sh' \
    'echo "SPALLM_STUB $@"' \
    > /usr/local/bin/spallm && chmod +x /usr/local/bin/spallm

# Install the plugin as a local file (avoids needing npm publish for tests)
RUN install -d /root/.config/opencode/plugins
COPY index.ts /root/.config/opencode/plugins/spall.ts

RUN printf '%s\n' \
  '{' \
  '  "$schema": "https://opencode.ai/config.json"' \
  '}' \
  > /root/.config/opencode/opencode.json

WORKDIR /work

CMD ["opencode", "--help"]
