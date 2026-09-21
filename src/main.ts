import "./style.css";
import {
  FOOD_MS,
  MIN_TICK_MS,
  SIZE,
  expireFood,
  foodRemainingMs,
  newGame,
  step,
  type Turn,
} from "./game.ts";
import { perceive } from "./perception.ts";
import { highlightJson } from "./highlight.ts";

type MoveResponse = {
  turn: Turn;
  latencyMs: number;
  input: unknown;
  output: unknown;
  error?: string;
};

const boardEl = document.querySelector("#board")!;
const scoreEl = document.querySelector("#score")!;
const eatenEl = document.querySelector("#eaten")!;
const missedEl = document.querySelector("#missed")!;
const tickEl = document.querySelector("#tick")!;
const statusEl = document.querySelector("#status")!;
const foodBarEl = document.querySelector("#food-bar") as HTMLElement;
const playBtn = document.querySelector("#play") as HTMLButtonElement;
const pauseBtn = document.querySelector("#pause") as HTMLButtonElement;
const resetBtn = document.querySelector("#reset") as HTMLButtonElement;
const callMetaEl = document.querySelector("#call-meta")!;
const inputJsonEl = document.querySelector("#input-json")!;
const outputJsonEl = document.querySelector("#output-json")!;
const historyEl = document.querySelector("#history")!;

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

function setStatus(text: string, error = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", error);
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
      const cell = cells[y * SIZE + x]!;
      cell.className = kind ? `cell ${kind}` : "cell";
    }
  }

  scoreEl.textContent = String(game.score);
  eatenEl.textContent = String(game.eaten);
  missedEl.textContent = String(game.missed);
  tickEl.textContent = String(game.tick);
  const remaining = foodRemainingMs(game, now) / FOOD_MS;
  foodBarEl.style.transform = `scaleX(${remaining})`;
}

async function showCall(payload: MoveResponse, tick: number): Promise<void> {
  const [inputHtml, outputHtml] = await Promise.all([
    highlightJson(payload.input, "input"),
    highlightJson(payload.output, "output"),
  ]);
  inputJsonEl.innerHTML = inputHtml;
  outputJsonEl.innerHTML = outputHtml;
  callMetaEl.textContent = `tick ${tick} · ${payload.latencyMs}ms · turn ${payload.turn}`;

  const item = document.createElement("li");
  item.innerHTML = `<span>tick ${tick} → ${payload.turn}</span><span>${payload.latencyMs}ms</span>`;
  historyEl.prepend(item);
  while (historyEl.children.length > 40) historyEl.lastElementChild?.remove();
}

async function requestMove(state: unknown, signal: AbortSignal): Promise<MoveResponse> {
  const response = await fetch("/api/move", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
    signal,
  });
  const payload = (await response.json()) as MoveResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  if (payload.turn !== "straight" && payload.turn !== "left" && payload.turn !== "right") {
    throw new Error(`Unexpected turn: ${String(payload.turn)}`);
  }
  return payload;
}

async function loop(signal: AbortSignal): Promise<void> {
  while (running && !game.dead) {
    const started = Date.now();
    game = expireFood(game, started);
    render(started);
    setStatus("Jev thinking…");

    const state = perceive(game, started);
    const payload = await requestMove(state, signal);
    await showCall(payload, game.tick + 1);

    const waited = Date.now() - started;
    if (waited < MIN_TICK_MS) await sleep(MIN_TICK_MS - waited, signal);

    const now = Date.now();
    game = expireFood(game, now);
    game = step(game, payload.turn, now);
    render(now);

    if (game.dead) {
      setStatus("Dead — bit itself");
      running = false;
    } else {
      setStatus(`Turned ${payload.turn}`);
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
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
    syncButtons();
  });
}

function reset(): void {
  stop();
  game = newGame(Date.now());
  historyEl.replaceChildren();
  inputJsonEl.replaceChildren();
  outputJsonEl.replaceChildren();
  callMetaEl.textContent = "No calls yet";
  setStatus("Ready");
  render(Date.now());
  syncButtons();
}

playBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", () => {
  stop();
  setStatus("Paused");
});
resetBtn.addEventListener("click", reset);

render(Date.now());
syncButtons();
void Promise.all([
  highlightJson({ waiting: "press Start — this pane is the evaluate request" }, "input"),
  highlightJson({ waiting: "answers, probabilities, usage, and latency land here" }, "output"),
]).then(([inputHtml, outputHtml]) => {
  inputJsonEl.innerHTML = inputHtml;
  outputJsonEl.innerHTML = outputHtml;
});
