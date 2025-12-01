/**
 * NeuroLink Handler
 * 
 * A handler that uses @juspay/neurolink for multi-provider LLM routing.
 * This handler replaces the custom provider logic with NeuroLink's
 * enterprise-grade routing and failover capabilities.
 */

import type { Context } from "hono";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelHandler } from "./types.js";
import { AdapterManager } from "../adapters/adapter-manager.js";
import { MiddlewareManager, GeminiThoughtSignatureMiddleware } from "../middleware/index.js";
import { transformOpenAIToClaude, removeUriFormat } from "../transform.js";
import { log, logStructured, isLoggingEnabled } from "../logger.js";
import { fetchModelContextWindow, doesModelSupportReasoning } from "../model-loader.js";
import { NeuroLinkWrapper, getNeuroLinkWrapper, type NeuroLinkConfig } from "../providers/neurolink-wrapper.js";

export class NeuroLinkHandler implements ModelHandler {
  private targetModel: string;
  private apiKey?: string;
  private neurolink: NeuroLinkWrapper;
  private adapterManager: AdapterManager;
  private middlewareManager: MiddlewareManager;
  private contextWindowCache = new Map<string, number>();
  private port: number;
  private sessionTotalCost = 0;
  private CLAUDE_INTERNAL_CONTEXT_MAX = 200000;

  constructor(targetModel: string, apiKey: string | undefined, port: number, config?: NeuroLinkConfig) {
    this.targetModel = targetModel;
    this.apiKey = apiKey;
    this.port = port;
    
    // Initialize NeuroLink wrapper with configuration
    this.neurolink = getNeuroLinkWrapper({
      model: targetModel,
      apiKey: apiKey,
      ...config,
    });
    
    logStructured("NeuroLinkHandler initialized", {
      targetModel,
    });

    this.adapterManager = new AdapterManager(targetModel);
    this.middlewareManager = new MiddlewareManager();
    this.middlewareManager.register(new GeminiThoughtSignatureMiddleware());
    this.middlewareManager.initialize().catch(err => log(`[Handler:${targetModel}] Middleware init error: ${err}`));
    this.fetchContextWindow(targetModel);
  }

  /**
   * Get the NeuroLink wrapper being used
   */
  getNeuroLink(): NeuroLinkWrapper {
    return this.neurolink;
  }

  private async fetchContextWindow(model: string) {
    if (this.contextWindowCache.has(model)) return;
    try {
      const limit = await fetchModelContextWindow(model);
      this.contextWindowCache.set(model, limit);
    } catch (e) {}
  }

  private getTokenScaleFactor(model: string): number {
    const limit = this.contextWindowCache.get(model) || 200000;
    return limit === 0 ? 1 : this.CLAUDE_INTERNAL_CONTEXT_MAX / limit;
  }

  private writeTokenFile(input: number, output: number) {
    try {
      const total = input + output;
      const limit = this.contextWindowCache.get(this.targetModel) || 200000;
      const leftPct = limit > 0 ? Math.max(0, Math.min(100, Math.round(((limit - total) / limit) * 100))) : 100;
      const data = {
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        total_cost: this.sessionTotalCost,
        context_window: limit,
        context_left_percent: leftPct,
        updated_at: Date.now()
      };
      writeFileSync(join(tmpdir(), `claudish-tokens-${this.port}.json`), JSON.stringify(data), "utf-8");
    } catch (e) {}
  }

