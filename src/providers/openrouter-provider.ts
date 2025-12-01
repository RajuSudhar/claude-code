/**
 * OpenRouter Provider Implementation
 * 
 * OpenRouter is a unified API that routes requests to various LLM providers.
 * It supports most OpenAI-compatible models from different providers.
 * 
 * @see https://openrouter.ai/docs
 */

import { BaseProvider } from "./base-provider.js";
import type {
  ProviderConfig,
  ProviderRequest,
  ProviderModelInfo,
} from "./types.js";

export class OpenRouterProvider extends BaseProvider {
  readonly config: ProviderConfig = {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    completionsPath: "/chat/completions",
    modelsPath: "/models",
    auth: {
      type: "bearer",
      headerName: "Authorization",
      prefix: "Bearer ",
    },
    headers: {
      "HTTP-Referer": "https://github.com/MadAppGang/claude-code",
      "X-Title": "Claudish - OpenRouter Proxy",
    },
    supportsStreaming: true,
    supportsTools: true,
  };

  /**
   * OpenRouter handles models from many providers
   * Model IDs are in the format "provider/model-name"
   */
  override canHandleModel(modelId: string): boolean {
    // OpenRouter can handle any model with a provider prefix (contains "/")
    // or models explicitly marked for OpenRouter
    return modelId.includes("/") || modelId.startsWith("openrouter");
  }

  /**
   * Prepare request with OpenRouter-specific options
   */
  override prepareRequest(request: ProviderRequest): any {
    const payload: any = { ...request };

    // Ensure stream_options include usage for streaming requests
    if (request.stream) {
      payload.stream_options = {
        ...request.stream_options,
        include_usage: true,
      };
    }

    return payload;
  }

  /**
   * Parse OpenRouter model info
   * OpenRouter has additional fields like pricing and context_length
   */
  protected override parseModelInfo(rawModel: any): ProviderModelInfo {
    const info: ProviderModelInfo = {
      id: rawModel.id,
      name: rawModel.name || rawModel.id,
      description: rawModel.description,
      context_length: rawModel.context_length || rawModel.top_provider?.context_length,
      supported_parameters: rawModel.supported_parameters,
    };

    // Parse pricing (OpenRouter uses per-token pricing)
    if (rawModel.pricing) {
      info.pricing = {
        prompt: parseFloat(rawModel.pricing.prompt || "0"),
        completion: parseFloat(rawModel.pricing.completion || "0"),
      };
    }

    return info;
  }

  /**
   * Fetch models with caching support
   */
  override async fetchModels(apiKey?: string): Promise<ProviderModelInfo[]> {
    const modelsUrl = this.getModelsUrl();
    if (!modelsUrl) {
      return [];
    }

    try {
      // OpenRouter doesn't require auth for models endpoint
      const response = await fetch(modelsUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => this.parseModelInfo(model));
      }

      return [];
    } catch (error) {
      console.error(`[${this.config.name}] Failed to fetch models:`, error);
      return [];
    }
  }
}
