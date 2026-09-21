import express from "express";
import { config } from "dotenv";
import { resolve } from "node:path";
import { APICallError, experimental_evaluate as evaluate } from "ai";
import { TURN_QUESTION } from "../src/perception.ts";

config({ path: resolve(import.meta.dirname, "../.env") });

const MODEL = "typesafe-ai/jev";
const DEFAULT_RETRY_MS = 15_000;
const app = express();
app.use(express.json({ limit: "256kb" }));

function headerMap(error: unknown): Record<string, string> | undefined {
  if (APICallError.isInstance(error)) return error.responseHeaders;
  if (error && typeof error === "object" && "cause" in error) {
    const cause = (error as { cause: unknown }).cause;
    if (APICallError.isInstance(cause)) return cause.responseHeaders;
  }
  return undefined;
}

function statusOf(error: unknown): number | undefined {
  if (APICallError.isInstance(error) && error.statusCode != null) return error.statusCode;
  if (error && typeof error === "object" && "statusCode" in error) {
    const status = (error as { statusCode: unknown }).statusCode;
    if (typeof status === "number") return status;
  }
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  if (APICallError.isInstance(cause) && cause.statusCode != null) return cause.statusCode;
  return undefined;
}

function retryAfterMs(error: unknown): number {
  const headers = headerMap(error);
  const retryMs = Number(headers?.["retry-after-ms"]);
  if (Number.isFinite(retryMs) && retryMs >= 0) return retryMs;

  const retryAfter = headers?.["retry-after"];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }

  return DEFAULT_RETRY_MS;
}

function isRateLimit(error: unknown): boolean {
  if (statusOf(error) === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate limit|too many requests/i.test(message);
}

app.post("/api/move", async (req, res) => {
  if (!process.env.AI_GATEWAY_API_KEY) {
    res.status(503).json({
      error: "Missing AI_GATEWAY_API_KEY. Copy .env.example to .env and set a Vercel AI Gateway key.",
    });
    return;
  }

  const state = req.body?.state;
  if (state == null || typeof state !== "object") {
    res.status(400).json({ error: "Expected { state } as a JSON object." });
    return;
  }

  const questions = { turn: TURN_QUESTION };
  const input = { state, questions };
  const started = Date.now();

  try {
    const result = await evaluate({
      model: MODEL,
      state,
      questions,
      maxRetries: 0,
    });

    const choice = result.answers.turn.choice;
    res.json({
      turn: choice === "left" || choice === "right" ? choice : "straight",
      latencyMs: Date.now() - started,
      input,
      output: { answers: result.answers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRateLimit(error)) {
      const retryAfterMsValue = retryAfterMs(error);
      res.set("Retry-After", String(Math.ceil(retryAfterMsValue / 1000)));
      res.status(429).json({
        error: message,
        rateLimited: true,
        retryAfterMs: retryAfterMsValue,
      });
      return;
    }
    res.status(502).json({ error: message, input });
  }
});

app.listen(3001, "127.0.0.1", () => {
  console.log("Jev snake server on http://127.0.0.1:3001");
});
