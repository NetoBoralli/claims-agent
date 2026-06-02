import { OpenAICompatibleProvider } from "./openaiCompatible.js";
import type { LLMProvider } from "./types.js";

export type { ChatJSONOptions, ChatMessage, ChatOptions, LLMProvider } from "./types.js";

/**
 * The ONLY place that knows which providers exist. Everything else depends on
 * the `LLMProvider` interface, so flipping LLM_PROVIDER=ollama -> openai (or
 * adding Bedrock / Gemini / a hybrid router) never touches agent code.
 */
export function getProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();

  switch (provider) {
    case "ollama":
      return new OpenAICompatibleProvider({
        name: "ollama",
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
      });

    case "openai":
      return new OpenAICompatibleProvider({
        name: "openai",
        baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        apiKey: requireEnv("OPENAI_API_KEY"),
      });

    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Use "ollama" or "openai".`,
      );
  }
}

/** Per-agent model override — env-var driven so the router is config, not code. */
export function modelFor(agent: string): string | undefined {
  const key = `${agent.toUpperCase()}_MODEL`;
  return process.env[key];
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var ${key} for this provider.`);
  return value;
}
