import type { ZodTypeAny, z } from "zod";

/**
 * The contract every LLM backend must satisfy.
 *
 * Kept small on purpose so the backend is a config choice, not a code change.
 * Ollama, vLLM, OpenAI, OpenRouter, Together, Groq all speak the OpenAI chat
 * format, so one implementation (`OpenAICompatibleProvider`) covers them all.
 *
 * `chatJSON` is what every agent uses: forces JSON mode on the model, parses,
 * validates with the caller's Zod schema, and retries with the validation
 * error fed back into the conversation if parsing fails. This is the only
 * "agent framework" code we need.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Override the configured default for one call (per-agent model routing). */
  model?: string;
}

export interface ChatJSONOptions extends ChatOptions {
  /** Retries on JSON parse / schema validation failure. */
  maxRetries?: number;
}

export interface LLMProvider {
  /** Human-readable id used in logs and the trace. */
  readonly name: string;
  readonly defaultModel: string;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  chatJSON<S extends ZodTypeAny>(
    messages: ChatMessage[],
    schema: S,
    options?: ChatJSONOptions,
  ): Promise<z.infer<S>>;
}
