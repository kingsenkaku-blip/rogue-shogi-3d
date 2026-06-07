import type { Player, PieceType, Buff } from './types';
import { getDef, type PieceDef } from '../data/pieceData';

let PIECE_ID = 0;

/**
 * Runtime instance of a piece on the board.
 * Holds mutable state (position, hp, buffs, cooldown) while the static
 * definition (movement, value, tags) lives in pieceData.ts.
 */
export class Piece {
  readonly id: string;
  type: PieceType;
  owner: Player;
  row: number;
  col: number;
  promoted = false;
  hp: number;
  maxHp: number;
  cooldown = 0; // turns until special ability ready again (god/witch)
  buffs: Buff[] = [];

  // Flags toggled by abilities / events.
  reviveAvailable = false; // phoenix
  extraActionAvailable = false; // ninja backstab / two-action ability

  constructor(type: PieceType, owner: Player, row: number, col: number) {
    this.id = `p${PIECE_ID++}`;
    this.type = type;
    this.owner = owner;
    this.row = row;
    this.col = col;
    const def = getDef(type);
    this.maxHp = def.maxHp;
    this.hp = def.maxHp;
    this.cooldown = def.cooldown ?? 0;
    if (def.tags?.includes('revive')) this.reviveAvailable = true;
  }

  get def(): PieceDef {
    return getDef(this.type);
  }

  get name(): string {
    return this.def.name;
  }

  get isSpecial(): boolean {
    return !!this.def.special;
  }

  hasTag(tag: string): boolean {
    return this.def.tags?.includes(tag) ?? false;
  }

  /** Effective attack including buffs. */
  get attack(): number {
    let a = this.def.atk;
    for (const b of this.buffs) a += b.atk ?? 0;
    return a;
  }

  /** Effective defense (incoming damage reduction) from buffs. */
  get defense(): number {
    let d = 0;
    for (const b of this.buffs) d += b.defense ?? 0;
    return d;
  }

  get stunned(): boolean {
    return this.buffs.some((b) => b.stunned);
  }

  get rangePenalty(): number {
    return this.buffs.reduce((m, b) => Math.max(m, b.rangePenalty ?? 0), 0);
  }

  addBuff(buff: Buff): void {
    // Refresh existing buff of same id instead of stacking infinitely.
    const existing = this.buffs.find((b) => b.id === buff.id);
    if (existing) {
      existing.turns = Math.max(existing.turns, buff.turns);
    } else {
      this.buffs.push({ ...buff });
      if (buff.maxHp) {
        this.maxHp += buff.maxHp;
        this.hp += buff.maxHp;
      }
    }
  }

  /** Decrement buff timers at the owner's turn start; remove expired ones. */
  tickBuffs(): void {
    const kept: Buff[] = [];
    for (const b of this.buffs) {
      b.turns -= 1;
      if (b.turns > 0) {
        kept.push(b);
      } else if (b.maxHp) {
        // remove temporary max-hp bonus
        this.maxHp = Math.max(1, this.maxHp - b.maxHp);
        this.hp = Math.min(this.hp, this.maxHp);
      }
    }
    this.buffs = kept;
  }

  /** Apply damage; returns true if the piece is destroyed (hp <= 0). */
  damage(amount: number): boolean {
    const dealt = Math.max(0, amount - this.defense);
    this.hp -= dealt;
    return this.hp <= 0;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
