/**
 * Base Provider Implementation
 * 
 * Provides common functionality for LLM API providers.
 * Concrete providers can extend this class and override methods as needed.
 */

import type {
  Provider,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderModelInfo,
} from "./types.js";

export abstract class BaseProvider implements Provider {
  abstract readonly config: ProviderConfig;

  /**
   * Check if this provider can handle the given model ID
   * Default implementation checks if the model ID starts with the provider ID prefix
   * Override for custom logic
   */
  canHandleModel(modelId: string): boolean {
    // By default, check if model starts with provider ID prefix
    // e.g., "openai/gpt-4" matches provider with id "openai"
    const prefix = this.config.id + "/";
    return modelId.startsWith(prefix) || modelId === this.config.id;
  }

  /**
   * Get the full URL for chat completions
   */
  getCompletionsUrl(): string {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const path = this.config.completionsPath.replace(/^\//, "");
    return `${baseUrl}/${path}`;
  }

  /**
   * Get the URL for listing models (if supported)
   */
  getModelsUrl(): string | null {
    if (!this.config.modelsPath) {
      return null;
    }
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const path = this.config.modelsPath.replace(/^\//, "");
    return `${baseUrl}/${path}`;
  }

  /**
   * Get headers for a request, including authentication
   */
  getHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    // Add authentication header if configured and API key provided
    if (apiKey && this.config.auth.type !== "none") {
      const headerName = this.config.auth.headerName || "Authorization";
      const prefix = this.config.auth.prefix || "";
      headers[headerName] = `${prefix}${apiKey}`;
    }

    return headers;
  }

  /**
   * Prepare the request payload for this provider
   * Default implementation returns the request as-is
   * Override for provider-specific transformations
   */
  prepareRequest(request: ProviderRequest): any {
    return { ...request };
  }

  /**
   * Parse a streaming chunk from this provider
   * Default implementation handles standard OpenAI SSE format
   */
  parseStreamChunk(chunk: string): ProviderResponse | null {
    if (chunk === "[DONE]") {
      return null;
    }

    try {
      return JSON.parse(chunk) as ProviderResponse;
    } catch {
      return null;
    }
  }

  /**
   * Fetch available models from this provider
   * Default implementation uses the models endpoint if configured
   */
  async fetchModels(apiKey?: string): Promise<ProviderModelInfo[]> {
    const modelsUrl = this.getModelsUrl();
    if (!modelsUrl) {
      return [];
    }

    try {
      const response = await fetch(modelsUrl, {
        headers: this.getHeaders(apiKey),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle standard OpenAI format where models are in data array
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => this.parseModelInfo(model));
      }

      // Handle array format
      if (Array.isArray(data)) {
        return data.map((model: any) => this.parseModelInfo(model));
      }

      return [];
    } catch (error) {
      console.error(`[${this.config.name}] Failed to fetch models:`, error);
      return [];
    }
  }

  /**
   * Parse raw model info from the API into our standard format
   * Override for provider-specific model info structure
   */
  protected parseModelInfo(rawModel: any): ProviderModelInfo {
    return {
      id: rawModel.id,
      name: rawModel.name || rawModel.id,
      description: rawModel.description,
      context_length: rawModel.context_length || rawModel.context_window,
      pricing: rawModel.pricing,
      supported_parameters: rawModel.supported_parameters,
    };
  }
}
