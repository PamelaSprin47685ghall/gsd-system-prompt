import { ensureBundledExtensionPath } from "./src/self-injection.js";
import { buildStablePrompt } from "./src/inject.js";

ensureBundledExtensionPath(import.meta.url);


function modelName(payload) {
  if (payload && typeof payload.model === "string") {
    return payload.model;
  }
  return "";
}

function isReasoningModel(model) {
  return /deepseek-v4/i.test(model) || /kimi-k2\.6/i.test(model) || /^glm-5/i.test(model);
}

function extractThinking(content) {
  if (!Array.isArray(content)) return { reasoning: "", cleaned: content };
  const reasoningParts = [];
  const cleaned = [];
  for (const block of content) {
    if (block?.type === "thinking" && typeof block.thinking === "string") {
      reasoningParts.push(block.thinking);
    } else {
      cleaned.push(block);
    }
  }
  return {
    reasoning: reasoningParts.join("\n\n"),
    cleaned,
  };
}

function injectReasoning(msg) {
  if (msg.role === "user" || msg.role === "tool" || msg.role === "toolResult") return msg;
  if ("reasoning_content" in msg && msg.reasoning_content != null) return msg;

  const { reasoning, cleaned } = extractThinking(msg.content);
  if (!reasoning && cleaned === msg.content) return msg;

  const next = { ...msg };
  if (reasoning) {
    next.reasoning_content = reasoning;
  }
  if (cleaned !== msg.content) {
    next.content = cleaned.length > 0 ? cleaned : "";
  }
  return next;
}

function hasReasoningInMessages(messages) {
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.reasoning_content) return true;
  }
  return false;
}

function patchPayload(p) {
  const messagesKey = "input" in p ? "input" : "messages" in p ? "messages" : null;
  if (!messagesKey) return p;

  const messages = p[messagesKey];
  if (!Array.isArray(messages)) return p;

  let modified = false;
  const patchedMessages = messages.map(msg => {
    const m = injectReasoning(msg);
    if (m !== msg) modified = true;
    return m;
  });

  const hasReasoning = hasReasoningInMessages(patchedMessages);
  if (!modified && !hasReasoning) return p;

  const next = { ...p, [messagesKey]: patchedMessages };

  // DeepSeek v4 and Kimi K2.6 both need `thinking: { type: "enabled" }`.
  // gsd-2 generates `reasoning_effort` for deepseek and `enable_thinking` for kimi;
  // we normalize the request parameter here.
  if (!next.thinking) {
    const isKimi = /kimi-k2\.6/i.test(p.model || "");
    const isGlm = /^glm-5/i.test(p.model || "");
    if (isKimi && hasReasoning) {
      next.thinking = { type: "enabled", keep: "all" };
    } else if (isGlm) {
      next.thinking = { type: "enabled", clear_thinking: false };
    } else {
      next.thinking = { type: "enabled" };
    }
  }

  return next;
}

const registeredPluginApis = new WeakSet();

/* ── plugin entry ── */

export default function systemPromptPlugin(pi) {
  if (registeredPluginApis.has(pi)) return;
  registeredPluginApis.add(pi);

  /* before_agent_start ── strip CODEBASE, inject HINTS */
  pi.on("before_agent_start", (event, ctx) => {
    const sp = event?.systemPrompt;
    if (typeof sp !== "string") return;

    const result = buildStablePrompt(sp, ctx?.cwd);
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
      const handled = patchPayload(p);
      return handled !== p ? handled : p;
    }

    return p;
  });
}

/* ── named exports ── */
export { loadHintSources, buildHintsBlock } from "./src/inject.js";
