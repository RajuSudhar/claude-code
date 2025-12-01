/**
 * Provider System Exports
 * 
 * This module provides a generic provider abstraction layer that allows
 * Claudish to work with multiple LLM API providers beyond OpenRouter.
 * 
 * Architecture Overview:
 * - Provider: Interface defining how to communicate with an LLM API
 * - BaseProvider: Abstract class with common provider functionality
 * - ProviderRegistry: Central registry for managing providers
 * - Concrete Providers: Implementations for specific APIs (OpenRouter, Ollama, etc.)
 * 
 * Adding a New Provider:
 * 1. Create a new file: `your-provider.ts`
 * 2. Extend `BaseProvider` and implement required methods
 * 3. Register in the global registry or create custom registry
 * 
 * Example:
 * ```typescript
 * import { BaseProvider, registerProvider } from "./providers";
 * 
 * class MyProvider extends BaseProvider {
 *   readonly config = {
 *     id: "myprovider",
 *     name: "My Provider",
 *     baseUrl: "https://api.myprovider.com",
 *     completionsPath: "/v1/completions",
 *     auth: { type: "bearer", headerName: "Authorization", prefix: "Bearer " },
 *     supportsStreaming: true,
 *     supportsTools: false,
 *   };
 * }
 * 
 * registerProvider(new MyProvider());
 * ```
 */

// Core types
export type {
  Provider,
  ProviderConfig,
  ProviderAuth,
  ProviderRequest,
  ProviderMessage,
  ProviderMessageContent,
  ProviderTool,
  ProviderToolCall,
  ProviderToolChoice,
  ProviderResponse,
  ProviderChoice,
  ProviderUsage,
  ProviderModelInfo,
} from "./types.js";

// Base class for creating providers
export { BaseProvider } from "./base-provider.js";

// Registry for managing providers
export {
  ProviderRegistry,
  getProviderRegistry,
  registerProvider,
} from "./registry.js";

// Built-in providers
export { OpenRouterProvider } from "./openrouter-provider.js";
export { OllamaProvider } from "./ollama-provider.js";