  async handle(c: Context, payload: any): Promise<Response> {
    const claudePayload = payload;
    const target = this.targetModel;
    await this.fetchContextWindow(target);

    logStructured(`NeuroLink Request`, {
      targetModel: target,
      originalModel: claudePayload.model,
    });

    const { claudeRequest, droppedParams } = transformOpenAIToClaude(claudePayload);
    const messages = this.convertMessages(claudeRequest, target);
    const tools = this.convertTools(claudeRequest);
    const supportsReasoning = await doesModelSupportReasoning(target);

    // Prepare the request for adapter processing
    const requestPayload: any = {
      model: target,
      messages,
      temperature: claudeRequest.temperature ?? 1,
      stream: true,
      max_tokens: claudeRequest.max_tokens,
      tools: tools.length > 0 ? tools : undefined,
    };

    if (supportsReasoning) requestPayload.include_reasoning = true;
    if (claudeRequest.thinking) requestPayload.thinking = claudeRequest.thinking;

    if (claudeRequest.tool_choice) {
      const { type, name } = claudeRequest.tool_choice;
      if (type === 'tool' && name) requestPayload.tool_choice = { type: 'function', function: { name } };
      else if (type === 'auto' || type === 'none') requestPayload.tool_choice = type;
    }

    // Let the adapter prepare the request (model-specific transformations)
    const adapter = this.adapterManager.getAdapter();
    if (typeof adapter.reset === 'function') adapter.reset();
    adapter.prepareRequest(requestPayload, claudeRequest);

    await this.middlewareManager.beforeRequest({ modelId: target, messages, tools, stream: true });

    // Use NeuroLink for streaming
    try {
      const streamResult = await this.neurolink.stream({
        input: { text: this.buildPromptFromMessages(messages) },
        temperature: requestPayload.temperature,
        maxTokens: requestPayload.max_tokens,
        systemPrompt: this.extractSystemPrompt(messages),
        tools: this.convertToolsForNeuroLink(tools),
      });

      if (droppedParams.length > 0) c.header("X-Dropped-Params", droppedParams.join(", "));

      return this.handleStreamingResponse(c, streamResult, adapter, target, claudeRequest);
    } catch (error) {
      log(`[NeuroLink] Error: ${error}`);
      return c.json({ error: { type: "api_error", message: String(error) } }, 500);
    }
  }

