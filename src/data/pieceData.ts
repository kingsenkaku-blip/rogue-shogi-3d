import type { PieceType, MovePattern, SlideDir } from '../core/types';

/** Helpers to build movement patterns tersely. */
const step = (dr: number, dc: number): [number, number] => [dr, dc];
const slide = (dr: number, dc: number, range = Infinity): SlideDir => ({ dr, dc, range });

// Common step bundles (player perspective: forward = -row).
const GOLD_STEPS: Array<[number, number]> = [
  step(-1, -1), step(-1, 0), step(-1, 1),
  step(0, -1), step(0, 1),
  step(1, 0),
];
const SILVER_STEPS: Array<[number, number]> = [
  step(-1, -1), step(-1, 0), step(-1, 1),
  step(1, -1), step(1, 1),
];
const KING_STEPS: Array<[number, number]> = [
  step(-1, -1), step(-1, 0), step(-1, 1),
  step(0, -1), step(0, 1),
  step(1, -1), step(1, 0), step(1, 1),
];

const EMPTY: MovePattern = { steps: [], slides: [] };

/**
 * Static definition for a piece kind.
 * Add a new entry here to introduce a new piece — no other code changes required
 * for basic movement / rendering.
 */
export interface PieceDef {
  type: PieceType;
  /** Japanese display label drawn on the 3D tile. */
  label: string;
  /** Short label when promoted (optional). */
  promotedLabel?: string;
  /** Longer name for UI panels. */
  name: string;
  /** English-ish id name for tooltips. */
  flavor: string;
  pattern: MovePattern;
  /** Movement once promoted (defaults to gold for minor pieces). */
  promotedPattern?: MovePattern;
  promotable: boolean;
  maxHp: number;
  /** Base attack damage when capturing / for ranged pieces. */
  atk: number;
  /** Roughly how valuable the piece is (used by the AI and rewards). */
  value: number;
  /** True for normal shogi pieces that can be re-dropped from hand. */
  droppable: boolean;
  /** Cannot move at all (turret). */
  immovable?: boolean;
  /** True for special (roguelike) pieces. */
  special?: boolean;
  /** Tags that the effect manager checks for behaviour. */
  tags?: string[];
  /** God-style cooldown ability period (turns). */
  cooldown?: number;
  /** Ranged auto-attack radius (turret / archer). 0 = none. */
  attackRange?: number;
}

