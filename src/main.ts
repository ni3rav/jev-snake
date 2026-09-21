import "./style.css";
import {
  MIN_TICK_MS,
  SIZE,
  expireFood,
  foodRemainingMs,
  newGame,
  step,
  type Turn,
} from "./game.ts";
import { perceive } from "./perception.ts";

type MoveResponse = {
  turn: Turn;
  latencyMs: number;
  input: unknown;
  output: unknown;
  error?: string;
};

type StatusKind = "ready" | "waiting" | "playing" | "paused" | "dead" | "error";

const TURNS: Turn[] = ["straight", "left", "right"];

const boardEl = document.querySelector("#board")!;
const hudEl = document.querySelector("#hud")!;
const statusEl = document.querySelector("#status") as HTMLElement;
const playBtn = document.querySelector("#play") as HTMLButtonElement;
const pauseBtn = document.querySelector("#pause") as HTMLButtonElement;
const resetBtn = document.querySelector("#reset") as HTMLButtonElement;
const movesEl = document.querySelector("#moves")!;

const cells: HTMLDivElement[] = [];
for (let i = 0; i < SIZE * SIZE; i++) {
  const cell = document.createElement("div");
  cell.className = "cell";
  boardEl.append(cell);
  cells.push(cell);
}

let game = newGame(Date.now());
let running = false;
let abort: AbortController | null = null;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function setStatus(text: string, kind: StatusKind = "ready"): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function render(now: number): void {
  const occupancy = new Map<string, "head" | "snake" | "food">();
  occupancy.set(`${game.food.x},${game.food.y}`, "food");
  for (const [index, point] of game.snake.entries()) {
    occupancy.set(`${point.x},${point.y}`, index === 0 ? "head" : "snake");
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const kind = occupancy.get(`${x},${y}`);
      cells[y * SIZE + x]!.className = kind ? `cell ${kind}` : "cell";
    }
  }

  const food = (foodRemainingMs(game, now) / 1000).toFixed(1);
  hudEl.textContent = `score ${game.score} · missed ${game.missed} · food ${food}s`;
}

function dump(label: string, value: unknown): string {
  return `${label}\n${JSON.stringify(value, null, 2)}`;
}

function pushMove(tick: number, payload: MoveResponse): void {
  const item = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `${tick} ${payload.turn} ${payload.latencyMs}ms`;
  const input = document.createElement("pre");
  input.textContent = dump("input", payload.input);
  const output = document.createElement("pre");
  output.textContent = dump("output", payload.output);
  item.append(summary, input, output);
  movesEl.prepend(item);
}

async function requestMove(state: unknown, signal: AbortSignal): Promise<MoveResponse> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch("/api/move", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
    signal: AbortSignal.any([signal, timeout]),
  });
  const payload = (await response.json()) as MoveResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  if (!TURNS.includes(payload.turn)) {
    payload.turn = "straight";
  }
  return payload;
}

async function loop(signal: AbortSignal): Promise<void> {
  while (running && !game.dead) {
    const started = Date.now();
    game = expireFood(game, started);
    render(started);
    setStatus("waiting", "waiting");

    const payload = await requestMove(perceive(game, started), signal);
    pushMove(game.tick + 1, payload);

    const waited = Date.now() - started;
    if (waited < MIN_TICK_MS) await sleep(MIN_TICK_MS - waited, signal);

    const now = Date.now();
    game = expireFood(game, now);
    game = step(game, payload.turn, now);
    render(now);

    if (game.dead) {
      setStatus("dead", "dead");
      running = false;
    } else {
      setStatus(payload.turn, "playing");
    }
  }
  syncButtons();
}

function syncButtons(): void {
  playBtn.disabled = running || game.dead;
  pauseBtn.disabled = !running;
}

function stop(): void {
  running = false;
  abort?.abort();
  abort = null;
  syncButtons();
}

function start(): void {
  if (running || game.dead) return;
  running = true;
  abort = new AbortController();
  syncButtons();
  void loop(abort.signal).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    running = false;
    setStatus(error instanceof Error ? error.message : String(error), "error");
    syncButtons();
  });
}

function reset(): void {
  stop();
  game = newGame(Date.now());
  movesEl.replaceChildren();
  setStatus("ready");
  render(Date.now());
  syncButtons();
}

playBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", () => {
  stop();
  setStatus("paused", "paused");
});
resetBtn.addEventListener("click", reset);

render(Date.now());
syncButtons();
