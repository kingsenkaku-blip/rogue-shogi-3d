/** Global tuning constants. */

export const BOARD_SIZE = 9;
export const TILE_SIZE = 1; // world units per cell

export const START_HOME_HP = 30;

/** Promotion zone depth (rows from the far edge). */
export const PROMO_DEPTH = 3;

/** How many turns between roguelike ability card offers (1 = every turn). */
export const CARD_INTERVAL = 1;

/** Colours used by the renderer. */
export const COLORS = {
  boardLight: 0xe9c98a,
  boardDark: 0xd9b066,
  boardFrame: 0x6b4a23,
  playerPiece: 0xf3e2c0,
  aiPiece: 0x3a3a44,
  playerText: '#3a2a12',
  aiText: '#f0f0f0',
  select: 0x35d07f,
  moveHint: 0x4aa3ff,
  attackHint: 0xff5a6a,
  tileHeal: 0x35d07f,
  tileTrap: 0xff7a3c,
  tileWarp: 0x9b6cff,
  tileSummon: 0xffd24a,
  tileSanctuary: 0x6ce0ff,
  tileLava: 0xff3b1a,
  tileCurse: 0x7a3bff,
} as const;

export const TILE_COLOR_MAP: Record<string, number> = {
  heal: COLORS.tileHeal,
  trap: COLORS.tileTrap,
  warp: COLORS.tileWarp,
  summon: COLORS.tileSummon,
  sanctuary: COLORS.tileSanctuary,
  lava: COLORS.tileLava,
  curse: COLORS.tileCurse,
};
