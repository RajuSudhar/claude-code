/**
 * Ollama Provider Implementation (Example)
 * 
 * Ollama is a local LLM runner that provides an OpenAI-compatible API.
 * This provider demonstrates how to add support for local/self-hosted LLMs.
 * 
 * @see https://ollama.ai/
 * 
 * Usage:
 *   1. Install Ollama: https://ollama.ai/download
 *   2. Pull a model: ollama pull llama2
 *   3. Start Ollama: ollama serve
 *   4. Use with claudish: claudish --model ollama/llama2 "your prompt"
 * 
 * Note: This is an example/skeleton provider. Customize as needed for your setup.
 */

import { BaseProvider } from "./base-provider.js";
import type {
  ProviderConfig,
  ProviderRequest,
  ProviderModelInfo,
} from "./types.js";

export class OllamaProvider extends BaseProvider {
  private readonly validatedBaseUrl: string;

  constructor() {
    super();
    // Validate and sanitize the base URL from environment
    const envUrl = process.env.OLLAMA_BASE_URL;
    this.validatedBaseUrl = this.validateBaseUrl(envUrl);
  }

  /**
   * Validate and sanitize the base URL to prevent URL injection
   */
  private validateBaseUrl(url: string | undefined): string {
    const defaultUrl = "http://localhost:11434";
    
    if (!url) {
      return defaultUrl;
    }

    try {
      const parsed = new URL(url);
      // Only allow http and https protocols
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        console.warn(`[Ollama] Invalid protocol in OLLAMA_BASE_URL: ${parsed.protocol}, using default`);
        return defaultUrl;
      }
      // Return the validated URL (normalized)
      return parsed.origin;
    } catch {
      console.warn(`[Ollama] Invalid OLLAMA_BASE_URL: ${url}, using default`);
      return defaultUrl;
    }
  }

  get config(): ProviderConfig {
    return {
      id: "ollama",
      name: "Ollama",
      baseUrl: this.validatedBaseUrl,
      completionsPath: "/v1/chat/completions",
      modelsPath: "/api/tags",
      auth: {
        type: "none", // Ollama typically doesn't require authentication
      },
      headers: {},
      supportsStreaming: true,
      supportsTools: true, // Newer Ollama versions support function calling
      defaultModel: "llama2",
    };
  }

  /**
   * Check if this is an Ollama model
   * Ollama models are prefixed with "ollama/" or are local model names
   */
  override canHandleModel(modelId: string): boolean {
    // Explicit ollama prefix
    if (modelId.startsWith("ollama/")) {
      return true;
    }
    
    // Check for common Ollama model patterns (local models without provider prefix)
    const ollamaModelPatterns = [
      "llama",
      "mistral",
      "codellama",
      "phi",
      "gemma",
      "qwen",
      "deepseek-coder",
    ];
    
    const lowerModelId = modelId.toLowerCase();
    return ollamaModelPatterns.some((pattern) => lowerModelId.includes(pattern));
  }

  /**
   * Prepare request for Ollama
   * Ollama's API is OpenAI-compatible but may have some differences
   */
  override prepareRequest(request: ProviderRequest): any {
    const payload: any = { ...request };

    // Remove the "ollama/" prefix if present
    if (payload.model.startsWith("ollama/")) {
      payload.model = payload.model.replace("ollama/", "");
    }

    // Ollama-specific options can be added here
    // For example, you might want to add options like:
    // payload.options = {
    //   num_ctx: 4096,
    //   temperature: request.temperature || 0.7,
    // };

    return payload;
  }

  /**
   * Parse Ollama model info from /api/tags response
   */
  protected override parseModelInfo(rawModel: any): ProviderModelInfo {
    // Ollama's /api/tags returns models in a different format
    return {
      id: `ollama/${rawModel.name}`,
      name: rawModel.name,
      description: `Ollama model: ${rawModel.name}`,
      // Ollama doesn't provide context length in the API, use reasonable defaults
      context_length: 4096,
    };
  }

  /**
   * Fetch models from local Ollama instance
   */
  override async fetchModels(apiKey?: string): Promise<ProviderModelInfo[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      
      // Ollama returns { models: [...] }
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((model: any) => this.parseModelInfo(model));
      }

      return [];
    } catch (error) {
      // Ollama might not be running - this is expected for users who don't use it
      console.debug(`[${this.config.name}] Could not connect to Ollama:`, error);
      return [];
    }
  }
}
