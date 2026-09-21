import {
  DELTA,
  LEFT,
  RIGHT,
  SIZE,
  wrap,
  wrapDelta,
  type CellKind,
  type Dir,
  type Game,
  type Point,
} from "./game.ts";

export type JevState = {
  heading: Dir;
  length: "tiny" | "short" | "medium" | "long";
  motion: string;
  adjacent: {
    ahead: CellKind;
    left: CellKind;
    right: CellKind;
  };
  food: {
    where: string;
  };
};

export const TURN_QUESTION = {
  type: "choice" as const,
  instructions:
    "Steer a snake that already keeps moving. It coasts straight until this answer is applied on a later tick. Prefer a turn toward food when that adjacent cell is empty. Hitting your body ends the game. The board wraps. You cannot reverse.",
  criteria: {
    straight: "Do nothing extra; it will keep the current heading.",
    left: "Turn 90 degrees left on the tick this answer is applied.",
    right: "Turn 90 degrees right on the tick this answer is applied.",
  },
};

function lengthWord(length: number): JevState["length"] {
  if (length <= 4) return "tiny";
  if (length <= 8) return "short";
  if (length <= 16) return "medium";
  return "long";
}

function toLocal(dx: number, dy: number, heading: Dir): { forward: number; right: number } {
  switch (heading) {
    case "north":
      return { forward: -dy, right: dx };
    case "south":
      return { forward: dy, right: -dx };
    case "east":
      return { forward: dx, right: dy };
    case "west":
      return { forward: -dx, right: -dy };
  }
}

function foodWhere(forward: number, right: number): string {
  if (forward === 0 && right === 0) return "on the head";
  const ns = forward > 0 ? "ahead" : forward < 0 ? "behind" : "";
  const ew = right > 0 ? "right" : right < 0 ? "left" : "";
  if (ns && ew) return `${ns}-${ew}`;
  return ns || ew;
}

function stepPoint(from: Point, dir: Dir): Point {
  const delta = DELTA[dir];
  return { x: wrap(from.x + delta.x), y: wrap(from.y + delta.y) };
}

function cellKind(game: Game, point: Point): CellKind {
  if (point.x === game.food.x && point.y === game.food.y) return "food";
  const vacatingTail = game.snake.at(-1);
  const blocking = game.snake.slice(0, -1);
  if (blocking.some((cell) => cell.x === point.x && cell.y === point.y)) return "body";
  if (vacatingTail && vacatingTail.x === point.x && vacatingTail.y === point.y) return "empty";
  return "empty";
}

function look(game: Game) {
  const head = game.snake[0]!;
  const dx = wrapDelta(game.food.x - head.x);
  const dy = wrapDelta(game.food.y - head.y);
  return {
    head,
    local: toLocal(dx, dy, game.dir),
    ahead: cellKind(game, stepPoint(head, game.dir)),
    left: cellKind(game, stepPoint(head, LEFT[game.dir])),
    right: cellKind(game, stepPoint(head, RIGHT[game.dir])),
  };
}

export function perceive(game: Game, _now: number): JevState {
  const view = look(game);
  return {
    heading: game.dir,
    length: lengthWord(game.snake.length),
    motion: "coasting straight; this turn is applied after the reply, not on this snapshot",
    adjacent: {
      ahead: view.ahead,
      left: view.left,
      right: view.right,
    },
    food: {
      where: foodWhere(view.local.forward, view.local.right),
    },
  };
}

export function shouldAskJev(
  game: Game,
  tickMs: number,
  foodRemainingMs: number,
  coastMs: number,
  newPellet: boolean,
): boolean {
  if (newPellet) return true;

  const view = look(game);
  if (view.ahead === "body") return true;
  if (view.left === "food" || view.right === "food") return true;
  if (view.ahead === "food") return false;
  if (view.local.forward <= 0) return true;

  const tick = Math.max(1, tickMs);
  const etaMs = view.local.forward * tick;
  const horizonMs = Math.max(tick, foodRemainingMs / SIZE);
  if (etaMs <= horizonMs) return true;

  return coastMs >= Math.max(tick, foodRemainingMs / 2);
}
