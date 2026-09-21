# Jev Snake

[Jev](https://typesafe.ai) plays wraparound Snake. You watch.

Each tick the model gets a local view (cells ahead / left / right, where the food is, how long it has left) and returns one Choice: `straight`, `left`, or `right`. Code owns physics. Reverse is not an option. Hitting yourself is game over. Food lasts 5 seconds, then respawns.

Calls go through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (`typesafe-ai/jev`). Each move in the list expands to the state/questions sent to Jev and the answers it returned.

## Run

```bash
pnpm install
cp .env.example .env   # set AI_GATEWAY_API_KEY
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) and press **Start**.
