// Web Worker that hosts the WebLLM engine so model download + inference run
// off the main thread (the UI never freezes while the ~1.8GB model loads or
// while tokens are generated). The main thread talks to it via
// CreateWebWorkerMLCEngine (see localAI.js).
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