export const PIECE_DATA: Record<PieceType, PieceDef> = {
  // ---------------------------------------------------------------- standard
  king: {
    type: 'king', label: '王', name: '王将', flavor: 'King',
    pattern: { steps: KING_STEPS, slides: [] },
    promotable: false, maxHp: 1, atk: 1, value: 10000, droppable: false,
  },
  rook: {
    type: 'rook', label: '飛', promotedLabel: '龍', name: '飛車', flavor: 'Rook',
    pattern: { steps: [], slides: [slide(-1, 0), slide(1, 0), slide(0, -1), slide(0, 1)] },
    promotedPattern: {
      steps: [step(-1, -1), step(-1, 1), step(1, -1), step(1, 1)],
      slides: [slide(-1, 0), slide(1, 0), slide(0, -1), slide(0, 1)],
    },
    promotable: true, maxHp: 1, atk: 1, value: 13, droppable: true,
  },
  bishop: {
    type: 'bishop', label: '角', promotedLabel: '馬', name: '角行', flavor: 'Bishop',
    pattern: { steps: [], slides: [slide(-1, -1), slide(-1, 1), slide(1, -1), slide(1, 1)] },
    promotedPattern: {
      steps: [step(-1, 0), step(1, 0), step(0, -1), step(0, 1)],
      slides: [slide(-1, -1), slide(-1, 1), slide(1, -1), slide(1, 1)],
    },
    promotable: true, maxHp: 1, atk: 1, value: 12, droppable: true,
  },
  gold: {
    type: 'gold', label: '金', name: '金将', flavor: 'Gold General',
    pattern: { steps: GOLD_STEPS, slides: [] },
    promotable: false, maxHp: 1, atk: 1, value: 6, droppable: true,
  },
  silver: {
    type: 'silver', label: '銀', promotedLabel: '全', name: '銀将', flavor: 'Silver General',
    pattern: { steps: SILVER_STEPS, slides: [] },
    promotedPattern: { steps: GOLD_STEPS, slides: [] },
    promotable: true, maxHp: 1, atk: 1, value: 5, droppable: true,
  },
  knight: {
    type: 'knight', label: '桂', promotedLabel: '圭', name: '桂馬', flavor: 'Knight',
    pattern: { steps: [step(-2, -1), step(-2, 1)], slides: [] },
    promotedPattern: { steps: GOLD_STEPS, slides: [] },
    promotable: true, maxHp: 1, atk: 1, value: 4, droppable: true,
  },
  lance: {
    type: 'lance', label: '香', promotedLabel: '杏', name: '香車', flavor: 'Lance',
    pattern: { steps: [], slides: [slide(-1, 0)] },
    promotedPattern: { steps: GOLD_STEPS, slides: [] },
    promotable: true, maxHp: 1, atk: 1, value: 3, droppable: true,
  },
  pawn: {
    type: 'pawn', label: '歩', promotedLabel: 'と', name: '歩兵', flavor: 'Pawn',
    pattern: { steps: [step(-1, 0)], slides: [] },
    promotedPattern: { steps: GOLD_STEPS, slides: [] },
    promotable: true, maxHp: 1, atk: 1, value: 1, droppable: true,
  },

  // ---------------------------------------------------------------- special
  turret: {
    type: 'turret', label: '砲', name: '自動攻撃タレット', flavor: 'Auto Turret',
    pattern: EMPTY, promotable: false, maxHp: 2, atk: 1, value: 7, droppable: false,
    immovable: true, special: true, tags: ['turret', 'mechanical'], attackRange: 2,
  },
  ninja: {
    type: 'ninja', label: '忍', name: '忍者', flavor: 'Ninja',
    // Diagonal slide up to 2 squares.
    pattern: { steps: [], slides: [slide(-1, -1, 2), slide(-1, 1, 2), slide(1, -1, 2), slide(1, 1, 2)] },
    promotable: false, maxHp: 1, atk: 1, value: 8, droppable: false,
    special: true, tags: ['ninja', 'stealth', 'extra-action-on-backstab'],
  },
  god: {
    type: 'god', label: '神', name: '神', flavor: 'God',
    pattern: { steps: KING_STEPS, slides: [] },
    promotable: false, maxHp: 3, atk: 2, value: 40, droppable: false,
    special: true, tags: ['god', 'divine'], cooldown: 3,
  },
  nuisance: {
    type: 'nuisance', label: '嫌', name: 'いやなやつ', flavor: 'The Nuisance',
    pattern: { steps: [step(-1, 0), step(1, 0), step(0, -1), step(0, 1)], slides: [] },
    promotable: false, maxHp: 1, atk: 0, value: 2, droppable: false,
    special: true, tags: ['nuisance', 'pest', 'multiplies', 'death-curse'],
  },
  golem: {
    type: 'golem', label: '岩', name: 'ゴーレム', flavor: 'Golem',
    pattern: { steps: [step(-1, 0), step(1, 0), step(0, -1), step(0, 1)], slides: [] },
    promotable: false, maxHp: 4, atk: 1, value: 9, droppable: false,
    special: true, tags: ['golem', 'tanky'],
  },
  phoenix: {
    type: 'phoenix', label: '鳳', name: '不死鳥', flavor: 'Phoenix',
    pattern: { steps: [], slides: [slide(-1, -1, 3), slide(-1, 1, 3), slide(1, -1, 3), slide(1, 1, 3)] },
    promotable: false, maxHp: 1, atk: 1, value: 14, droppable: false,
    special: true, tags: ['phoenix', 'revive'],
  },
  assassin: {
    type: 'assassin', label: '殺', name: '暗殺者', flavor: 'Assassin',
    pattern: { steps: [step(-2, -1), step(-2, 1), step(-1, -1), step(-1, 1), step(1, -1), step(1, 1)], slides: [] },
    promotable: false, maxHp: 1, atk: 2, value: 11, droppable: false,
    special: true, tags: ['assassin', 'stealth'],
  },
  healer: {
    type: 'healer', label: '癒', name: '僧侶', flavor: 'Healer',
    pattern: { steps: GOLD_STEPS, slides: [] },
    promotable: false, maxHp: 2, atk: 0, value: 7, droppable: false,
    special: true, tags: ['healer', 'support'],
  },
  bomber: {
    type: 'bomber', label: '爆', name: '爆弾兵', flavor: 'Bomber',
    pattern: { steps: [step(-1, 0), step(-1, -1), step(-1, 1)], slides: [] },
    promotable: false, maxHp: 1, atk: 1, value: 6, droppable: false,
    special: true, tags: ['bomber', 'death-explosion'],
  },
  archer: {
    type: 'archer', label: '弓', name: '弓兵', flavor: 'Archer',
    pattern: { steps: [step(-1, 0), step(1, 0), step(0, -1), step(0, 1)], slides: [] },
    promotable: false, maxHp: 1, atk: 1, value: 8, droppable: false,
    special: true, tags: ['archer', 'ranged'], attackRange: 3,
  },
  witch: {
    type: 'witch', label: '魔', name: '魔女', flavor: 'Witch',
    pattern: { steps: KING_STEPS, slides: [] },
    promotable: false, maxHp: 1, atk: 1, value: 9, droppable: false,
    special: true, tags: ['witch', 'curse'],
  },
  samurai: {
    type: 'samurai', label: '侍', name: '侍', flavor: 'Samurai',
    pattern: { steps: KING_STEPS, slides: [slide(-1, 0, 2)] },
    promotable: false, maxHp: 2, atk: 2, value: 10, droppable: false,
    special: true, tags: ['samurai', 'berserk'],
  },
  shieldbearer: {
    type: 'shieldbearer', label: '盾', name: '盾衛', flavor: 'Shield Bearer',
    pattern: { steps: [step(-1, 0), step(1, 0), step(0, -1), step(0, 1)], slides: [] },
    promotable: false, maxHp: 3, atk: 0, value: 7, droppable: false,
    special: true, tags: ['shield', 'support'],
  },
  gambler: {
    type: 'gambler', label: '賭', name: '賭博師', flavor: 'Gambler',
    pattern: { steps: KING_STEPS, slides: [] },
    promotable: false, maxHp: 1, atk: 1, value: 5, droppable: false,
    special: true, tags: ['gambler', 'random'],
  },
};

/** Pieces eligible as random rewards / summons (special only). */
export const SUMMONABLE_SPECIALS: PieceType[] = [
  'turret', 'ninja', 'golem', 'phoenix', 'assassin', 'healer',
  'bomber', 'archer', 'witch', 'samurai', 'shieldbearer', 'gambler',
];

/** Pieces a pawn can evolve into via the 歩兵進化 ability. */
export const PAWN_EVOLUTIONS: PieceType[] = [
  'ninja', 'assassin', 'archer', 'samurai', 'bomber', 'gambler',
];

export function getDef(type: PieceType): PieceDef {
  return PIECE_DATA[type];
}
