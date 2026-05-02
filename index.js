import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStablePrompt } from "./src/inject.js";

/* ── self-injection into subagent env ── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundled = process.env.GSD_BUNDLED_EXTENSION_PATHS || "";
if (!bundled.includes(__dirname)) {
  process.env.GSD_BUNDLED_EXTENSION_PATHS = bundled
    ? `${bundled}${path.delimiter}${__dirname}`
    : __dirname;
}

/* ── helpers ── */

function modelName(payload) {
  if (payload && typeof payload.model === "string") {
    return payload.model;
  }
  return "";
}

function isReasoningModel(model) {
  return model.includes("deepseek") || model.includes("K2.6");
}

function injectReasoning(msg) {
  if (msg.role === "user") return msg;
  if ("reasoning_content" in msg) return msg;

  let reasoning = "";
  const content = msg.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "thinking" && block.thinking) {
        reasoning = block.thinking;
        break;
      }
    }
  }

  return { ...msg, reasoning_content: reasoning };
}

function handleReasoningPayload(payload) {
  const messagesKey = "input" in payload ? "input" : "messages" in payload ? "messages" : null;
  if (!messagesKey) return payload;

  const messages = payload[messagesKey];
  if (!Array.isArray(messages)) return payload;

  let modified = false;
  const patched = messages.map(msg => {
    const m = injectReasoning(msg);
    if (m !== msg) modified = true;
    return m;
  });

  if (!modified) return payload;
  return { ...payload, [messagesKey]: patched };
}

/* ── plugin entry ── */

export default function systemPromptPlugin(pi) {
  /* before_agent_start ── strip CODEBASE, inject HINTS */
  pi.on("before_agent_start", (event, ctx) => {
    const sp = event?.systemPrompt;
    if (typeof sp !== "string") return;

    const result = buildStablePrompt(sp);
    if (result.systemPrompt === sp) return;

    if (result.errors.length > 0 && ctx?.ui) {
      ctx.ui.notify(`pruner: HINTS 加载警告 — ${result.errors.join("; ")}`, "warning");
    }

    return { systemPrompt: result.systemPrompt };
  });

  /* before_provider_request ── reasoning_content fix for deepseek/k2.6 */
  pi.on("before_provider_request", (event) => {
    const p = event?.payload;
    if (!p) return undefined;

    const model = modelName(p);
    if (model && isReasoningModel(model)) {
      const handled = handleReasoningPayload(p);
      return handled !== p ? handled : p;
    }

    return p;
  });
}

/* ── named exports ── */
export { loadHintSources, buildHintsBlock } from "./src/inject.js";
