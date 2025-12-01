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
 * - NeuroLink Wrapper: Integration with @juspay/neurolink for enterprise multi-provider support
 * 
 * Adding a New Provider:
 * 1. Create a new file: `your-provider.ts`
 * 2. Extend `BaseProvider` and implement required methods
 * 3. Register in the global registry or create custom registry
 * 
 * Using NeuroLink (Recommended):
 * ```typescript
 * import { getNeuroLinkWrapper } from "./providers";
 * 
 * const neurolink = getNeuroLinkWrapper({ model: "openai/gpt-4o" });
 * const result = await neurolink.generate({
 *   input: { text: "Hello world" }
 * });
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

// Optional providers (not registered by default, require manual registration)
// To use Ollama:
//   import { OllamaProvider, registerProvider } from "./providers";
//   registerProvider(new OllamaProvider());
export { OllamaProvider } from "./ollama-provider.js";

// NeuroLink integration (recommended for multi-provider support)
export {
  NeuroLinkWrapper,
  getNeuroLinkWrapper,
  createNeuroLinkWrapper,
  type NeuroLinkConfig,
  type NeuroLinkRequest,
  type NeuroLinkResult,
  type NeuroLinkStreamResult,
  type NeuroLinkMessage,
} from "./neurolink-wrapper.js";
