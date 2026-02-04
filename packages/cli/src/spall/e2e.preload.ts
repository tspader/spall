// Preload for CLI e2e tests.
//
// The real embedding/reranker models are large and require network downloads.
// For CLI end-to-end tests we only care about note persistence behavior, so we
// stub the model layer to keep the server fast and deterministic.

import { Model, Store } from "@spall/core";

(Model as any).load = async () => {};
(Store as any).chunk = async () => [];
