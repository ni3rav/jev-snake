export const SIZE = 16;
export const FOOD_MS = 5000;
export const TICK_MS = 150;

export type Dir = "north" | "east" | "south" | "west";
export type Turn = "straight" | "left" | "right";
export type CellKind = "empty" | "body" | "food";

export type Point = { x: number; y: number };

export type Game = {
  snake: Point[];
  dir: Dir;
  food: Point;
  foodAt: number;
  score: number;
  eaten: number;
  missed: number;
  dead: boolean;
  tick: number;
};

export const LEFT: Record<Dir, Dir> = {
  north: "west",
  west: "south",
  south: "east",
  east: "north",
};

export const RIGHT: Record<Dir, Dir> = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
};

export const DELTA: Record<Dir, Point> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  east: { x: 1, y: 0 },
};

export function wrap(n: number): number {
  return ((n % SIZE) + SIZE) % SIZE;
}

export function wrapDelta(delta: number): number {
  if (delta > SIZE / 2) return delta - SIZE;
  if (delta < -SIZE / 2) return delta + SIZE;
  return delta;
}

export function applyTurn(dir: Dir, turn: Turn): Dir {
  if (turn === "left") return LEFT[dir];
  if (turn === "right") return RIGHT[dir];
  return dir;
}

function same(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function occupied(snake: Point[], point: Point): boolean {
  return snake.some((cell) => same(cell, point));
}

export function spawnFood(snake: Point[]): Point {
  const empty: Point[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const point = { x, y };
      if (!occupied(snake, point)) empty.push(point);
    }
  }
  if (empty.length === 0) return { x: 0, y: 0 };
  return empty[Math.floor(Math.random() * empty.length)]!;
}

export function newGame(now: number): Game {
  const head = { x: 8, y: 8 };
  const snake = [head, { x: 7, y: 8 }, { x: 6, y: 8 }];
  return {
    snake,
    dir: "east",
    food: spawnFood(snake),
    foodAt: now,
    score: 0,
    eaten: 0,
    missed: 0,
    dead: false,
    tick: 0,
  };
}

export function expireFood(game: Game, now: number, foodMs = FOOD_MS): Game {
  if (game.dead || now - game.foodAt < foodMs) return game;
  return {
    ...game,
    food: spawnFood(game.snake),
    foodAt: now,
    missed: game.missed + 1,
  };
}

export function step(game: Game, turn: Turn, now: number): Game {
  const dir = applyTurn(game.dir, turn);
  const head = game.snake[0]!;
  const delta = DELTA[dir];
  const next = { x: wrap(head.x + delta.x), y: wrap(head.y + delta.y) };
  const eating = same(next, game.food);
  const body = eating ? game.snake : game.snake.slice(0, -1);
  const dead = occupied(body, next);
  const snake = [next, ...body];

  if (dead) {
    return { ...game, snake, dir, dead: true, tick: game.tick + 1 };
  }

  if (eating) {
    return {
      ...game,
      snake,
      dir,
      food: spawnFood(snake),
      foodAt: now,
      score: game.score + 1,
      eaten: game.eaten + 1,
      tick: game.tick + 1,
    };
  }

  return { ...game, snake, dir, tick: game.tick + 1 };
}

export function foodRemainingMs(game: Game, now: number, foodMs = FOOD_MS): number {
  return Math.max(0, foodMs - (now - game.foodAt));
}
