import { Board, type Move } from './Board';
import { Piece } from './Piece';
import {
  type Player, type Vec2, type TileType, type ActionLog, type Buff, type Rarity,
  opponentOf,
} from './types';
import { BOARD_SIZE, START_HOME_HP } from './constants';
import { getDef, SUMMONABLE_SPECIALS, PAWN_EVOLUTIONS, type PieceDef } from '../data/pieceData';
import { rollCards, type AbilityDef } from '../data/abilityData';
import { SpecialEffectManager } from './SpecialEffectManager';
import { AIController } from './AIController';

export type Phase = 'card' | 'play' | 'ai' | 'over';

export interface PassiveEntry {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
}

export interface PlayerState {
  who: Player;
  homeHp: number;
  maxHomeHp: number;
  hand: Record<string, number>; // pieceType -> count (droppable pieces in hand)
  passives: PassiveEntry[];
  abilityLog: { name: string; rarity: Rarity }[];
  rarityBonus: number; // 神託 carry-over for the next card offer
}

export interface GameEvents {
  onState: () => void;
  onCards: (cards: AbilityDef[] | null, actor: Player) => void;
  onLog: (entry: ActionLog) => void;
  onGameOver: (winner: Player) => void;
  onMessage: (text: string) => void;
}

export interface Highlight {
  pos: Vec2;
  kind: 'select' | 'move' | 'attack' | 'smite';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Orchestrates the whole game: turn flow, ability offers, move resolution,
 * win conditions. Rendering & DOM live elsewhere and are notified via events.
 */
export class GameManager {
  board = new Board();
  effects = new SpecialEffectManager(this);
  ai = new AIController(this);

  players: Record<Player, PlayerState> = {
    player: this.freshState('player'),
    ai: this.freshState('ai'),
  };

  turn: Player = 'player';
  turnNumber = 1;
  phase: Phase = 'play';
  /** The side currently picking a card / applying an ability. */
  actor: Player = 'player';

  selected: Piece | null = null;
  legalTargets: Vec2[] = [];
  pendingCards: AbilityDef[] | null = null;

  /** Actions left for the side currently moving (extra actions add to this). */
  actionsLeft = 1;
  smiteMode = false;
  /** Hand-drop staging: pieceType chosen from hand, awaiting a destination. */
  dropType: string | null = null;

  logs: ActionLog[] = [];
  winner: Player | null = null;
  private idCounter = 0;

  constructor(private events: GameEvents) {}

  private freshState(who: Player): PlayerState {
    return {
      who,
      homeHp: START_HOME_HP,
      maxHomeHp: START_HOME_HP,
      hand: {},
      passives: [],
      abilityLog: [],
      rarityBonus: 0,
    };
  }

  get foe(): Player {
    return opponentOf(this.actor);
  }

  // ---------------------------------------------------------------- setup
  start(): void {
    this.setupInitialPosition();
    this.log('ゲーム開始！ ローグライク将棋へようこそ。', true);
    this.beginTurn('player');
  }

  private setupInitialPosition(): void {
    // Standard shogi layout. AI on top (rows 0-2), player at bottom (rows 6-8).
    const backRank: Array<[number, Piece['type']]> = [
      [0, 'lance'], [1, 'knight'], [2, 'silver'], [3, 'gold'],
      [4, 'king'], [5, 'gold'], [6, 'silver'], [7, 'knight'], [8, 'lance'],
    ];
    for (const [col, type] of backRank) {
      this.spawn(type, 'ai', 0, col);
      this.spawn(type, 'player', 8, col);
    }
    // Rook & bishop
    this.spawn('bishop', 'ai', 1, 7);
    this.spawn('rook', 'ai', 1, 1);
    this.spawn('bishop', 'player', 7, 1);
    this.spawn('rook', 'player', 7, 7);
    // Pawns
    for (let c = 0; c < BOARD_SIZE; c++) {
      this.spawn('pawn', 'ai', 2, c);
      this.spawn('pawn', 'player', 6, c);
    }
  }

