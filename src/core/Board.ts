import { BOARD_SIZE, PROMO_DEPTH } from './constants';
import type { Player, Vec2, TileType, SlideDir } from './types';
import { Piece } from './Piece';

/** A move the engine can produce. */
export interface Move {
  piece: Piece;
  from: Vec2;
  to: Vec2;
  /** Set when this is a drop from hand (piece not yet on board). */
  drop?: boolean;
  /** Piece captured by this move, if any (filled when applied). */
  captured?: Piece | null;
  /** Whether this move triggers promotion. */
  promotes?: boolean;
}

/**
 * Pure board state + rules. No rendering, no game-flow logic.
 * GameManager drives it; SpecialEffectManager reads/writes it for effects.
 */
export class Board {
  readonly size = BOARD_SIZE;
  grid: (Piece | null)[][];
  tiles: TileType[][];
  /** Warp-tile pairings keyed by "r,c" -> partner Vec2. */
  warpLinks = new Map<string, Vec2>();

  constructor() {
    this.grid = Board.empty<Piece | null>(null);
    this.tiles = Board.empty<TileType>('normal');
  }

  private static empty<T>(fill: T): T[][] {
    return Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => fill),
    );
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  at(row: number, col: number): Piece | null {
    if (!this.inBounds(row, col)) return null;
    return this.grid[row][col];
  }

  tileAt(row: number, col: number): TileType {
    if (!this.inBounds(row, col)) return 'normal';
    return this.tiles[row][col];
  }

  setTile(row: number, col: number, t: TileType): void {
    if (this.inBounds(row, col)) this.tiles[row][col] = t;
  }

  place(piece: Piece, row: number, col: number): void {
    piece.row = row;
    piece.col = col;
    this.grid[row][col] = piece;
  }

  remove(piece: Piece): void {
    if (this.at(piece.row, piece.col) === piece) {
      this.grid[piece.row][piece.col] = null;
    }
  }

  /** Move a piece on the grid (no capture/effect logic here). */
  relocate(piece: Piece, row: number, col: number): void {
    this.grid[piece.row][piece.col] = null;
    piece.row = row;
    piece.col = col;
    this.grid[row][col] = piece;
  }

  allPieces(): Piece[] {
    const out: Piece[] = [];
    for (const rowArr of this.grid) for (const p of rowArr) if (p) out.push(p);
    return out;
  }

  piecesOf(owner: Player): Piece[] {
    return this.allPieces().filter((p) => p.owner === owner);
  }

  findKing(owner: Player): Piece | undefined {
    return this.allPieces().find((p) => p.owner === owner && p.type === 'king');
  }

  /** True if (row) is inside `owner`'s promotion zone (the far 3 ranks). */
  inPromotionZone(owner: Player, row: number): boolean {
    return owner === 'player'
      ? row <= PROMO_DEPTH - 1 // player promotes near the top (rows 0..2)
      : row >= BOARD_SIZE - PROMO_DEPTH; // ai promotes near the bottom (rows 6..8)
  }

  /**
   * Generate pseudo-legal destination squares for a piece already on the board.
   * "Pseudo-legal" = correct movement, captures own pieces excluded, but does
   * NOT verify that the mover's king is left in check (kept simple for the MVP).
   */
  movesFor(piece: Piece): Vec2[] {
    const def = piece.def;
    if (def.immovable || piece.stunned) return [];

    const pattern = piece.promoted && def.promotedPattern ? def.promotedPattern : def.pattern;
    // Player faces -row; AI faces +row. Multiply by sign to flip orientation.
    const sign = piece.owner === 'player' ? 1 : -1;
    const penalty = piece.rangePenalty; // shrinks slide range
    const out: Vec2[] = [];

    // Single steps (jumps allowed; only destination matters).
    for (const [dr, dc] of pattern.steps) {
      const r = piece.row + dr * sign;
      const c = piece.col + dc * sign;
      if (!this.inBounds(r, c)) continue;
      const occ = this.at(r, c);
      if (occ && occ.owner === piece.owner) continue;
      out.push({ row: r, col: c });
    }

    // Sliding directions (path-blocked).
    for (const s of pattern.slides) {
      const maxRange = Math.max(1, (s.range === Infinity ? BOARD_SIZE : s.range) - penalty);
      let r = piece.row;
      let c = piece.col;
      for (let i = 0; i < maxRange; i++) {
        r += s.dr * sign;
        c += s.dc * sign;
        if (!this.inBounds(r, c)) break;
        const occ = this.at(r, c);
        if (occ) {
          if (occ.owner !== piece.owner) out.push({ row: r, col: c });
          break; // blocked either way
        }
        out.push({ row: r, col: c });
      }
    }

    return out;
  }

  /** Squares within Chebyshev distance `range` (used by turret/archer/auras). */
  squaresInRange(center: Vec2, range: number): Vec2[] {
    const out: Vec2[] = [];
    for (let dr = -range; dr <= range; dr++) {
      for (let dc = -range; dc <= range; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = center.row + dr;
        const c = center.col + dc;
        if (this.inBounds(r, c)) out.push({ row: r, col: c });
      }
    }
    return out;
  }

  /** Cheb distance helper. */
  static dist(a: Vec2, b: Vec2): number {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }

  /** Find an empty cell, preferring those near a given row band. */
  findEmptyCell(preferRows?: number[]): Vec2 | null {
    const rows = preferRows ?? [...Array(BOARD_SIZE).keys()];
    for (const row of rows) {
      const cols = [...Array(BOARD_SIZE).keys()].sort(() => Math.random() - 0.5);
      for (const col of cols) {
        if (!this.at(row, col)) return { row, col };
      }
    }
    // fallback: any empty
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++) if (!this.at(r, c)) return { row: r, col: c };
    return null;
  }

  /** Home rows (back two ranks) for a player — used for base-area placement. */
  homeRows(owner: Player): number[] {
    return owner === 'player' ? [8, 7] : [0, 1];
  }
}

/** Re-export for convenience. */
export type { SlideDir };
