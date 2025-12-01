import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { log, isLoggingEnabled } from "./logger.js";
import type { ProxyServer } from "./types.js";
import { NativeHandler } from "./handlers/native-handler.js";
import { NeuroLinkHandler } from "./handlers/neurolink-handler.js";
import { ProviderHandler } from "./handlers/provider-handler.js";
import type { ModelHandler } from "./handlers/types.js";
import { getProviderRegistry } from "./providers/index.js";

// Check if NeuroLink should be used (via env var or if neurolink package is available)
const USE_NEUROLINK = process.env.USE_NEUROLINK === 'true' || process.env.CLAUDISH_USE_NEUROLINK === 'true';

export async function createProxyServer(
  port: number,
  openrouterApiKey?: string,
  model?: string,
  monitorMode: boolean = false,
  anthropicApiKey?: string,
  modelMap?: { opus?: string; sonnet?: string; haiku?: string; subagent?: string }
): Promise<ProxyServer> {

  // Define handlers for different roles
  const nativeHandler = new NativeHandler(anthropicApiKey);
  const handlers = new Map<string, ModelHandler>(); // Map from Target Model ID -> Handler Instance
  const providerRegistry = getProviderRegistry();

  // Helper to get or create handler for a target model
  const getProviderHandler = (targetModel: string): ModelHandler => {
      if (!handlers.has(targetModel)) {
          if (USE_NEUROLINK) {
              // Use NeuroLink for multi-provider routing
              handlers.set(targetModel, new NeuroLinkHandler(targetModel, openrouterApiKey, port));
              log(`[Proxy] Using NeuroLink handler for model: ${targetModel}`);
          } else {
              // Fall back to custom provider handler (for backward compatibility)
              const provider = providerRegistry.getForModel(targetModel);
              handlers.set(targetModel, new ProviderHandler(targetModel, openrouterApiKey, port, provider));
          }
      }
      return handlers.get(targetModel)!;
  };

  // Pre-initialize handlers for mapped models to ensure warm-up (context window fetch etc)
  if (model) getProviderHandler(model);
  if (modelMap?.opus) getProviderHandler(modelMap.opus);
  if (modelMap?.sonnet) getProviderHandler(modelMap.sonnet);
  if (modelMap?.haiku) getProviderHandler(modelMap.haiku);
  if (modelMap?.subagent) getProviderHandler(modelMap.subagent);

  const getHandlerForRequest = (requestedModel: string): ModelHandler => {
      // 1. Monitor Mode Override
      if (monitorMode) return nativeHandler;

      // 2. Resolve target model based on mappings or defaults
      let target = model || requestedModel; // Start with global default or request

      const req = requestedModel.toLowerCase();
      if (modelMap) {
          if (req.includes("opus") && modelMap.opus) target = modelMap.opus;
          else if (req.includes("sonnet") && modelMap.sonnet) target = modelMap.sonnet;
          else if (req.includes("haiku") && modelMap.haiku) target = modelMap.haiku;
          // Note: We don't verify "subagent" string because we don't know what Claude sends for subagents
          // unless it's "claude-3-haiku" (which is covered above) or specific.
          // Assuming Haiku mapping covers subagent unless custom logic added.
      }

      // 3. Native vs Provider Decision
      // Heuristic: Provider models have "/", Native ones don't.
      const isNative = !target.includes("/");

      if (isNative) {
          // If we mapped to a native string (unlikely) or passed through
          return nativeHandler;
      }

      // 4. Provider Handler (uses registry to select appropriate provider)
      return getProviderHandler(target);
  };

  const app = new Hono();
  app.use("*", cors());

  app.get("/", (c) => c.json({ status: "ok", message: "Claudish Proxy", config: { mode: monitorMode ? "monitor" : "hybrid", mappings: modelMap } }));
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Token counting
  app.post("/v1/messages/count_tokens", async (c) => {
      try {
          const body = await c.req.json();
          const reqModel = body.model || "claude-3-opus-20240229";
          const handler = getHandlerForRequest(reqModel);

          // If native, we just forward. Provider handler needs estimation.
          if (handler instanceof NativeHandler) {
              const headers: any = { "Content-Type": "application/json" };
              if (anthropicApiKey) headers["x-api-key"] = anthropicApiKey;

              const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", { method: "POST", headers, body: JSON.stringify(body) });
              return c.json(await res.json());
          } else {
              // Provider handler logic (estimation)
              const txt = JSON.stringify(body);
              return c.json({ input_tokens: Math.ceil(txt.length / 4) });
          }
      } catch (e) { return c.json({ error: String(e) }, 500); }
  });

  app.post("/v1/messages", async (c) => {
      try {
          const body = await c.req.json();
          const handler = getHandlerForRequest(body.model);

          // Route
          return handler.handle(c, body);
      } catch (e) {
          log(`[Proxy] Error: ${e}`);
          return c.json({ error: { type: "server_error", message: String(e) } }, 500);
      }
  });

  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

  // Port resolution
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr?.port ? addr.port : port;
  if (actualPort !== port) port = actualPort;

  log(`[Proxy] Server started on port ${port}`);

  return {
      port,
      url: `http://127.0.0.1:${port}`,
      shutdown: async () => {
          return new Promise<void>((resolve) => server.close((e) => resolve()));
      }
  };
}