  private spawn(type: Piece['type'], owner: Player, row: number, col: number): Piece {
    const p = new Piece(type, owner, row, col);
    this.board.place(p, row, col);
    return p;
  }

  // ---------------------------------------------------------------- turn flow
  private beginTurn(side: Player): void {
    this.turn = side;
    this.actor = side;
    this.actionsLeft = 1;
    this.selected = null;
    this.legalTargets = [];
    this.smiteMode = false;
    this.dropType = null;

    // Start-of-turn upkeep for this side's pieces.
    for (const p of this.board.piecesOf(side)) {
      p.tickBuffs();
      if (p.cooldown > 0) p.cooldown -= 1;
    }
    this.effects.applyAuras(side); // king's-pressure etc. recomputed each turn

    // Offer a roguelike ability card.
    const state = this.players[side];
    const cards = rollCards(3, state.rarityBonus);
    state.rarityBonus = 0;

    if (side === 'player') {
      this.phase = 'card';
      this.pendingCards = cards;
      this.events.onCards(cards, side);
      this.events.onState();
    } else {
      // AI silently picks the best card, then acts.
      this.phase = 'ai';
      const choice = this.ai.chooseCard(cards);
      this.applyAbility(choice, 'ai');
      void this.runAITurn();
    }
  }

  /** Player selects one of the three offered cards. */
  chooseCard(index: number): void {
    if (this.phase !== 'card' || !this.pendingCards) return;
    const card = this.pendingCards[index];
    if (!card) return;
    this.pendingCards = null;
    this.events.onCards(null, 'player');
    this.applyAbility(card, 'player');
    this.phase = 'play';
    this.events.onState();
  }

  private applyAbility(card: AbilityDef, who: Player): void {
    this.actor = who;
    const st = this.players[who];
    st.abilityLog.unshift({ name: card.name, rarity: card.rarity });
    if (st.abilityLog.length > 12) st.abilityLog.pop();
    this.log(`${who === 'player' ? 'あなた' : 'AI'}は「${card.name}」を獲得！`, true);
    try {
      card.apply(this);
    } catch (e) {
      console.error('ability failed', card.id, e);
    }
    this.events.onState();
  }

  // ---------------------------------------------------------------- input
  handleCellClick(row: number, col: number): void {
    if (this.phase !== 'play' || this.winner) return;
    const clicked = this.board.at(row, col);

    // God smite targeting mode.
    if (this.smiteMode) {
      if (clicked && clicked.owner !== 'player' && clicked.type !== 'king') {
        this.performSmite(clicked);
      } else {
        this.events.onMessage('消滅対象は敵コマ（王将以外）を選んでください');
      }
      return;
    }

    // Dropping a piece from hand.
    if (this.dropType) {
      if (!clicked && this.canDropAt(this.dropType, 'player', row, col)) {
        this.doDrop(this.dropType, 'player', row, col);
      } else {
        this.events.onMessage('そのマスには打てません');
      }
      return;
    }

    // Move a previously selected piece.
    if (this.selected && this.legalTargets.some((t) => t.row === row && t.col === col)) {
      this.commitMove(this.selected, { row, col });
      return;
    }

    // Select one of your own pieces.
    if (clicked && clicked.owner === 'player') {
      this.selectPiece(clicked);
    } else {
      this.clearSelection();
    }
  }

  selectPiece(p: Piece): void {
    this.selected = p;
    this.dropType = null;
    this.legalTargets = this.board.movesFor(p);
    this.events.onState();
  }

  clearSelection(): void {
    this.selected = null;
    this.legalTargets = [];
    this.dropType = null;
    this.events.onState();
  }

  /** Player clicks a hand piece to begin a drop. */
  beginDrop(type: string): void {
    if (this.phase !== 'play') return;
    if ((this.players.player.hand[type] ?? 0) <= 0) return;
    this.selected = null;
    this.legalTargets = [];
    this.dropType = type;
    this.events.onState();
  }

