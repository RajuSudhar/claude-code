/**
 * Provider Registry
 * 
 * Manages the registration and selection of LLM API providers.
 * Allows dynamic addition of new providers and selecting the appropriate
 * provider based on model ID or explicit configuration.
 */

import type { Provider, ProviderConfig } from "./types.js";
import { OpenRouterProvider } from "./openrouter-provider.js";

/**
 * Registry for managing LLM providers
 */
export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();
  private defaultProviderId: string = "openrouter";

  constructor() {
    // Register default providers
    this.register(new OpenRouterProvider());
  }

  /**
   * Register a new provider
   * @param provider - The provider instance to register
   */
  register(provider: Provider): void {
    this.providers.set(provider.config.id, provider);
  }

  /**
   * Unregister a provider
   * @param providerId - The ID of the provider to unregister
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * Get a provider by ID
   * @param providerId - The ID of the provider
   * @returns The provider or undefined if not found
   */
  get(providerId: string): Provider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get the default provider
   */
  getDefault(): Provider {
    const provider = this.providers.get(this.defaultProviderId);
    if (!provider) {
      throw new Error(`Default provider '${this.defaultProviderId}' not found`);
    }
    return provider;
  }

  /**
   * Set the default provider
   * @param providerId - The ID of the provider to set as default
   */
  setDefault(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider '${providerId}' not found`);
    }
    this.defaultProviderId = providerId;
  }

  /**
   * Get a provider that can handle the given model ID
   * @param modelId - The model identifier
   * @returns The provider that can handle this model, or the default provider
   */
  getForModel(modelId: string): Provider {
    // First, check if any registered provider explicitly handles this model
    for (const provider of this.providers.values()) {
      if (provider.canHandleModel(modelId)) {
        return provider;
      }
    }

    // Fall back to default provider (OpenRouter can handle most models)
    return this.getDefault();
  }

  /**
   * List all registered providers
   */
  list(): ProviderConfig[] {
    return Array.from(this.providers.values()).map((p) => p.config);
  }

  /**
   * Check if a provider is registered
   * @param providerId - The ID of the provider
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Get the count of registered providers
   */
  get count(): number {
    return this.providers.size;
  }
}

/**
 * Global provider registry instance
 * Use this for accessing providers throughout the application
 */
let globalRegistry: ProviderRegistry | null = null;

/**
 * Get the global provider registry
 * Creates one if it doesn't exist
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Register a provider in the global registry
 * Convenience function for adding new providers
 */
export function registerProvider(provider: Provider): void {
  getProviderRegistry().register(provider);
}
