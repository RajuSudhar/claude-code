/**
 * Provider System Types
 * 
 * This module defines the interfaces and types for the provider abstraction layer.
 * Providers encapsulate the details of communicating with different LLM APIs
 * (OpenRouter, Ollama, Together.ai, HuggingFace, etc.)
 */

/**
 * Authentication configuration for a provider
 */
export interface ProviderAuth {
  /** Type of authentication */
  type: "bearer" | "api-key" | "none";
  /** Header name for the authentication (e.g., "Authorization", "X-API-Key") */
  headerName?: string;
  /** Prefix for the auth value (e.g., "Bearer " for Bearer tokens) */
  prefix?: string;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Unique identifier for the provider */
  id: string;
  /** Display name for the provider */
  name: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Chat completions endpoint path (relative to baseUrl) */
  completionsPath: string;
  /** Models list endpoint path (optional, for fetching available models) */
  modelsPath?: string;
  /** Authentication configuration */
  auth: ProviderAuth;
  /** Additional headers to include with requests */
  headers?: Record<string, string>;
  /** Whether the provider supports streaming */
  supportsStreaming: boolean;
  /** Whether the provider supports tool/function calling */
  supportsTools: boolean;
  /** Default model to use if none specified */
  defaultModel?: string;
}

/**
 * Request format for providers
 * This is the normalized format that adapters convert to/from
 */
export interface ProviderRequest {
  /** Model identifier */
  model: string;
  /** Messages in OpenAI format */
  messages: ProviderMessage[];
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Top-p sampling parameter */
  top_p?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Tools/functions available */
  tools?: ProviderTool[];
  /** Tool choice configuration */
  tool_choice?: ProviderToolChoice;
  /** Stream options */
  stream_options?: {
    include_usage?: boolean;
  };
  /** Provider-specific additional parameters */
  [key: string]: any;
}

/**
 * Message format for providers (OpenAI-compatible)
 */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ProviderMessageContent[] | null;
  name?: string;
  tool_calls?: ProviderToolCall[];
  tool_call_id?: string;
}

/**
 * Message content for multi-modal messages
 */
export interface ProviderMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

/**
 * Tool definition for function calling
 */
export interface ProviderTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * Tool call from the model
 */
export interface ProviderToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool choice configuration
 */
export type ProviderToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

/**
 * Response format from providers
 */
export interface ProviderResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ProviderChoice[];
  usage?: ProviderUsage;
}

/**
 * Choice in a provider response
 */
export interface ProviderChoice {
  index: number;
  message?: ProviderMessage;
  delta?: Partial<ProviderMessage>;
  finish_reason: string | null;
}

/**
 * Token usage information
 */
export interface ProviderUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Provider interface that all providers must implement
 */
export interface Provider {
  /** Get the provider configuration */
  readonly config: ProviderConfig;

  /**
   * Check if this provider can handle the given model ID
   * @param modelId - The model identifier to check
   * @returns true if this provider can handle the model
   */
  canHandleModel(modelId: string): boolean;

  /**
   * Get the full URL for chat completions
   */
  getCompletionsUrl(): string;

  /**
   * Get the URL for listing models (if supported)
   */
  getModelsUrl(): string | null;

  /**
   * Get headers for a request, including authentication
   * @param apiKey - The API key to use for authentication
   */
  getHeaders(apiKey?: string): Record<string, string>;

  /**
   * Prepare the request payload for this provider
   * Allows providers to add or modify parameters as needed
   * @param request - The normalized request
   * @returns The provider-specific request payload
   */
  prepareRequest(request: ProviderRequest): any;

  /**
   * Parse a streaming chunk from this provider
   * @param chunk - The raw chunk string (after "data: " prefix)
   * @returns The parsed chunk or null if it should be skipped
   */
  parseStreamChunk(chunk: string): ProviderResponse | null;

  /**
   * Fetch available models from this provider
   * @param apiKey - The API key for authentication
   * @returns Array of model information
   */
  fetchModels?(apiKey?: string): Promise<ProviderModelInfo[]>;
}

/**
 * Model information from a provider
 */
export interface ProviderModelInfo {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
  supported_parameters?: string[];
}
