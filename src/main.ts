import "./style.css";
import {
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

const TURNS: Turn[] = ["straight", "left", "right"];

const boardEl = document.querySelector("#board")!;
const idleEl = document.querySelector("#idle") as HTMLElement;
const hudEl = document.querySelector("#hud")!;
const playBtn = document.querySelector("#play") as HTMLButtonElement;
const pauseBtn = document.querySelector("#pause") as HTMLButtonElement;
const resetBtn = document.querySelector("#reset") as HTMLButtonElement;
const movesEl = document.querySelector("#moves")!;
const tickSlider = document.querySelector("#tick-slider") as HTMLInputElement;
const tickLabel = document.querySelector("#tick-label")!;
const foodSlider = document.querySelector("#food-slider") as HTMLInputElement;
const foodLabel = document.querySelector("#food-label")!;

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
let pendingTurn: Turn | null = null;
let jevBusy = false;

function tickMs(): number {
  return Number(tickSlider.value);
}

function foodMs(): number {
  return Number(foodSlider.value) * 1000;
}

function syncSliderLabels(): void {
  tickLabel.textContent = `${tickMs()}ms`;
  foodLabel.textContent = `${foodSlider.value}s`;
}

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

  const food = (foodRemainingMs(game, now, foodMs()) / 1000).toFixed(1);
  hudEl.textContent = `score ${game.score} · missed ${game.missed} · food ${food}s`;
  syncIdle();
}

function syncIdle(): void {
  if (running) {
    idleEl.hidden = true;
    return;
  }
  idleEl.hidden = false;
  idleEl.textContent = game.dead ? "dead" : "not started";
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

function kickJev(signal: AbortSignal): void {
  if (jevBusy || !running || game.dead) return;
  jevBusy = true;
  const tick = game.tick;
  void requestMove(perceive(game, Date.now()), signal)
    .then((payload) => {
      if (!running || game.dead) return;
      pendingTurn = payload.turn;
      pushMove(tick, payload);
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
    })
    .finally(() => {
      jevBusy = false;
    });
}

async function loop(signal: AbortSignal): Promise<void> {
  while (running && !game.dead) {
    const started = Date.now();
    game = expireFood(game, started, foodMs());
    const turn = pendingTurn ?? "straight";
    pendingTurn = null;
    game = step(game, turn, started);
    render(started);

    if (game.dead) {
      running = false;
      break;
    }

    kickJev(signal);
    const used = Date.now() - started;
    if (used < tickMs()) await sleep(tickMs() - used, signal);
  }
  syncIdle();
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
  jevBusy = false;
  pendingTurn = null;
  syncIdle();
  syncButtons();
}

function start(): void {
  if (running || game.dead) return;
  running = true;
  abort = new AbortController();
  syncIdle();
  syncButtons();
  void loop(abort.signal).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    running = false;
    syncIdle();
    syncButtons();
  });
}

function reset(): void {
  stop();
  game = newGame(Date.now());
  movesEl.replaceChildren();
  render(Date.now());
  syncButtons();
}

playBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", stop);
resetBtn.addEventListener("click", reset);
tickSlider.addEventListener("input", syncSliderLabels);
foodSlider.addEventListener("input", () => {
  syncSliderLabels();
  render(Date.now());
});

render(Date.now());
syncSliderLabels();
syncButtons();
