/**
 * NeuroLink Wrapper
 * 
 * This module provides an abstraction layer over @juspay/neurolink,
 * allowing the rest of the codebase to use NeuroLink's multi-provider
 * capabilities without tight coupling to its API.
 * 
 * Benefits:
 * - 12+ providers supported (OpenAI, Anthropic, Google, AWS Bedrock, Azure, etc.)
 * - Built-in failover and cost optimization
 * - Reduced code complexity
 * - Enterprise features (Redis memory, telemetry, guardrails)
 */

import { log, logStructured } from "../logger.js";

// NeuroLink types (we define our own interface to avoid coupling)
export interface NeuroLinkConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  fallbackProvider?: string;
  enableAnalytics?: boolean;
  enableEvaluation?: boolean;
}

export interface NeuroLinkMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface NeuroLinkRequest {
  input: {
    text: string;
  };
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: Record<string, any>;
  timeout?: number | string;
  disableTools?: boolean;
  enableAnalytics?: boolean;
  conversationHistory?: NeuroLinkMessage[];
}

export interface NeuroLinkResult {
  content: string;
  provider?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  responseTime?: number;
  toolCalls?: any[];
  toolResults?: any[];
}

export interface NeuroLinkStreamResult {
  stream: AsyncIterable<{ content: string }>;
  provider?: string;
  model?: string;
}

/**
 * NeuroLink Wrapper class
 * 
 * Provides a simplified, stable interface to NeuroLink's capabilities.
 * This abstraction ensures that changes to NeuroLink's API don't require
 * widespread changes throughout the codebase.
 */
export class NeuroLinkWrapper {
  private neurolink: any;
  private config: NeuroLinkConfig;
  private initialized: boolean = false;

