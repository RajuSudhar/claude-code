/**
 * Provider Abstraction Tests
 * 
 * Tests for the generic provider system that enables multi-provider support.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
  ProviderRegistry,
  getProviderRegistry,
  registerProvider,
  BaseProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "../src/providers/index.js";
import type { ProviderConfig, ProviderRequest, Provider } from "../src/providers/types.js";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  test("should register default OpenRouter provider", () => {
    expect(registry.has("openrouter")).toBe(true);
    expect(registry.count).toBeGreaterThanOrEqual(1);
  });

  test("should get default provider", () => {
    const defaultProvider = registry.getDefault();
    expect(defaultProvider).toBeDefined();
    expect(defaultProvider.config.id).toBe("openrouter");
  });

  test("should get provider by ID", () => {
    const provider = registry.get("openrouter");
    expect(provider).toBeDefined();
    expect(provider?.config.name).toBe("OpenRouter");
  });

  test("should return undefined for unknown provider ID", () => {
    const provider = registry.get("unknown-provider");
    expect(provider).toBeUndefined();
  });

  test("should list all registered providers", () => {
    const providers = registry.list();
    expect(providers.length).toBeGreaterThanOrEqual(1);
    expect(providers.some((p) => p.id === "openrouter")).toBe(true);
  });

  test("should register custom provider", () => {
    class CustomProvider extends BaseProvider {
      readonly config: ProviderConfig = {
        id: "custom-test",
        name: "Custom Test Provider",
        baseUrl: "https://api.custom.test",
        completionsPath: "/v1/completions",
        auth: { type: "bearer", headerName: "Authorization", prefix: "Bearer " },
        supportsStreaming: true,
        supportsTools: false,
      };
    }

    const customProvider = new CustomProvider();
    registry.register(customProvider);

    expect(registry.has("custom-test")).toBe(true);
    expect(registry.get("custom-test")?.config.name).toBe("Custom Test Provider");
  });

  test("should unregister provider", () => {
    class TempProvider extends BaseProvider {
      readonly config: ProviderConfig = {
        id: "temp-provider",
        name: "Temp Provider",
        baseUrl: "https://temp.test",
        completionsPath: "/completions",
        auth: { type: "none" },
        supportsStreaming: false,
        supportsTools: false,
      };
    }

    registry.register(new TempProvider());
    expect(registry.has("temp-provider")).toBe(true);

    registry.unregister("temp-provider");
    expect(registry.has("temp-provider")).toBe(false);
  });

  test("should set default provider", () => {
    class AnotherProvider extends BaseProvider {
      readonly config: ProviderConfig = {
        id: "another-provider",
        name: "Another Provider",
        baseUrl: "https://another.test",
        completionsPath: "/chat",
        auth: { type: "api-key", headerName: "X-API-Key" },
        supportsStreaming: true,
        supportsTools: true,
      };
    }

    registry.register(new AnotherProvider());
    registry.setDefault("another-provider");

    expect(registry.getDefault().config.id).toBe("another-provider");
  });

  test("should throw when setting unknown default provider", () => {
    expect(() => registry.setDefault("unknown")).toThrow();
  });

  test("should get provider for OpenRouter model", () => {
    const provider = registry.getForModel("openai/gpt-4");
    expect(provider.config.id).toBe("openrouter");
  });

  test("should get provider for model with slash (OpenRouter format)", () => {
    const provider = registry.getForModel("google/gemini-2.5-flash");
    expect(provider.config.id).toBe("openrouter");
  });
});

describe("OpenRouterProvider", () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider();
  });

  test("should have correct configuration", () => {
    expect(provider.config.id).toBe("openrouter");
    expect(provider.config.name).toBe("OpenRouter");
    expect(provider.config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(provider.config.supportsStreaming).toBe(true);
    expect(provider.config.supportsTools).toBe(true);
  });

  test("should generate correct completions URL", () => {
    expect(provider.getCompletionsUrl()).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });

  test("should generate correct models URL", () => {
    expect(provider.getModelsUrl()).toBe("https://openrouter.ai/api/v1/models");
  });

  test("should handle models with slash prefix", () => {
    expect(provider.canHandleModel("openai/gpt-4")).toBe(true);
    expect(provider.canHandleModel("google/gemini-pro")).toBe(true);
    expect(provider.canHandleModel("x-ai/grok-code-fast-1")).toBe(true);
  });

  test("should handle openrouter prefixed models", () => {
    expect(provider.canHandleModel("openrouter/polaris-alpha")).toBe(true);
  });

  test("should generate correct headers with API key", () => {
    const headers = provider.getHeaders("test-api-key");
    expect(headers["Authorization"]).toBe("Bearer test-api-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["HTTP-Referer"]).toBeDefined();
    expect(headers["X-Title"]).toBeDefined();
  });

  test("should prepare request with stream_options", () => {
    const request: ProviderRequest = {
      model: "openai/gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    const prepared = provider.prepareRequest(request);
    expect(prepared.stream_options).toBeDefined();
    expect(prepared.stream_options.include_usage).toBe(true);
  });

  test("should parse stream chunk correctly", () => {
    const chunk = JSON.stringify({
      id: "test-id",
      object: "chat.completion.chunk",
      choices: [{ delta: { content: "Hello" }, index: 0, finish_reason: null }],
    });

    const parsed = provider.parseStreamChunk(chunk);
    expect(parsed).toBeDefined();
    expect(parsed?.choices[0].delta?.content).toBe("Hello");
  });

  test("should return null for [DONE] chunk", () => {
    const parsed = provider.parseStreamChunk("[DONE]");
    expect(parsed).toBeNull();
  });
});

describe("OllamaProvider", () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
  });

  test("should have correct configuration", () => {
    expect(provider.config.id).toBe("ollama");
    expect(provider.config.name).toBe("Ollama");
    expect(provider.config.auth.type).toBe("none");
    expect(provider.config.supportsStreaming).toBe(true);
  });

  test("should generate correct completions URL", () => {
    expect(provider.getCompletionsUrl()).toContain("/v1/chat/completions");
  });

  test("should handle ollama-prefixed models", () => {
    expect(provider.canHandleModel("ollama/llama2")).toBe(true);
    expect(provider.canHandleModel("ollama/mistral")).toBe(true);
  });

  test("should handle common local model patterns", () => {
    expect(provider.canHandleModel("llama2")).toBe(true);
    expect(provider.canHandleModel("mistral")).toBe(true);
    expect(provider.canHandleModel("codellama")).toBe(true);
  });

  test("should remove ollama/ prefix in prepared request", () => {
    const request: ProviderRequest = {
      model: "ollama/llama2",
      messages: [{ role: "user", content: "Hello" }],
    };

    const prepared = provider.prepareRequest(request);
    expect(prepared.model).toBe("llama2");
  });

  test("should not add authorization header", () => {
    const headers = provider.getHeaders("any-key");
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("BaseProvider", () => {
  class TestProvider extends BaseProvider {
    readonly config: ProviderConfig = {
      id: "test",
      name: "Test Provider",
      baseUrl: "https://api.test.com/",
      completionsPath: "/chat/completions",
      modelsPath: "/models",
      auth: { type: "bearer", headerName: "Authorization", prefix: "Bearer " },
      supportsStreaming: true,
      supportsTools: true,
    };
  }

  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  test("should handle trailing slash in baseUrl", () => {
    expect(provider.getCompletionsUrl()).toBe(
      "https://api.test.com/chat/completions"
    );
  });

  test("should handle leading slash in path", () => {
    expect(provider.getModelsUrl()).toBe("https://api.test.com/models");
  });

  test("should check model handling by prefix", () => {
    expect(provider.canHandleModel("test/model-1")).toBe(true);
    expect(provider.canHandleModel("test")).toBe(true);
    expect(provider.canHandleModel("other/model")).toBe(false);
  });

  test("should handle API key authentication", () => {
    class ApiKeyProvider extends BaseProvider {
      readonly config: ProviderConfig = {
        id: "apikey-test",
        name: "API Key Test",
        baseUrl: "https://api.test.com",
        completionsPath: "/completions",
        auth: { type: "api-key", headerName: "X-API-Key", prefix: "" },
        supportsStreaming: false,
        supportsTools: false,
      };
    }

    const apiKeyProvider = new ApiKeyProvider();
    const headers = apiKeyProvider.getHeaders("my-secret-key");
    expect(headers["X-API-Key"]).toBe("my-secret-key");
  });

  test("should handle no authentication", () => {
    class NoAuthProvider extends BaseProvider {
      readonly config: ProviderConfig = {
        id: "noauth-test",
        name: "No Auth Test",
        baseUrl: "https://api.test.com",
        completionsPath: "/completions",
        auth: { type: "none" },
        supportsStreaming: false,
        supportsTools: false,
      };
    }

    const noAuthProvider = new NoAuthProvider();
    const headers = noAuthProvider.getHeaders("any-key");
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("Global Registry", () => {
  test("should get singleton registry", () => {
    const registry1 = getProviderRegistry();
    const registry2 = getProviderRegistry();
    expect(registry1).toBe(registry2);
  });

  test("should register provider globally", () => {
    class GlobalTestProvider extends BaseProvider {
      readonly config: ProviderConfig = {
        id: "global-test",
        name: "Global Test Provider",
        baseUrl: "https://global.test",
        completionsPath: "/completions",
        auth: { type: "none" },
        supportsStreaming: false,
        supportsTools: false,
      };
    }

    registerProvider(new GlobalTestProvider());
    expect(getProviderRegistry().has("global-test")).toBe(true);
  });
});
