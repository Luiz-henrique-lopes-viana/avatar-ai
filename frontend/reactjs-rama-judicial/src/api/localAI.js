// Local, keyless conversational AI for "Modo conversa".
//
// The model runs 100% in the browser via WebLLM (WebGPU). No API key is ever
// exposed and nothing is sent to any backend — the conversation never leaves
// the user's machine. This is the "brain" behind the avatar when Modo conversa
// is on; when it's off, the app keeps using the existing backend.

// ~1.8GB, good pt-BR quality. Fallback to the 1B model on low-memory devices.
const MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

const LUIZA_SYSTEM_PROMPT =
  "Você é a Luiza, uma assistente virtual simpática e prestativa. " +
  "Responda SEMPRE em português do Brasil, de forma curta, clara e cordial, " +
  "em no máximo 2 ou 3 frases, pois sua resposta será falada em voz alta. " +
  "Nunca use listas, markdown, emojis ou formatação — apenas texto corrido natural.";

let enginePromise = null; // module-level singleton -> survives StrictMode remounts

// True only when WebGPU is actually usable (not just declared on navigator).
export async function isWebGPUAvailable() {
  try {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// Lazily create (and memoize) the engine. onProgress receives WebLLM's
// { progress: 0..1, text } during the one-time model download.
export function initLocalAI(onProgress) {
  if (!enginePromise) {
    enginePromise = (async () => {
      const ok = await isWebGPUAvailable();
      if (!ok) {
        throw new Error(
          "Seu navegador não tem WebGPU. Use o Chrome ou o Edge atualizados para o Modo conversa."
        );
      }
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      const worker = new Worker(new URL("./webllm.worker.js", import.meta.url), {
        type: "module",
      });
      return CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (report) => {
          if (onProgress) onProgress(report);
        },
      });
    })();
    // If init fails, clear the singleton so a later retry can start over.
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

// history: array of { role: "user" | "assistant", content: string }.
// Returns Luiza's reply as a trimmed pt-BR string.
export async function chat(history) {
  const engine = await initLocalAI();
  const messages = [
    { role: "system", content: LUIZA_SYSTEM_PROMPT },
    ...history,
  ];
  const reply = await engine.chat.completions.create({
    messages,
    temperature: 0.6,
  });
  return reply?.choices?.[0]?.message?.content?.trim() || "";
}