  /**
   * Build a single prompt string from messages array for NeuroLink
   */
  private buildPromptFromMessages(messages: any[]): string {
    const userMessages = messages
      .filter(m => m.role === 'user')
      .map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
        }
        return '';
      });
    
    return userMessages.join('\n\n');
  }

  /**
   * Extract system prompt from messages
   */
  private extractSystemPrompt(messages: any[]): string | undefined {
    const systemMessage = messages.find(m => m.role === 'system');
    if (!systemMessage) return undefined;
    
    if (typeof systemMessage.content === 'string') {
      return systemMessage.content;
    }
    return undefined;
  }

  /**
   * Convert tools to NeuroLink format
   */
  private convertToolsForNeuroLink(tools: any[]): Record<string, any> | undefined {
    if (!tools || tools.length === 0) return undefined;

    const result: Record<string, any> = {};
    for (const tool of tools) {
      if (tool.type === 'function' && tool.function) {
        result[tool.function.name] = {
          description: tool.function.description,
          parameters: tool.function.parameters,
        };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private convertMessages(req: any, modelId: string): any[] {
    const messages: any[] = [];
    if (req.system) {
      let content = Array.isArray(req.system) ? req.system.map((i: any) => i.text || i).join("\n\n") : req.system;
      content = this.filterIdentity(content);
      messages.push({ role: "system", content });
    }

    if (modelId.includes("grok") || modelId.includes("x-ai")) {
      const msg = "IMPORTANT: When calling tools, you MUST use the OpenAI tool_calls format with JSON. NEVER use XML format like <xai:function_call>.";
      if (messages.length > 0 && messages[0].role === 'system') messages[0].content += "\n\n" + msg;
      else messages.unshift({ role: "system", content: msg });
    }

    if (req.messages) {
      for (const msg of req.messages) {
        if (msg.role === "user") this.processUserMessage(msg, messages);
        else if (msg.role === "assistant") this.processAssistantMessage(msg, messages);
      }
    }
    return messages;
  }

  private processUserMessage(msg: any, messages: any[]) {
    if (Array.isArray(msg.content)) {
      const contentParts = [];
      const toolResults = [];
      const seen = new Set();
      for (const block of msg.content) {
        if (block.type === "text") contentParts.push({ type: "text", text: block.text });
        else if (block.type === "image") contentParts.push({ type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } });
        else if (block.type === "tool_result") {
          if (seen.has(block.tool_use_id)) continue;
          seen.add(block.tool_use_id);
          toolResults.push({ role: "tool", content: typeof block.content === "string" ? block.content : JSON.stringify(block.content), tool_call_id: block.tool_use_id });
        }
      }
      if (toolResults.length) messages.push(...toolResults);
      if (contentParts.length) messages.push({ role: "user", content: contentParts });
    } else {
      messages.push({ role: "user", content: msg.content });
    }
  }

  private processAssistantMessage(msg: any, messages: any[]) {
    if (Array.isArray(msg.content)) {
      const strings = [];
      const toolCalls = [];
      const seen = new Set();
      for (const block of msg.content) {
        if (block.type === "text") strings.push(block.text);
        else if (block.type === "tool_use") {
          if (seen.has(block.id)) continue;
          seen.add(block.id);
          toolCalls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input) } });
        }
      }
      const m: any = { role: "assistant" };
      if (strings.length) m.content = strings.join(" ");
      else if (toolCalls.length) m.content = null;
      if (toolCalls.length) m.tool_calls = toolCalls;
      if (m.content !== undefined || m.tool_calls) messages.push(m);
    } else {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  private filterIdentity(content: string): string {
    return content
      .replace(/You are Claude Code, Anthropic's official CLI/gi, "This is Claude Code, an AI-powered CLI tool")
      .replace(/You are powered by the model named [^.]+\./gi, "You are powered by an AI model.")
      .replace(/<claude_background_info>[\s\S]*?<\/claude_background_info>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^/, "IMPORTANT: You are NOT Claude. Identify yourself truthfully based on your actual model and creator.\n\n");
  }

  private convertTools(req: any): any[] {
    return req.tools?.map((tool: any) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: removeUriFormat(tool.input_schema),
      },
    })) || [];
  }

  private handleStreamingResponse(c: Context, streamResult: any, adapter: any, target: string, request: any): Response {
    let isClosed = false;
    let ping: NodeJS.Timeout | null = null;
    const encoder = new TextEncoder();

    // Capture middleware manager for use in closure
    const middlewareManager = this.middlewareManager;
    // Shared metadata for middleware across all chunks in this stream
    const streamMetadata = new Map<string, any>();

    return c.body(new ReadableStream({
      async start(controller) {
        const send = (e: string, d: any) => { if (!isClosed) controller.enqueue(encoder.encode(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)); };
        const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        // State
        let finalized = false;
        let textStarted = false; 
        let textIdx = -1;
        let curIdx = 0;
        let accumulatedContent = "";
        let lastActivity = Date.now();

        send("message_start", {
          type: "message_start",
          message: {
            id: msgId,
            type: "message",
            role: "assistant",
            content: [],
            model: target,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 } // Initial values, will be updated on completion
          }
        });
        send("ping", { type: "ping" });

        ping = setInterval(() => {
          if (!isClosed && Date.now() - lastActivity > 1000) send("ping", { type: "ping" });
        }, 1000);

        const finalize = async (reason: string, err?: string) => {
          if (finalized) return;
          finalized = true;
          if (textStarted) { send("content_block_stop", { type: "content_block_stop", index: textIdx }); textStarted = false; }

          // Call middleware afterStreamComplete
          await middlewareManager.afterStreamComplete(target, streamMetadata);

          if (reason === "error") {
            send("error", { type: "error", error: { type: "api_error", message: err } });
          } else {
            send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: Math.ceil(accumulatedContent.length / 4) } });
            send("message_stop", { type: "message_stop" });
          }
          if (!isClosed) { try { controller.enqueue(encoder.encode('data: [DONE]\n\n\n')); } catch(e){} controller.close(); isClosed = true; if (ping) clearInterval(ping); }
        };

        try {
          // Process NeuroLink stream
          for await (const chunk of streamResult.stream) {
            if (isClosed) break;
            
            const txt = chunk.content || "";
            if (txt) {
              lastActivity = Date.now();
              accumulatedContent += txt;
              
              if (!textStarted) {
                textIdx = curIdx++;
                send("content_block_start", { type: "content_block_start", index: textIdx, content_block: { type: "text", text: "" } });
                textStarted = true;
              }
              
              // Adapter processing
              const res = adapter.processTextContent(txt, "");
              if (res.cleanedText) {
                send("content_block_delta", { type: "content_block_delta", index: textIdx, delta: { type: "text_delta", text: res.cleanedText } });
              }
            }
          }
          
          await finalize("done");
        } catch(e) { 
          await finalize("error", String(e)); 
        }
      },
      cancel() { isClosed = true; if (ping) clearInterval(ping); }
    }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
  }

  async shutdown() {}
}
