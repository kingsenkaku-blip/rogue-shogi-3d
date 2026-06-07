import type { Player, Vec2, Rarity } from './types';
import { opponentOf, key } from './types';
import { Board } from './Board';
import { Piece } from './Piece';
import { BOARD_SIZE } from './constants';
import type { AbilityDef } from '../data/abilityData';
import type { GameManager } from './GameManager';

export type AIAction =
  | { kind: 'move'; piece: Piece; to: Vec2 }
  | { kind: 'drop'; type: string; to: Vec2 };

/**
 * Simple heuristic AI. Priority (per the spec):
 *  1. Capture the enemy king.
 *  2. Capture a strong / special piece.
 *  3. Keep its own king safe.
 *  4. Flee from dangerous pieces (turret / god / archer).
 *  5. Otherwise advance / random legal move.
 */
export class AIController {
  constructor(private game: GameManager) {}

  private get board(): Board {
    return this.game.board;
  }

  // ----- card choice -----
  chooseCard(cards: AbilityDef[]): AbilityDef {
    const rarityScore: Record<Rarity, number> = {
      common: 1, rare: 2.5, epic: 4, legendary: 6, cursed: 2,
    };
    let best = cards[0];
    let bestScore = -Infinity;
    for (const c of cards) {
      let s = rarityScore[c.rarity] + Math.random();
      if (c.category === 'summon' || c.category === 'piece-upgrade') s += 1;
      if (c.category === 'base' && this.game.players.ai.homeHp < 12) s += 3;
      if (c.rarity === 'cursed') s -= 1; // a bit cautious
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best;
  }

  // ----- smite target (god) -----
  chooseSmiteTarget(): Piece | null {
    const foes = this.board.piecesOf('player').filter((p) => p.type !== 'king');
    if (!foes.length) return null;
    foes.sort((a, b) => b.def.value - a.def.value);
    // Only worth it on a genuinely valuable piece.
    return foes[0].def.value >= 7 ? foes[0] : null;
  }

  // ----- main action -----
  chooseAction(): AIAction | null {
    const me: Player = 'ai';
    const foe = opponentOf(me);
    const threatened = this.attackedSquares(foe); // squares the player can hit next

    let best: AIAction | null = null;
    let bestScore = -Infinity;

    for (const piece of this.board.piecesOf(me)) {
      for (const to of this.board.movesFor(piece)) {
        const score = this.scoreMove(piece, to, threatened);
        if (score > bestScore) {
          bestScore = score;
          best = { kind: 'move', piece, to };
        }
      }
    }

    // Consider a drop if the board move looks weak.
    const drop = this.considerDrop(threatened);
    if (drop && drop.score > bestScore) {
      bestScore = drop.score;
      best = drop.action;
    }

    return best;
  }

  private scoreMove(piece: Piece, to: Vec2, threatened: Set<string>): number {
    let score = Math.random() * 2;
    const target = this.board.at(to.row, to.col);

    if (target && target.owner !== piece.owner) {
      if (target.type === 'king') return 1_000_000; // priority 1
      const lethal = target.hp <= piece.attack;
      if (lethal) {
        score += 12 * target.def.value; // priority 2
        if (target.isSpecial) score += 30;
      } else {
        score += 2 * target.def.value; // chip damage only
      }
    }

    // priority 5: advance toward the player's home (higher row = forward for AI).
    score += to.row * 1.2;

    // Breaching the player's back rank deals home damage.
    if (to.row === BOARD_SIZE - 1 && piece.row !== BOARD_SIZE - 1) {
      score += 25 + piece.attack * 5;
    }

    // priority 3 & 4: avoid hanging a valuable piece / walking into danger.
    if (threatened.has(key(to.row, to.col))) {
      const gain = target && target.owner !== piece.owner ? target.def.value : 0;
      if (gain < piece.def.value) score -= piece.def.value * 6;
    }
    if (piece.type === 'king' && threatened.has(key(to.row, to.col))) score -= 500;

    // Stay clear of player turrets / archers / god.
    score -= this.dangerNear(to) ;

    return score;
  }

  /** Penalty for moving next to / in range of dangerous player pieces. */
  private dangerNear(to: Vec2): number {
    let penalty = 0;
    for (const p of this.board.piecesOf('player')) {
      const d = Board.dist(to, { row: p.row, col: p.col });
      const range = p.def.attackRange ?? 0;
      if (range > 0 && d <= range) penalty += 18;
      if (p.type === 'god' && d <= 1) penalty += 30;
    }
    return penalty;
  }

  private considerDrop(threatened: Set<string>): { action: AIAction; score: number } | null {
    const hand = this.game.players.ai.hand;
    const types = Object.keys(hand).filter((t) => hand[t] > 0);
    if (!types.length) return null;

    // Drop a held piece onto a safe-ish forward empty cell.
    let best: { action: AIAction; score: number } | null = null;
    for (const type of types) {
      for (const row of [3, 4, 2]) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (this.board.at(row, col)) continue;
          if (!this.game.canDropAt(type, 'ai', row, col)) continue;
          let score = 4 + row * 0.8 + Math.random();
          if (threatened.has(key(row, col))) score -= 6;
          if (!best || score > best.score) {
            best = { action: { kind: 'drop', type, to: { row, col } }, score };
          }
        }
      }
    }
    return best;
  }

  /** Set of "r,c" the given side can move onto next (pseudo-legal). */
  private attackedSquares(side: Player): Set<string> {
    const set = new Set<string>();
    for (const p of this.board.piecesOf(side)) {
      for (const m of this.board.movesFor(p)) set.add(key(m.row, m.col));
    }
    return set;
  }
}
