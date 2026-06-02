import OpenAI from "openai";
import type { ZodTypeAny, z } from "zod";
import type {
  ChatJSONOptions,
  ChatMessage,
  ChatOptions,
  LLMProvider,
} from "./types.js";

export interface OpenAICompatibleConfig {
  /** Label for logs, e.g. "ollama" or "openai". */
  name: string;
  /** API root, e.g. http://localhost:11434/v1 for Ollama. */
  baseURL: string;
  /** Default model id, overridable per call. */
  model: string;
  /** Hosted APIs require this; Ollama ignores it. Defaults to "ollama". */
  apiKey?: string;
}

/**
 * Works against any server that implements the OpenAI /v1/chat/completions
 * API — Ollama, vLLM, TGI, OpenAI, OpenRouter, Together, Groq. Switching
 * providers is purely baseURL + model + key.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  private readonly client: OpenAI;

  constructor(config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.defaultModel = config.model;
    this.client = new OpenAI({
      baseURL: config.baseURL,
      // Ollama doesn't check the key but the SDK requires a non-empty value.
      apiKey: config.apiKey ?? "ollama",
    });
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: options.model ?? this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`[${this.name}] model returned an empty response`);
    }
    return content;
  }

  async chatJSON<S extends ZodTypeAny>(
    messages: ChatMessage[],
    schema: S,
    options: ChatJSONOptions = {},
  ): Promise<z.infer<S>> {
    const maxRetries = options.maxRetries ?? 2;
    const convo: ChatMessage[] = [...messages];

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const raw = await this.rawJSONChat(convo, options);
      const parsed = tryParseJSON(raw);
      if (parsed.ok) {
        const validated = schema.safeParse(parsed.value);
        if (validated.success) return validated.data;
        lastError = validated.error;
      } else {
        lastError = parsed.error;
      }

      // Feed the failure back to the model and ask it to fix.
      convo.push({ role: "assistant", content: raw });
      convo.push({
        role: "user",
        content:
          `Your previous output failed validation:\n${describeError(lastError)}\n\n` +
          `Return ONLY valid JSON matching the requested shape. No prose, no code fences.`,
      });
    }

    throw new Error(
      `[${this.name}] could not produce valid JSON after ${maxRetries + 1} attempts: ${describeError(lastError)}`,
    );
  }

  private async rawJSONChat(
    messages: ChatMessage[],
    options: ChatJSONOptions,
  ): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: options.model ?? this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens,
      response_format: { type: "json_object" },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error(`[${this.name}] empty JSON response`);
    return content;
  }
}

function tryParseJSON(raw: string): { ok: true; value: unknown } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error };
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