  beginSmite(): void {
    if (this.phase !== 'play') return;
    const god = this.board.piecesOf('player').find((p) => p.type === 'god' && p.cooldown === 0);
    if (!god) {
      this.events.onMessage('消滅能力が使える神がいません');
      return;
    }
    this.smiteMode = true;
    this.events.onMessage('消滅させる敵コマをクリック');
    this.events.onState();
  }

  taunt(): void {
    if (this.phase !== 'play') return;
    this.tauntNuisances('player');
    this.events.onState();
  }

  // ---------------------------------------------------------------- moves
  private commitMove(piece: Piece, to: Vec2): void {
    const result = this.applyMove(piece, to);
    this.afterAction(piece, result.extraAction);
  }

  /**
   * Apply a board move with capture / bounce / promotion / tile resolution.
   * Returns whether the move grants an extra action (ninja backstab).
   */
  applyMove(piece: Piece, to: Vec2): { captured: Piece | null; extraAction: boolean } {
    const from: Vec2 = { row: piece.row, col: piece.col };
    const target = this.board.at(to.row, to.col);
    let captured: Piece | null = null;
    let moved = true;

    if (target && target.owner !== piece.owner) {
      // Melee resolution: instant capture if the blow is lethal, else bounce.
      const lethal = target.type === 'king' || target.hp <= piece.attack;
      if (lethal) {
        captured = target;
        this.killPiece(target, piece.owner);
        if (!this.winner) this.board.relocate(piece, to.row, to.col);
      } else {
        target.damage(piece.attack);
        this.log(`${piece.name}の攻撃！ ${target.name}に${piece.attack}ダメージ`, false);
        moved = false; // bounced off a tanky piece
      }
    } else {
      this.board.relocate(piece, to.row, to.col);
    }

    let extraAction = false;
    if (moved && !this.winner) {
      this.handlePromotion(piece, from);
      this.handleTileEnter(piece);
      this.handleBreach(piece, from);
      // Ninja backstab: a capturing ninja gets to act again.
      if (piece.type === 'ninja' && captured) extraAction = true;
      if (piece.extraActionAvailable) { extraAction = true; piece.extraActionAvailable = false; }
    }
    this.events.onState();
    return { captured, extraAction };
  }

  private handlePromotion(piece: Piece, from: Vec2): void {
    const def = piece.def;
    if (!def.promotable || piece.promoted) return;
    const enteredZone =
      this.board.inPromotionZone(piece.owner, piece.row) ||
      this.board.inPromotionZone(piece.owner, from.row);
    if (!enteredZone) return;

    if (piece.type === 'pawn' && this.hasPassive(piece.owner, 'pawn-evolution')) {
      const evo = PAWN_EVOLUTIONS[Math.floor(Math.random() * PAWN_EVOLUTIONS.length)];
      this.transform(piece, evo);
      this.log(`歩兵が${getDef(evo).name}に進化！`, true);
    } else {
      piece.promoted = true;
      this.log(`${piece.name}が成った！`, false);
    }
  }

  /** Replace a piece's type in place (used by pawn evolution). */
  private transform(piece: Piece, type: Piece['type']): void {
    piece.type = type;
    piece.promoted = false;
    const def = getDef(type);
    piece.maxHp = def.maxHp;
    piece.hp = def.maxHp;
    piece.cooldown = def.cooldown ?? 0;
  }

  /** A piece that reaches the enemy back rank breaches their base (home damage). */
  private handleBreach(piece: Piece, from: Vec2): void {
    const backRank = piece.owner === 'player' ? 0 : BOARD_SIZE - 1;
    if (piece.row === backRank && from.row !== backRank) {
      const dmg = Math.max(1, piece.attack);
      this.damageHome(opponentOf(piece.owner), dmg);
      this.log(`${piece.name}が敵本拠地に突入！ ${dmg}ダメージ`, true);
    }
  }

