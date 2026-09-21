import express from "express";
import { config } from "dotenv";
import { resolve } from "node:path";
import { experimental_evaluate as evaluate } from "ai";
import { TURN_QUESTION } from "../src/perception.ts";

config({ path: resolve(import.meta.dirname, "../.env") });

const MODEL = "typesafe-ai/jev";
const app = express();
app.use(express.json({ limit: "256kb" }));

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
  const input = { model: MODEL, state, questions };
  const started = Date.now();

  try {
    const result = await evaluate({
      model: MODEL,
      state,
      questions,
      providerOptions: {
        gateway: { zeroDataRetention: true },
      },
    });

    const answer = result.answers.turn;
    res.json({
      turn: answer.choice,
      latencyMs: Date.now() - started,
      input,
      output: {
        model: result.response.modelId,
        answers: result.answers,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message, input });
  }
});

app.listen(3001, "127.0.0.1", () => {
  console.log("Jev snake server on http://127.0.0.1:3001");
});
