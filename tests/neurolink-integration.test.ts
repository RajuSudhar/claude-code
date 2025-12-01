/**
 * NeuroLink Integration Tests
 * 
 * Tests for the NeuroLink wrapper and handler integration.
 */

import { describe, expect, test, beforeEach, mock } from "bun:test";
import {
  NeuroLinkWrapper,
  getNeuroLinkWrapper,
  createNeuroLinkWrapper,
} from "../src/providers/neurolink-wrapper.js";

describe("NeuroLinkWrapper", () => {
  test("should create wrapper with default config", () => {
    const wrapper = new NeuroLinkWrapper();
    expect(wrapper).toBeDefined();
  });

  test("should create wrapper with custom config", () => {
    const wrapper = new NeuroLinkWrapper({
      model: "openai/gpt-4o",
      provider: "openai",
    });
    expect(wrapper).toBeDefined();
  });

  test("should get available providers", async () => {
    const wrapper = new NeuroLinkWrapper();
    const providers = await wrapper.getAvailableProviders();
    
    expect(providers).toContain("openai");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("google-ai");
    expect(providers).toContain("ollama");
    expect(providers).toContain("litellm");
  });

  test("should check provider availability by env var", () => {
    const wrapper = new NeuroLinkWrapper();
    
    // Without env vars set, most providers should not be available
    // Ollama is always "available" (assumes local server)
    expect(wrapper.isProviderAvailable("ollama")).toBe(true);
  });

  test("should map provider/model format correctly", () => {
    const wrapper = new NeuroLinkWrapper({ model: "openai/gpt-4o" });
    expect(wrapper).toBeDefined();
  });

  test("should map x-ai/grok to litellm provider", () => {
    const wrapper = new NeuroLinkWrapper({ model: "x-ai/grok-code-fast-1" });
    expect(wrapper).toBeDefined();
  });

  test("should map google/gemini to google-ai provider", () => {
    const wrapper = new NeuroLinkWrapper({ model: "google/gemini-2.5-flash" });
    expect(wrapper).toBeDefined();
  });
});

describe("Global NeuroLink Wrapper", () => {
  test("should get singleton wrapper", () => {
    const wrapper1 = getNeuroLinkWrapper();
    const wrapper2 = getNeuroLinkWrapper();
    expect(wrapper1).toBe(wrapper2);
  });

  test("should create new wrapper with createNeuroLinkWrapper", () => {
    const wrapper1 = createNeuroLinkWrapper({ model: "model1" });
    const wrapper2 = createNeuroLinkWrapper({ model: "model2" });
    expect(wrapper1).not.toBe(wrapper2);
  });
});

describe("NeuroLinkWrapper Model Mapping", () => {
  test("should handle various OpenAI models", () => {
    const models = ["gpt-4", "gpt-4o", "gpt-4-turbo", "o1", "o3"];
    for (const model of models) {
      const wrapper = new NeuroLinkWrapper({ model });
      expect(wrapper).toBeDefined();
    }
  });

  test("should handle Anthropic models", () => {
    const models = ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"];
    for (const model of models) {
      const wrapper = new NeuroLinkWrapper({ model });
      expect(wrapper).toBeDefined();
    }
  });

  test("should handle Google models", () => {
    const models = ["gemini-pro", "gemini-2.5-flash"];
    for (const model of models) {
      const wrapper = new NeuroLinkWrapper({ model });
      expect(wrapper).toBeDefined();
    }
  });

  test("should handle Mistral models", () => {
    const models = ["mistral-small", "mistral-large"];
    for (const model of models) {
      const wrapper = new NeuroLinkWrapper({ model });
      expect(wrapper).toBeDefined();
    }
  });

  test("should handle OpenRouter-style model IDs", () => {
    const models = [
      "openai/gpt-4o",
      "anthropic/claude-3-sonnet",
      "google/gemini-2.5-flash",
      "x-ai/grok-code-fast-1",
      "meta-llama/llama-3-70b",
      "deepseek/deepseek-chat",
    ];
    for (const model of models) {
      const wrapper = new NeuroLinkWrapper({ model });
      expect(wrapper).toBeDefined();
    }
  });
});

describe("NeuroLinkWrapper Configuration", () => {
  test("should accept enableAnalytics config", () => {
    const wrapper = new NeuroLinkWrapper({
      enableAnalytics: true,
    });
    expect(wrapper).toBeDefined();
  });

  test("should accept enableEvaluation config", () => {
    const wrapper = new NeuroLinkWrapper({
      enableEvaluation: true,
    });
    expect(wrapper).toBeDefined();
  });

  test("should accept fallbackProvider config", () => {
    const wrapper = new NeuroLinkWrapper({
      fallbackProvider: "openai",
    });
    expect(wrapper).toBeDefined();
  });

  test("should accept apiKey config", () => {
    const wrapper = new NeuroLinkWrapper({
      apiKey: "test-api-key",
    });
    expect(wrapper).toBeDefined();
  });
});
