/**
 * Shared types & enums for the whole game.
 * Keeping these centralized makes it easy to add new pieces / abilities / tiles.
 */

export type Player = 'player' | 'ai';

export function opponentOf(p: Player): Player {
  return p === 'player' ? 'ai' : 'player';
}

/** All piece kinds. Add new special pieces here + a definition in data/pieceData.ts */
export type PieceType =
  // --- Standard shogi ---
  | 'king'
  | 'rook'
  | 'bishop'
  | 'gold'
  | 'silver'
  | 'knight'
  | 'lance'
  | 'pawn'
  // --- Special (roguelike) ---
  | 'turret'
  | 'ninja'
  | 'god'
  | 'nuisance'
  | 'golem'
  | 'phoenix'
  | 'assassin'
  | 'healer'
  | 'bomber'
  | 'archer'
  | 'witch'
  | 'samurai'
  | 'shieldbearer'
  | 'gambler';

/** A board coordinate. row 0 = AI back rank (top), row 8 = player back rank (bottom). */
export interface Vec2 {
  row: number;
  col: number;
}

export function eq(a: Vec2, b: Vec2): boolean {
  return a.row === b.row && a.col === b.col;
}

export function key(row: number, col: number): string {
  return `${row},${col}`;
}

/** A single sliding direction with a maximum range (Infinity = unlimited slide). */
export interface SlideDir {
  dr: number;
  dc: number;
  range: number;
}

/**
 * Movement pattern, expressed from the *player* perspective (forward = -row).
 * The board flips these automatically for the AI.
 */
export interface MovePattern {
  /** Single jump offsets (used by knight & 1-square steppers). Not path-blocked. */
  steps: Array<[number, number]>;
  /** Sliding directions (rook / bishop / lance / ninja). Path-blocked. */
  slides: SlideDir[];
}

/** Categories used to colour ability cards and for AI heuristics. */
export type AbilityCategory =
  | 'piece-upgrade'
  | 'summon'
  | 'board-gimmick'
  | 'temp-buff'
  | 'passive'
  | 'sabotage'
  | 'base';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'cursed'];

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b6c2cf',
  rare: '#4aa3ff',
  epic: '#b15cff',
  legendary: '#ffb31a',
  cursed: '#ff3b6b',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  cursed: 'Cursed',
};

/** Special tile kinds placed on the board as gimmicks. */
export type TileType =
  | 'normal'
  | 'heal'
  | 'trap'
  | 'warp'
  | 'summon'
  | 'sanctuary'
  | 'lava'
  | 'curse';

/** Transient buffs/debuffs attached to a piece. */
export interface Buff {
  id: string;
  label: string;
  /** Remaining turns of the owning player (Infinity = permanent). */
  turns: number;
  /** Flat additions applied while active. */
  atk?: number;
  maxHp?: number;
  /** If true, the piece cannot act this turn. */
  stunned?: boolean;
  /** Movement multiplier weakening (e.g. king pressure). */
  rangePenalty?: number;
  /** Incoming damage reduction. */
  defense?: number;
}

/** Result of resolving a single move/action, used for logging & UI. */
export interface ActionLog {
  text: string;
  important?: boolean;
}
