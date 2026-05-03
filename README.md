# System Prompt

System Prompt stabilizes the prompt and provider payload surfaces used by GSD and pi. It removes generated codebase blocks from the system prompt, injects stable HINTS, and adapts reasoning payload shape for selected providers.

Version: `5.1.0`.

## What it provides

| Capability | Name |
|---|---|
| Hooks | `before_agent_start`, `before_provider_request` |
| Commands | none |
| Tools | none |

## How it works

Before an agent turn starts, the extension rebuilds the system prompt into a more stable form. Stable global and project HINTS are injected, while volatile generated codebase sections are removed so provider prefix caches have a better chance to hit.

Before provider requests, selected reasoning-model payloads are patched so assistant messages include `reasoning_content` when the provider expects it.

## Prompt behavior

- Stable HINTS are kept.
- Generated Codebase Map content is pruned.
- HINTS loading problems are reported as warnings, not fatal errors.
- The original session history is not rewritten; only the outbound prompt projection changes.

## Operational notes

- Subagents inherit the same prompt behavior automatically.
- Provider adaptation is model-gated and returns the original payload when no change is needed.
- Secret values must never be emitted in warnings.

## Maintainer spec

See [`SPEC.md`](./SPEC.md) for prompt projection, provider payload, hook composition, and full-suite compatibility rules.

## Test

```bash
npm test
```
