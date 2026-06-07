import type { Player } from '../core/types';
import type { GameManager } from '../core/GameManager';

/**
 * Playable commander. Each grants a permanent パッシブ (passive) applied at game
 * start, an optional per-turn passive hook, and an active 奥義 (ultimate) with a
 * cooldown. All effects are expressed via the GameManager public API so new
 * characters can be added here without touching the engine.
 */
export interface CharacterDef {
  id: string;
  name: string;
  title: string; // flavour subtitle
  color: string; // theme colour (hex string)
  emblem: string; // single-kanji portrait glyph
  quote: string; // shown on the select screen

  passiveName: string;
  passiveDesc: string;
  ultimateName: string;
  ultimateDesc: string;
  ultimateCooldown: number;

  /** AI usage hint: offensive ults fire ASAP, defensive ults wait for low HP. */
  aiHint: 'offense' | 'defense';

  /** Applied once, at game start. */
  applyPassive: (game: GameManager, owner: Player) => void;
  /** Applied at the start of each of the owner's turns (optional). */
  onTurnStart?: (game: GameManager, owner: Player) => void;
  /** Applied when the ultimate is activated. */
  applyUltimate: (game: GameManager, owner: Player) => void;
}

export const CHARACTERS: CharacterDef[] = [
  // ───────────────────────────────────────── 上杉謙信
  {
    id: 'uesugi',
    name: '上杉謙信',
    title: '軍神',
    color: '#2e86de',
    emblem: '毘',
    quote: '「武士道において、義を貫く」',
    passiveName: '毘沙門天の加護',
    passiveDesc: '自軍すべてのコマの攻撃が永続的に+1（召喚した特殊コマにも適用）。',
    ultimateName: '車懸かりの陣',
    ultimateDesc: 'このターン追加で2回行動でき、自軍全コマの攻撃が+2（2ターン）。',
    ultimateCooldown: 5,
    aiHint: 'offense',
    applyPassive: (g, o) => g.addArmyMod(o, { id: 'uesugi-atk', label: '毘沙門天', turns: Infinity, atk: 1 }),
    applyUltimate: (g, o) => {
      g.grantExtraActions(o, 2);
      g.buffOwnPieces(o, { id: 'kuruma', label: '車懸かり', turns: 2, atk: 2 });
    },
  },

  // ───────────────────────────────────────── オタワさん（古典教師モード）
  {
    id: 'otawa',
    name: 'オタワさん',
    title: '古典教師モード',
    color: '#8e44ad',
    emblem: '古',
    quote: '「はい、ここ抜き打ちで小テストね」',
    passiveName: '抜き打ち小テスト',
    passiveDesc: '毎ターン開始時、35%でランダムな敵コマ1体が「居眠り」して行動不能になる。',
    ultimateName: '抜き打ち期末試験・古典',
    ultimateDesc: '全ての敵コマを1ターン行動不能にし、相手の本拠地に3ダメージ（赤点ショック）。',
    ultimateCooldown: 6,
    aiHint: 'offense',
    applyPassive: () => {
      /* passive is handled per-turn below */
    },
    onTurnStart: (g, o) => {
      if (Math.random() < 0.35) {
        const target = g.randomEnemyPiece(o, (p) => p.type !== 'king');
        if (target) {
          target.addBuff({ id: 'nap', label: '居眠り', turns: 2, stunned: true });
          g.log(`${target.name}が古典の授業で居眠り…！`, true);
        }
      }
    },
    applyUltimate: (g, o) => {
      g.stunEnemies(o, 2, true);
      g.damageHome(g.foeOf(o), 3);
    },
  },

  // ───────────────────────────────────────── 武田四天王・風
  {
    id: 'takeda-fu',
    name: '武田・風',
    title: '疾如風（風林火山・極）',
    color: '#16c79a',
    emblem: '風',
    quote: '「疾きこと風の如く」',
    passiveName: '疾きこと風の如し',
    passiveDesc: '毎ターン開始時、30%で追加行動を1回得る。',
    ultimateName: '風の陣・極',
    ultimateDesc: 'このターン追加で3回行動でき、自軍全コマの攻撃が+1（2ターン）。',
    ultimateCooldown: 5,
    aiHint: 'offense',
    applyPassive: () => {},
    onTurnStart: (g, o) => {
      if (Math.random() < 0.3) {
        g.grantExtraActions(o, 1);
        g.log('疾風！ 追加行動を得た', false);
      }
    },
    applyUltimate: (g, o) => {
      g.grantExtraActions(o, 3);
      g.buffOwnPieces(o, { id: 'kaze', label: '風の陣', turns: 2, atk: 1 });
    },
  },

  // ───────────────────────────────────────── 武田四天王・林
  {
    id: 'takeda-rin',
    name: '武田・林',
    title: '徐如林（風林火山・極）',
    color: '#27ae60',
    emblem: '林',
    quote: '「徐かなること林の如く」',
    passiveName: '徐かなること林の如し',
    passiveDesc: '自軍すべてのコマの防御が永続的に+1（被ダメージ-1）。',
    ultimateName: '林の陣・極',
    ultimateDesc: '本拠地HPを10回復、自軍に守護（防御+2/2ターン）、自陣に回復マスを2つ展開。',
    ultimateCooldown: 5,
    aiHint: 'defense',
    applyPassive: (g, o) => g.addArmyMod(o, { id: 'rin-def', label: '林の守り', turns: Infinity, defense: 1 }),
    applyUltimate: (g, o) => {
      g.healHome(o, 10);
      g.buffOwnPieces(o, { id: 'rin-aura', label: '林の守護', turns: 2, defense: 2 });
      g.addTiles('heal', 2, 'mine');
    },
  },

  // ───────────────────────────────────────── 武田四天王・火
  {
    id: 'takeda-ka',
    name: '武田・火',
    title: '侵掠如火（風林火山・極）',
    color: '#e74c3c',
    emblem: '火',
    quote: '「侵掠すること火の如く」',
    passiveName: '侵掠すること火の如し',
    passiveDesc: '自軍の攻撃が永続的に+1。敵コマを取るたび、相手の本拠地に1ダメージ（飛び火）。',
    ultimateName: '火の陣・極',
    ultimateDesc: '敵陣に溶岩マスを3つ生成し、相手の本拠地に5ダメージ。',
    ultimateCooldown: 5,
    aiHint: 'offense',
    applyPassive: (g, o) => {
      g.addArmyMod(o, { id: 'ka-atk', label: '火の勢い', turns: Infinity, atk: 1 });
      g.addPassive(o, 'fire-spread', '飛び火', '敵を取ると相手本拠地に1ダメージ', 'epic');
    },
    applyUltimate: (g, o) => {
      g.addTiles('lava', 3, 'foe');
      g.damageHome(g.foeOf(o), 5);
    },
  },

  // ───────────────────────────────────────── 武田四天王・山
  {
    id: 'takeda-yama',
    name: '武田・山',
    title: '不動如山（風林火山・極）',
    color: '#b8860b',
    emblem: '山',
    quote: '「動かざること山の如く」',
    passiveName: '動かざること山の如し',
    passiveDesc: '自軍コマの最大HP+1、本拠地の最大HP+12（開始時に全回復）。',
    ultimateName: '山の陣・極',
    ultimateDesc: '本拠地と自軍全コマを全回復し、自軍に鉄壁（防御+3/2ターン）を付与。',
    ultimateCooldown: 6,
    aiHint: 'defense',
    applyPassive: (g, o) => {
      g.boostHomeMax(o, 12);
      g.healHome(o, 12);
      g.addArmyMod(o, { id: 'yama-hp', label: '山の体', turns: Infinity, maxHp: 1 });
    },
    applyUltimate: (g, o) => {
      g.healHome(o, 999);
      g.healAllOwn(o, 99);
      g.buffOwnPieces(o, { id: 'yama-wall', label: '不動の壁', turns: 2, defense: 3 });
    },
  },
];

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacterDef(id: string): CharacterDef {
  return CHARACTER_BY_ID.get(id) ?? CHARACTERS[0];
}

/** Pick a random character other than `excludeId` (for the AI). */
export function randomCharacterExcept(excludeId: string): CharacterDef {
  const pool = CHARACTERS.filter((c) => c.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)];
}
