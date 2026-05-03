# System Prompt Spec

Version: `5.1.0`.

`README.md` explains how to use the extension. This file defines the prompt, provider payload, and compatibility contract.

## Public surface

| Capability | Names |
|---|---|
| Hooks | `before_agent_start`, `before_provider_request` |
| Commands | none |
| Tools | none |

## Prompt projection contract

System Prompt owns outbound system-prompt projection. It must not rewrite durable session history.

Rules:

- Stable HINTS are injected into the outbound system prompt.
- Generated Codebase Map blocks are pruned from the outbound system prompt.
- User-provided GSD skill preferences and stable guidance are preserved.
- Missing or unreadable HINTS produce warnings rather than fatal errors.
- Secret values are never included in warning text.

## Provider payload contract

The extension may adapt provider request payloads for selected reasoning models.

Rules:

- Adaptation is model-gated.
- Payloads that do not need adaptation are returned unchanged.
- Assistant reasoning content is shaped only for providers that expect it.
- Unknown provider shapes must fail closed by leaving the payload unchanged.

## Hook composition contract

System Prompt shares `before_agent_start` with other extensions.

Rules:

- Operate on the latest system prompt provided by prior hooks.
- Preserve unrelated event fields.
- Return only the projected system prompt when a change is needed.
- Do not remove sibling-extension prompt injections unless they are inside generated Codebase Map content.

## Full-suite compatibility

System Prompt must coexist with the rest of the suite:

- Prompt pruning must preserve Agent Loop state injection.
- Prompt warnings must not be interpreted by Guardian as recoverable failures.
- Provider payload adaptation must not affect Magic Todo context projection.
- Forked sessions and subagents must inherit the extension through bundled-extension self-injection.

## Verification

```bash
npm test
```
