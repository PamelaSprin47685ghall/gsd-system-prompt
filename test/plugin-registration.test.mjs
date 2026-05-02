import assert from "node:assert/strict";
import { test, describe, mock } from "node:test";
import systemPromptPlugin from "../index.js";

describe("plugin registration", () => {
  test("registers before_agent_start hook", () => {
    const events = [];
    const pi = { on: (name, fn) => events.push({ name, fn }) };
    systemPromptPlugin(pi);
    const found = events.find(e => e.name === "before_agent_start");
    assert.ok(found, "before_agent_start hook not registered");
    assert.equal(typeof found.fn, "function");
  });

  test("registers before_provider_request hook", () => {
    const events = [];
    const pi = { on: (name, fn) => events.push({ name, fn }) };
    systemPromptPlugin(pi);
    const found = events.find(e => e.name === "before_provider_request");
    assert.ok(found, "before_provider_request hook not registered");
    assert.equal(typeof found.fn, "function");
  });

  test("does not register context hook", () => {
    const events = [];
    const pi = { on: (name, fn) => events.push({ name, fn }) };
    systemPromptPlugin(pi);
    const found = events.find(e => e.name === "context");
    assert.ok(found, "context hook should be registered");
    assert.equal(typeof found.fn, "function");
  });
});