  private handleTileEnter(piece: Piece): void {
    const tile = this.board.tileAt(piece.row, piece.col);
    switch (tile) {
      case 'heal':
        piece.heal(1);
        if (piece.type === 'king') this.healHome(piece.owner, 2);
        this.log(`${piece.name}が回復マスで癒やされた`, false);
        break;
      case 'trap':
        this.log(`${piece.name}が罠マスにかかった！`, false);
        piece.addBuff({ id: 'trap', label: '罠', turns: 2, stunned: true });
        if (piece.damage(1)) this.killPiece(piece);
        break;
      case 'curse':
        piece.addBuff({ id: 'curse', label: '呪い', turns: 2, stunned: true });
        this.log(`${piece.name}が呪いマスで行動不能に…`, false);
        break;
      case 'warp': {
        const partner = this.board.warpLinks.get(`${piece.row},${piece.col}`);
        if (partner && !this.board.at(partner.row, partner.col)) {
          this.board.relocate(piece, partner.row, partner.col);
          this.log(`${piece.name}がワープした！`, false);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Common post-action bookkeeping for both player & AI single actions. */
  private afterAction(_piece: Piece, extraAction: boolean): void {
    if (this.winner) return;
    if (extraAction) this.actionsLeft += 1;
    this.actionsLeft -= 1;
    this.clearSelectionState();
    if (this.turn === 'player') {
      if (this.actionsLeft > 0 && this.hasAnyMove('player')) {
        this.phase = 'play';
        this.events.onState();
      } else {
        void this.endPlayerTurn();
      }
    }
  }

  private clearSelectionState(): void {
    this.selected = null;
    this.legalTargets = [];
    this.smiteMode = false;
    this.dropType = null;
  }

  private hasAnyMove(side: Player): boolean {
    return this.board.piecesOf(side).some((p) => this.board.movesFor(p).length > 0) ||
      Object.values(this.players[side].hand).some((n) => n > 0);
  }

  private async endPlayerTurn(): Promise<void> {
    this.clearSelectionState();
    this.events.onState();
    await sleep(150);
    this.effects.resolveEndOfTurn('player');
    this.events.onState();
    if (this.winner) return;
    this.turnNumber += 1;
    this.beginTurn('ai');
  }

  // ---------------------------------------------------------------- AI turn
  private async runAITurn(): Promise<void> {
    this.events.onState();
    await sleep(450);

    // God smite if available.
    const god = this.board.piecesOf('ai').find((p) => p.type === 'god' && p.cooldown === 0);
    if (god) {
      const tgt = this.ai.chooseSmiteTarget();
      if (tgt) {
        this.performSmite(tgt, god);
        await sleep(400);
      }
    }

    let safety = 0;
    while (this.actionsLeft > 0 && !this.winner && safety++ < 6) {
      const action = this.ai.chooseAction();
      if (!action) break;
      if (action.kind === 'drop') {
        this.doDrop(action.type, 'ai', action.to.row, action.to.col);
        this.actionsLeft -= 1;
      } else {
        const res = this.applyMove(action.piece, action.to);
        if (res.extraAction) this.actionsLeft += 1;
        this.actionsLeft -= 1;
      }
      this.events.onState();
      await sleep(450);
    }

    if (this.winner) return;
    this.effects.resolveEndOfTurn('ai');
    this.events.onState();
    if (this.winner) return;
    await sleep(200);
    this.turnNumber += 1;
    this.beginTurn('player');
  }

  // ---------------------------------------------------------------- smite (god)
  private performSmite(target: Piece, god?: Piece): void {
    const g = god ?? this.board.piecesOf(this.turn).find((p) => p.type === 'god' && p.cooldown === 0);
    if (!g) return;
    this.log(`神の裁き！ ${target.name}が消滅した`, true);
    this.killPiece(target, g.owner);
    g.cooldown = g.def.cooldown ?? 3;
    if (this.turn === 'player') {
      this.afterAction(g, false);
    }
  }

  // ---------------------------------------------------------------- death
  /** Remove/replace a piece, resolving on-death special behaviour. */
  killPiece(piece: Piece, killer?: Player): void {
    if (this.board.at(piece.row, piece.col) !== piece) return; // already gone

    if (piece.type === 'king') {
      this.board.remove(piece);
      this.setWinner(opponentOf(piece.owner), `${piece.owner === 'player' ? 'あなた' : 'AI'}の王将が討たれた`);
      return;
    }

    // Phoenix revives once instead of dying.
    if (piece.hasTag('revive') && piece.reviveAvailable) {
      piece.reviveAvailable = false;
      const cell = this.board.findEmptyCell(this.board.homeRows(piece.owner));
      this.board.remove(piece);
      if (cell) {
        piece.hp = piece.maxHp;
        this.board.place(piece, cell.row, cell.col);
        this.log(`${piece.name}が灰から蘇った！`, true);
      }
      return;
    }

    this.board.remove(piece);

    // On-death effects.
    if (piece.hasTag('death-explosion')) {
      this.log(`${piece.name}が爆発！ 周囲を巻き込む`, true);
      for (const v of this.board.squaresInRange({ row: piece.row, col: piece.col }, 1)) {
        const victim = this.board.at(v.row, v.col);
        if (victim && victim.damage(2)) this.killPiece(victim, killer);
      }
    }
    if (piece.hasTag('death-curse') && killer) {
      const king = this.board.findKing(killer);
      if (king) king.addBuff({ id: 'poop', label: 'うんち投げ', turns: 2, stunned: true });
      this.log('いやなやつが王将にうんちを投げつけた！ 行動制限を受ける', true);
      this.damageHome(killer, 2);
    }
    if (piece.hasTag('god')) {
      this.log(`${piece.name}が倒れた！ 全コマに弱体化`, true);
      for (const p of this.board.piecesOf(piece.owner)) {
        p.addBuff({ id: 'godfall', label: '神の喪失', turns: 3, atk: -1, rangePenalty: 1 });
      }
    }

    // Captured droppable normal pieces go to the killer's hand (demoted).
    const def = piece.def;
    if (killer && def.droppable && !def.special) {
      const hand = this.players[killer].hand;
      hand[piece.type] = (hand[piece.type] ?? 0) + 1;
    }
  }

  private setWinner(who: Player, reason: string): void {
    if (this.winner) return;
    this.winner = who;
    this.phase = 'over';
    this.log(`${reason} — ${who === 'player' ? 'あなたの勝利！' : 'AIの勝利…'}`, true);
    this.events.onGameOver(who);
    this.events.onState();
  }

  // ================================================================
  // Ability API — these methods are the surface used by abilityData.ts
  // ================================================================
  log(text: string, important = false): void {
    const entry: ActionLog = { text, important };
    this.logs.unshift(entry);
    if (this.logs.length > 60) this.logs.pop();
    this.events.onLog(entry);
  }

  healHome(owner: Player, n: number): void {
    const st = this.players[owner];
    st.homeHp = Math.min(st.maxHomeHp, st.homeHp + n);
    this.log(`${owner === 'player' ? 'あなた' : 'AI'}の本拠地が${n}回復`, false);
  }

  damageHome(owner: Player, n: number): void {
    const st = this.players[owner];
    st.homeHp -= n;
    this.log(`${owner === 'player' ? 'あなた' : 'AI'}の本拠地に${n}ダメージ`, true);
    if (st.homeHp <= 0) {
      st.homeHp = 0;
      this.setWinner(opponentOf(owner), `${owner === 'player' ? 'あなた' : 'AI'}の本拠地が陥落`);
    }
  }

  boostHomeMax(owner: Player, n: number): void {
    this.players[owner].maxHomeHp += n;
  }

  addPassive(owner: Player, id: string, name: string, desc: string, rarity: Rarity): void {
    const st = this.players[owner];
    if (!st.passives.some((p) => p.id === id)) {
      st.passives.push({ id, name, desc, rarity });
    }
  }

  hasPassive(owner: Player, id: string): boolean {
    return this.players[owner].passives.some((p) => p.id === id);
  }

  boostNextCardRarity(n: number): void {
    this.players[this.actor].rarityBonus += n;
    this.log('神託：次のカードが良くなる予感…', false);
  }

  grantExtraActions(owner: Player, n: number): void {
    if (owner === this.turn) this.actionsLeft += n;
    this.log(`追加行動 +${n}！`, true);
  }

  upgradeRandomPiece(owner: Player): void {
    const list = this.board.piecesOf(owner).filter((p) => p.type !== 'king');
    if (!list.length) return;
    const p = list[Math.floor(Math.random() * list.length)];
    p.addBuff({ id: `up${this.idCounter++}`, label: '強化', turns: Infinity, atk: 1, maxHp: 1 });
    this.log(`${p.name}が強化された (攻+1 / HP+1)`, false);
  }

  buffOwnPieces(owner: Player, b: Buff, filter?: (p: Piece) => boolean): void {
    for (const p of this.board.piecesOf(owner)) {
      if (!filter || filter(p)) p.addBuff({ ...b, id: `${b.id}_${p.id}` });
    }
    this.log(`自軍に「${b.label}」を付与`, false);
  }

  glassCannon(owner: Player): void {
    for (const p of this.board.piecesOf(owner)) {
      if (p.type === 'king') continue;
      p.maxHp = 1;
      p.hp = 1;
      p.addBuff({ id: `glass_${p.id}`, label: 'ガラスの大砲', turns: Infinity, atk: 3 });
    }
    this.log('ガラスの大砲！ 攻撃は最大、守りは最小', true);
  }

  randomEnemyPiece(owner: Player, pred?: (p: Piece) => boolean): Piece | undefined {
    const foes = this.board.piecesOf(opponentOf(owner)).filter((p) => !pred || pred(p));
    return foes.length ? foes[Math.floor(Math.random() * foes.length)] : undefined;
  }

  convertPiece(piece: Piece, newOwner: Player): void {
    if (piece.type === 'king') return;
    piece.owner = newOwner;
    piece.buffs = [];
    this.log(`${piece.name}が寝返った！`, true);
  }

  tauntNuisances(owner: Player): void {
    const pests = this.board.allPieces().filter((p) => p.type === 'nuisance' && p.owner !== owner);
    if (!pests.length) {
      this.log('罵詈雑言を浴びせたが、対象がいなかった', false);
      return;
    }
    for (const p of pests) this.board.remove(p);
    this.log(`罵詈雑言！ いやなやつ${pests.length}体が泣きべそをかいて逃げ出した`, true);
  }

  // ----- spawning -----
  spawnNearHome(type: Piece['type'], owner: Player): Piece | null {
    return this.spawnInRows(type, owner, this.preferredSpawnRows(owner));
  }

  spawnNearEnemy(type: Piece['type'], owner: Player): Piece | null {
    return this.spawnInRows(type, owner, this.board.homeRows(opponentOf(owner)));
  }

  spawnRandomSpecialNearHome(owner: Player): Piece | null {
    const t = SUMMONABLE_SPECIALS[Math.floor(Math.random() * SUMMONABLE_SPECIALS.length)];
    return this.spawnNearHome(t, owner);
  }

  private preferredSpawnRows(owner: Player): number[] {
    // Prefer summon-circle tiles, then home rows, then the whole half.
    const summons: number[] = [];
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (this.board.tiles[r][c] === 'summon' && !this.board.at(r, c) &&
          this.halfRows(owner).includes(r)) summons.push(r);
    return [...new Set([...summons, ...this.board.homeRows(owner), ...this.halfRows(owner)])];
  }

  private spawnInRows(type: Piece['type'], owner: Player, rows: number[]): Piece | null {
    const cell = this.board.findEmptyCell(rows);
    if (!cell) {
      this.log('召喚スペースが無かった…', false);
      return null;
    }
    const p = this.spawn(type, owner, cell.row, cell.col);
    this.log(`${getDef(type).name}を召喚！`, true);
    this.events.onState();
    return p;
  }

  // ----- tiles -----
  halfRows(owner: Player): number[] {
    return owner === 'player' ? [5, 6, 7, 8] : [0, 1, 2, 3];
  }

  addTiles(type: TileType, count: number, side: 'mine' | 'foe' | 'any'): void {
    const rows = side === 'mine' ? this.halfRows(this.actor)
      : side === 'foe' ? this.halfRows(opponentOf(this.actor))
        : [...Array(BOARD_SIZE).keys()];
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < 200) {
      const row = rows[Math.floor(Math.random() * rows.length)];
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (this.board.tiles[row][col] !== 'normal') continue;
      this.board.setTile(row, col, type);
      placed++;
    }
    this.log(`特殊マス（${type}）を${placed}個生成`, false);
    this.events.onState();
  }

  addWarpPair(): void {
    const cells: Vec2[] = [];
    let guard = 0;
    while (cells.length < 2 && guard++ < 200) {
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (this.board.tiles[row][col] !== 'normal') continue;
      if (cells.some((c) => c.row === row && c.col === col)) continue;
      cells.push({ row, col });
    }
    if (cells.length === 2) {
      const [a, b] = cells;
      this.board.setTile(a.row, a.col, 'warp');
      this.board.setTile(b.row, b.col, 'warp');
      this.board.warpLinks.set(`${a.row},${a.col}`, b);
      this.board.warpLinks.set(`${b.row},${b.col}`, a);
      this.log('ワープマスのペアを生成', false);
    }
    this.events.onState();
  }

  // ----- drops -----
  canDropAt(type: string, owner: Player, row: number, col: number): boolean {
    if (this.board.at(row, col)) return false;
    if ((this.players[owner].hand[type] ?? 0) <= 0) return false;
    // Pawn can't be dropped on the last rank; keep it simple (no nifu check).
    if (type === 'pawn') {
      const backRank = owner === 'player' ? 0 : BOARD_SIZE - 1;
      if (row === backRank) return false;
    }
    if ((type === 'lance') && row === (owner === 'player' ? 0 : BOARD_SIZE - 1)) return false;
    return true;
  }

  doDrop(type: string, owner: Player, row: number, col: number): void {
    const hand = this.players[owner].hand;
    if ((hand[type] ?? 0) <= 0) return;
    hand[type] -= 1;
    if (hand[type] <= 0) delete hand[type];
    this.spawn(type as Piece['type'], owner, row, col);
    this.log(`${getDef(type as Piece['type']).name}を打った`, false);
    if (owner === 'player') this.afterAction(this.board.at(row, col)!, false);
    this.events.onState();
  }

  // ================================================================
  // Read API for renderer / UI
  // ================================================================
  getHighlights(): Highlight[] {
    const out: Highlight[] = [];
    if (this.selected) {
      out.push({ pos: { row: this.selected.row, col: this.selected.col }, kind: 'select' });
      for (const t of this.legalTargets) {
        const occ = this.board.at(t.row, t.col);
        out.push({ pos: t, kind: occ ? 'attack' : 'move' });
      }
    }
    if (this.smiteMode) {
      for (const p of this.board.piecesOf('ai')) {
        if (p.type !== 'king') out.push({ pos: { row: p.row, col: p.col }, kind: 'smite' });
      }
    }
    if (this.dropType) {
      for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
          if (this.canDropAt(this.dropType, 'player', r, c))
            out.push({ pos: { row: r, col: c }, kind: 'move' });
    }
    return out;
  }

  describePiece(p: Piece): string {
    const d: PieceDef = p.def;
    const lines = [
      `${d.name}${p.promoted ? '（成）' : ''}`,
      `所属: ${p.owner === 'player' ? 'あなた' : 'AI'}`,
      `HP: ${p.hp}/${p.maxHp}　攻撃: ${p.attack}`,
    ];
    if (d.immovable) lines.push('移動不可');
    if (d.attackRange) lines.push(`射程: ${d.attackRange}マス自動攻撃`);
    if (d.cooldown) lines.push(`特殊CD: ${p.cooldown}/${d.cooldown}`);
    if (p.buffs.length) lines.push('効果: ' + p.buffs.map((b) => b.label).join('・'));
    return lines.join('\n');
  }
}
