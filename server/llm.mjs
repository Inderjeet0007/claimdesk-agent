// Provider-agnostic chat client for any OpenAI-compatible
// /chat/completions endpoint with tool calling: Groq, Cerebras, OpenRouter,
// Mistral, GitHub Models, a local Ollama/vLLM, or OpenAI itself.
//
// Configure with env vars (see .env.example):
//   LLM_PROVIDER   groq | cerebras | openrouter | custom   (default: groq)
//   LLM_API_KEY    key for that provider
//   LLM_MODEL      overrides the provider's default model
//   LLM_BASE_URL   only for "custom" (or to override a preset)

const PRESETS = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-oss-120b:free" },
};

export function getLlmConfig() {
  const provider = (process.env.LLM_PROVIDER || "groq").toLowerCase();
  const preset = PRESETS[provider] || {};
  return {
    provider,
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || preset.baseUrl || "",
    model: process.env.LLM_MODEL || preset.model || "",
  };
}

// tools.mjs declares parameter schemas with upper-case type names
// ("OBJECT", "STRING"). OpenAI-style APIs want JSON Schema lower-case.
function toJsonSchema(node) {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : toJsonSchema(v);
    }
    return out;
  }
  return node;
}

export function toOpenAiTools(declarations) {
  return declarations.map((d) => ({
    type: "function",
    function: { name: d.name, description: d.description, parameters: toJsonSchema(d.parameters) },
  }));
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// messages: OpenAI-format array (system/user/assistant/tool).
// Returns the assistant message: { role: "assistant", content, tool_calls? }
export async function chat({ messages, tools }) {
  const { provider, apiKey, baseUrl, model } = getLlmConfig();
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model,
    messages,
    temperature: 0.2,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
  };

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      lastError = new Error(`${provider} request failed: ${err.name === "AbortError" ? "timed out after 60s" : err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const message = data?.choices?.[0]?.message;
      if (!message) throw new Error(`${provider} returned no message: ${JSON.stringify(data).slice(0, 300)}`);
      return message;
    }

    const errText = await res.text().catch(() => "<no body>");
    lastError = new Error(`${provider} API error ${res.status}: ${errText.slice(0, 500)}`);

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delayMs = Math.min(retryAfter > 0 ? retryAfter * 1000 : 750 * 2 ** attempt, 15_000);
      console.warn(`[llm] ${res.status} from ${provider}/${model} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delayMs}ms`);
      await sleep(delayMs);
      continue;
    }
    console.error(`[llm] ${res.status} from ${provider}/${model}:`, errText);
    throw lastError;
  }
  throw lastError;
}
