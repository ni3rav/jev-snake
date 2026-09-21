import {
  DELTA,
  LEFT,
  RIGHT,
  foodRemainingMs,
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
  adjacent: {
    ahead: CellKind;
    left: CellKind;
    right: CellKind;
  };
  food: {
    where: string;
    time_left: string;
  };
};

export const TURN_QUESTION = {
  type: "choice" as const,
  instructions:
    "You are the snake. Pick this tick's turn. Food vanishes soon; prefer a turn that heads toward it when the way is clear. Hitting your body ends the game. The board wraps around the edges. You cannot reverse.",
  criteria: {
    straight: "Keep the current heading.",
    left: "Turn 90 degrees left relative to the current heading.",
    right: "Turn 90 degrees right relative to the current heading.",
  },
};

function lengthWord(length: number): JevState["length"] {
  if (length <= 4) return "tiny";
  if (length <= 8) return "short";
  if (length <= 16) return "medium";
  return "long";
}

function timeWord(ms: number): string {
  if (ms > 3500) return "just appeared";
  if (ms > 2000) return "a few seconds";
  if (ms > 800) return "almost gone";
  return "about to vanish";
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

export function perceive(game: Game, now: number): JevState {
  const head = game.snake[0]!;
  const dx = wrapDelta(game.food.x - head.x);
  const dy = wrapDelta(game.food.y - head.y);
  const local = toLocal(dx, dy, game.dir);

  return {
    heading: game.dir,
    length: lengthWord(game.snake.length),
    adjacent: {
      ahead: cellKind(game, stepPoint(head, game.dir)),
      left: cellKind(game, stepPoint(head, LEFT[game.dir])),
      right: cellKind(game, stepPoint(head, RIGHT[game.dir])),
    },
    food: {
      where: foodWhere(local.forward, local.right),
      time_left: timeWord(foodRemainingMs(game, now)),
    },
  };
}
