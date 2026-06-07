import type { Player, Vec2 } from './types';
import { opponentOf } from './types';
import { Board } from './Board';
import { Piece } from './Piece';
import { BOARD_SIZE } from './constants';
import type { GameManager } from './GameManager';

/**
 * Handles all the "automatic" board behaviour that isn't a player move:
 * turret/archer fire, support auras, tile damage, pest multiplication, and
 * dynamic auras such as the king's pressure passive.
 */
export class SpecialEffectManager {
  constructor(private game: GameManager) {}

  private get board(): Board {
    return this.game.board;
  }

  /**
   * Recompute short-lived auras for the side about to move.
   * Currently: 王の威圧 (enemy king pressure) shrinks our move range.
   */
  applyAuras(side: Player): void {
    const foe = opponentOf(side);
    if (this.game.hasPassive(foe, 'kings-pressure')) {
      const king = this.board.findKing(foe);
      if (king) {
        for (const p of this.board.piecesOf(side)) {
          if (Board.dist({ row: p.row, col: p.col }, { row: king.row, col: king.col }) <= 2) {
            p.addBuff({ id: 'pressure', label: '威圧', turns: 1, rangePenalty: 1 });
          }
        }
      }
    }
  }

  /** Everything that happens at the end of `side`'s turn. */
  resolveEndOfTurn(side: Player): void {
    this.autoAttacks(side);
    this.supportAuras(side);
    this.tileEffects();
    this.nuisanceMultiply(side);
  }

  /** Turret & archer automatic fire for the given side. */
  private autoAttacks(side: Player): void {
    const shooters = this.board.piecesOf(side).filter((p) => (p.def.attackRange ?? 0) > 0);
    for (const shooter of shooters) {
      const range = shooter.def.attackRange ?? 0;
      const center: Vec2 = { row: shooter.row, col: shooter.col };
      let targets = this.board
        .piecesOf(opponentOf(side))
        .filter((e) => Board.dist(center, { row: e.row, col: e.col }) <= range);
      if (!targets.length) continue;

      // Ninjas/stealth are hard to target: ignored unless they're all that's left.
      const visible = targets.filter((e) => !e.hasTag('stealth'));
      if (visible.length) targets = visible;

      // Prefer a kill, then the highest-value victim.
      targets.sort((a, b) => {
        const ka = a.hp <= shooter.attack ? 1 : 0;
        const kb = b.hp <= shooter.attack ? 1 : 0;
        if (ka !== kb) return kb - ka;
        return b.def.value - a.def.value;
      });
      const target = targets[0];
      this.game.log(`${shooter.name}が${target.name}を自動攻撃（${shooter.attack}）`, false);
      if (target.damage(shooter.attack)) this.game.killPiece(target, side);
    }
  }

  /** Healer & shield-bearer support auras. */
  private supportAuras(side: Player): void {
    for (const src of this.board.piecesOf(side)) {
      if (src.hasTag('healer')) {
        for (const v of this.board.squaresInRange({ row: src.row, col: src.col }, 1)) {
          const ally = this.board.at(v.row, v.col);
          if (ally && ally.owner === side && ally !== src && ally.hp < ally.maxHp) {
            ally.heal(1);
          }
        }
      }
      if (src.hasTag('shield')) {
        for (const v of this.board.squaresInRange({ row: src.row, col: src.col }, 1)) {
          const ally = this.board.at(v.row, v.col);
          if (ally && ally.owner === side) {
            ally.addBuff({ id: 'shieldaura', label: '守護', turns: 2, defense: 1 });
          }
        }
      }
    }
  }

  /** Lava damage and sanctuary aura for whoever stands on those tiles. */
  private tileEffects(): void {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const tile = this.board.tiles[r][c];
        const occ = this.board.at(r, c);
        if (!occ) continue;
        if (tile === 'lava') {
          this.game.log(`${occ.name}が溶岩で焼かれた`, false);
          if (occ.damage(1)) this.game.killPiece(occ);
        } else if (tile === 'sanctuary') {
          if (occ.hasTag('divine') || occ.type === 'god') {
            occ.addBuff({ id: 'sanctuary', label: '神域の祝福', turns: 2, atk: 1 });
          } else {
            occ.addBuff({ id: 'sanctuaryWeak', label: '神域の弱化', turns: 2, atk: -1, rangePenalty: 1 });
          }
        }
      }
    }
  }

  /** "いやなやつ" slowly multiplies if left unchecked. */
  private nuisanceMultiply(side: Player): void {
    const pests = this.board.allPieces().filter((p) => p.type === 'nuisance' && p.owner === side);
    if (pests.length === 0 || pests.length >= 6) return;
    for (const pest of pests) {
      if (Math.random() > 0.3) continue;
      const spots = this.board
        .squaresInRange({ row: pest.row, col: pest.col }, 1)
        .filter((v) => !this.board.at(v.row, v.col));
      if (!spots.length) continue;
      const spot = spots[Math.floor(Math.random() * spots.length)];
      const baby = new Piece('nuisance', side, spot.row, spot.col);
      this.board.place(baby, spot.row, spot.col);
      this.game.log('いやなやつが増殖した…！', true);
      break; // at most one new pest per turn
    }
  }
}