  constructor(config: NeuroLinkConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize the NeuroLink instance
   * Lazy initialization to avoid import-time side effects
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to handle ESM/CJS compatibility
      const neurolink = await import("@juspay/neurolink");
      
      // Create NeuroLink instance with configuration
      this.neurolink = new neurolink.NeuroLink({
        conversationMemory: {
          enabled: false, // We manage memory ourselves
        },
        enableOrchestration: true, // Enable multi-provider orchestration
      });

      this.initialized = true;
      logStructured("NeuroLink initialized", {
        provider: this.config.provider || "auto",
        model: this.config.model || "auto",
      });
    } catch (error) {
      log(`[NeuroLink] Failed to initialize: ${error}`);
      throw error;
    }
  }

  /**
   * Get the appropriate provider for a given model ID
   * Maps claudish model format to NeuroLink provider
   */
  private mapModelToProvider(modelId: string): { provider: string; model: string } {
    // Handle provider/model format (e.g., "openai/gpt-4", "google/gemini-2.5-flash")
    if (modelId.includes("/")) {
      const [provider, ...modelParts] = modelId.split("/");
      const model = modelParts.join("/");
      
      // Map common provider names to NeuroLink's expected names
      const providerMap: Record<string, string> = {
        "openai": "openai",
        "anthropic": "anthropic",
        "google": "google-ai",
        "google-ai": "google-ai",
        "vertex": "vertex",
        "bedrock": "bedrock",
        "azure": "azure",
        "mistral": "mistral",
        "ollama": "ollama",
        "huggingface": "huggingface",
        "x-ai": "litellm", // Route via LiteLLM for Grok
        "meta-llama": "litellm",
        "deepseek": "litellm",
        "qwen": "litellm",
        "minimax": "litellm",
      };

      return {
        provider: providerMap[provider.toLowerCase()] || "litellm",
        model: modelId, // Keep full model ID for LiteLLM routing
      };
    }

    // Handle model-only format (e.g., "gpt-4", "claude-3-sonnet")
    if (modelId.includes("gpt") || modelId.includes("o1") || modelId.includes("o3")) {
      return { provider: "openai", model: modelId };
    }
    if (modelId.includes("claude")) {
      return { provider: "anthropic", model: modelId };
    }
    if (modelId.includes("gemini")) {
      return { provider: "google-ai", model: modelId };
    }
    if (modelId.includes("mistral")) {
      return { provider: "mistral", model: modelId };
    }

    // Default to LiteLLM for unknown models (it can route to many providers)
    return { provider: "litellm", model: modelId };
  }

  /**
   * Generate a response using NeuroLink
   */
  async generate(request: NeuroLinkRequest): Promise<NeuroLinkResult> {
    await this.initialize();

    const { provider, model } = request.provider && request.model
      ? { provider: request.provider, model: request.model }
      : this.mapModelToProvider(this.config.model || "openai/gpt-4o");

    logStructured("NeuroLink generate", {
      provider,
      model,
      hasTools: !!request.tools,
      hasHistory: !!request.conversationHistory?.length,
    });

    try {
      const result = await this.neurolink.generate({
        input: request.input,
        provider,
        model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        systemPrompt: request.systemPrompt,
        tools: request.tools,
        timeout: request.timeout,
        disableTools: request.disableTools,
        enableAnalytics: request.enableAnalytics ?? this.config.enableAnalytics,
        conversationHistory: request.conversationHistory,
      });

      return {
        content: result.content,
        provider: result.provider,
        model: result.model,
        usage: result.usage ? {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        } : undefined,
        responseTime: result.responseTime,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
      };
    } catch (error) {
      log(`[NeuroLink] Generation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Stream a response using NeuroLink
   */
  async stream(request: NeuroLinkRequest): Promise<NeuroLinkStreamResult> {
    await this.initialize();

    const { provider, model } = request.provider && request.model
      ? { provider: request.provider, model: request.model }
      : this.mapModelToProvider(this.config.model || "openai/gpt-4o");

    logStructured("NeuroLink stream", {
      provider,
      model,
    });

    try {
      const result = await this.neurolink.stream({
        input: request.input,
        provider,
        model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        timeout: request.timeout,
      });

      return {
        stream: result.stream,
        provider: result.provider,
        model: result.model,
      };
    } catch (error) {
      log(`[NeuroLink] Streaming failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get available providers from NeuroLink
   */
  async getAvailableProviders(): Promise<string[]> {
    await this.initialize();
    
    // NeuroLink supports these providers
    return [
      "openai",
      "anthropic",
      "google-ai",
      "vertex",
      "bedrock",
      "azure",
      "mistral",
      "ollama",
      "huggingface",
      "litellm",
    ];
  }

  /**
   * Check if a specific provider is available (has API key configured)
   */
  isProviderAvailable(provider: string): boolean {
    const envVarMap: Record<string, string> = {
      "openai": "OPENAI_API_KEY",
      "anthropic": "ANTHROPIC_API_KEY",
      "google-ai": "GOOGLE_AI_API_KEY",
      "vertex": "GOOGLE_APPLICATION_CREDENTIALS",
      "bedrock": "AWS_ACCESS_KEY_ID",
      "azure": "AZURE_OPENAI_API_KEY",
      "mistral": "MISTRAL_API_KEY",
      "ollama": "OLLAMA_BASE_URL",
      "huggingface": "HUGGINGFACE_API_KEY",
      "litellm": "LITELLM_API_KEY",
    };

    const envVar = envVarMap[provider];
    if (!envVar) return false;

    // Special case: Ollama doesn't need a key, just a running server
    if (provider === "ollama") {
      return true; // Assume available if explicitly requested
    }

    return !!process.env[envVar];
  }
}

// Singleton instance for global access
let globalWrapper: NeuroLinkWrapper | null = null;

/**
 * Get the global NeuroLink wrapper instance
 */
export function getNeuroLinkWrapper(config?: NeuroLinkConfig): NeuroLinkWrapper {
  if (!globalWrapper) {
    globalWrapper = new NeuroLinkWrapper(config);
  }
  return globalWrapper;
}

/**
 * Create a new NeuroLink wrapper with custom configuration
 */
export function createNeuroLinkWrapper(config: NeuroLinkConfig): NeuroLinkWrapper {
  return new NeuroLinkWrapper(config);
}
