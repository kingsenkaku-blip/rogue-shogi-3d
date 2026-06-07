import type { Rarity, AbilityCategory, Buff } from '../core/types';
import type { GameManager } from '../core/GameManager';
import { PAWN_EVOLUTIONS } from './pieceData';

/**
 * Ability card definition. `apply` runs for `game.currentActor` (the side that
 * picked the card). Add a new object to ABILITIES to introduce a new card — the
 * card pool, rarity weighting and UI all pick it up automatically.
 */
export interface AbilityDef {
  id: string;
  name: string;
  rarity: Rarity;
  category: AbilityCategory;
  desc: string;
  apply: (game: GameManager) => void;
}

const buff = (id: string, label: string, turns: number, extra: Partial<Buff> = {}): Buff => ({
  id, label, turns, ...extra,
});

export const ABILITIES: AbilityDef[] = [
  // ============================================================ COMMON
  {
    id: 'reinforce', name: 'コマ強化', rarity: 'common', category: 'piece-upgrade',
    desc: 'ランダムな自分のコマ1体の攻撃と最大HPを+1。',
    apply: (g) => g.upgradeRandomPiece(g.actor),
  },
  {
    id: 'turret-deploy', name: 'タレット増設', rarity: 'common', category: 'summon',
    desc: '自陣に自動攻撃タレットを1つ設置する。',
    apply: (g) => g.spawnNearHome('turret', g.actor),
  },
  {
    id: 'iron-wall', name: '鉄壁の守り', rarity: 'common', category: 'base',
    desc: '本拠地HPを6回復し、自陣のコマの防御を2ターン強化。',
    apply: (g) => {
      g.healHome(g.actor, 6);
      g.buffOwnPieces(g.actor, buff('ironwall', '鉄壁', 2, { defense: 1 }),
        (p) => g.board.homeRows(g.actor).includes(p.row));
    },
  },
  {
    id: 'heal-tiles', name: '回復の祝福', rarity: 'common', category: 'board-gimmick',
    desc: '盤面に回復マスを2つ生成する。',
    apply: (g) => g.addTiles('heal', 2, 'any'),
  },
  {
    id: 'conscript', name: '徴兵', rarity: 'common', category: 'summon',
    desc: '自陣に歩兵を1つ追加召喚する。',
    apply: (g) => g.spawnNearHome('pawn', g.actor),
  },
  {
    id: 'first-aid', name: '応急手当', rarity: 'common', category: 'base',
    desc: '本拠地HPを4回復する。',
    apply: (g) => g.healHome(g.actor, 4),
  },

  // ============================================================ RARE
  {
    id: 'pawn-evolution', name: '歩兵進化', rarity: 'rare', category: 'passive',
    desc: '自分の歩が敵陣に入ると、成金ではなくランダムな特殊コマに進化する。',
    apply: (g) => g.addPassive(g.actor, 'pawn-evolution', '歩兵進化',
      '歩が敵陣で特殊コマに進化', 'rare'),
  },
  {
    id: 'kings-pressure', name: '王の威圧', rarity: 'rare', category: 'passive',
    desc: '自分の王将の周囲2マスにいる敵コマの移動範囲を狭める。',
    apply: (g) => g.addPassive(g.actor, 'kings-pressure', '王の威圧',
      '王の周囲2マスの敵を弱体化', 'rare'),
  },
  {
    id: 'oracle', name: '神託', rarity: 'rare', category: 'passive',
    desc: '次に表示される能力カードのレアリティが上がる。',
    apply: (g) => g.boostNextCardRarity(2),
  },
  {
    id: 'cursed-board', name: '呪いの盤面', rarity: 'rare', category: 'board-gimmick',
    desc: '呪いマスを3つ生成。止まったコマは次ターン行動不能になる。',
    apply: (g) => g.addTiles('curse', 3, 'foe'),
  },
  {
    id: 'summon-ninja', name: '忍者召喚', rarity: 'rare', category: 'summon',
    desc: '忍者を1体召喚する。',
    apply: (g) => g.spawnNearHome('ninja', g.actor),
  },
  {
    id: 'trap-field', name: '罠設置', rarity: 'rare', category: 'sabotage',
    desc: '敵陣寄りに罠マスを3つ設置する。',
    apply: (g) => g.addTiles('trap', 3, 'foe'),
  },
  {
    id: 'warp-gates', name: 'ワープ門', rarity: 'rare', category: 'board-gimmick',
    desc: 'ワープマスのペアを生成する。',
    apply: (g) => g.addWarpPair(),
  },
  {
    id: 'war-horn', name: '突撃ラッパ', rarity: 'rare', category: 'temp-buff',
    desc: 'このターン、自分の全コマの攻撃が+1（2ターン）。',
    apply: (g) => g.buffOwnPieces(g.actor, buff('warhorn', '突撃', 2, { atk: 1 })),
  },

  // ============================================================ EPIC
  {
    id: 'double-act', name: '二回行動', rarity: 'epic', category: 'temp-buff',
    desc: 'このターン、追加で1回行動できる。',
    apply: (g) => g.grantExtraActions(g.actor, 1),
  },
  {
    id: 'mutiny', name: '駒の反乱', rarity: 'epic', category: 'sabotage',
    desc: '敵の低レアコマ1体を味方に寝返らせる。',
    apply: (g) => {
      const target = g.randomEnemyPiece(g.actor, (p) => p.def.value <= 6 && p.type !== 'king');
      if (target) g.convertPiece(target, g.actor);
      else g.log('反乱させられる敵コマがいなかった…', false);
    },
  },
  {
    id: 'summon-golem', name: '重装召喚', rarity: 'epic', category: 'summon',
    desc: 'HPの高いゴーレムを召喚する。',
    apply: (g) => g.spawnNearHome('golem', g.actor),
  },
  {
    id: 'board-expansion', name: '盤面拡張', rarity: 'epic', category: 'board-gimmick',
    desc: 'ワープ・回復・罠・召喚陣などの特殊マスを盤面に追加する。',
    apply: (g) => {
      g.addWarpPair();
      g.addTiles('heal', 1, 'mine');
      g.addTiles('summon', 1, 'mine');
      g.addTiles('trap', 1, 'foe');
    },
  },
  {
    id: 'lava-flow', name: '溶岩流', rarity: 'epic', category: 'sabotage',
    desc: '敵陣に溶岩マスを3つ生成。ターン終了時に上のコマへダメージ。',
    apply: (g) => g.addTiles('lava', 3, 'foe'),
  },
  {
    id: 'summon-phoenix', name: '不死鳥召喚', rarity: 'epic', category: 'summon',
    desc: '一度だけ復活する不死鳥を召喚する。',
    apply: (g) => g.spawnNearHome('phoenix', g.actor),
  },
  {
    id: 'sanctuary', name: '神域展開', rarity: 'epic', category: 'board-gimmick',
    desc: '自陣に神域マスを生成。神系コマを強化し、通常コマを弱化する。',
    apply: (g) => g.addTiles('sanctuary', 2, 'mine'),
  },

  // ============================================================ LEGENDARY
  {
    id: 'summon-god', name: '神召喚', rarity: 'legendary', category: 'summon',
    desc: '神を召喚する。ただし本拠地HPを8消費する。3ターンに1度、敵コマを消滅させられる。',
    apply: (g) => {
      if (g.spawnNearHome('god', g.actor)) g.damageHome(g.actor, 8);
    },
  },
  {
    id: 'great-fortify', name: '大要塞', rarity: 'legendary', category: 'base',
    desc: '本拠地の最大HPを+12し、全回復する。',
    apply: (g) => {
      g.boostHomeMax(g.actor, 12);
      g.healHome(g.actor, 999);
    },
  },
  {
    id: 'army-upgrade', name: '全軍強化', rarity: 'legendary', category: 'piece-upgrade',
    desc: '自分の全コマの攻撃と最大HPを永続的に+1。',
    apply: (g) => g.buffOwnPieces(g.actor,
      buff('army', '全軍強化', Infinity, { atk: 1, maxHp: 1 })),
  },
  {
    id: 'assassin-squad', name: '暗殺部隊', rarity: 'legendary', category: 'summon',
    desc: '暗殺者を2体召喚する。',
    apply: (g) => { g.spawnNearHome('assassin', g.actor); g.spawnNearHome('assassin', g.actor); },
  },
  {
    id: 'time-warp', name: '神速', rarity: 'legendary', category: 'temp-buff',
    desc: 'このターン、追加で2回行動できる。',
    apply: (g) => g.grantExtraActions(g.actor, 2),
  },
  {
    id: 'holy-host', name: '聖団', rarity: 'legendary', category: 'summon',
    desc: '僧侶と盾衛を召喚する。',
    apply: (g) => { g.spawnNearHome('healer', g.actor); g.spawnNearHome('shieldbearer', g.actor); },
  },

  // ============================================================ CURSED
  {
    id: 'forbidden-summon', name: '禁断召喚', rarity: 'cursed', category: 'summon',
    desc: '神を即座に召喚するが、自分の王将に弱体化を付与する。',
    apply: (g) => {
      if (g.spawnNearHome('god', g.actor)) {
        const king = g.board.findKing(g.actor);
        king?.addBuff(buff('forbidden', '禁断の代償', Infinity, { rangePenalty: 1, atk: -1 }));
        g.log('禁断召喚！ 王将が弱体化した…', true);
      }
    },
  },
  {
    id: 'blood-pact', name: '血の契約', rarity: 'cursed', category: 'piece-upgrade',
    desc: '全コマの攻撃を+2するが、本拠地HPを10失う。',
    apply: (g) => {
      g.buffOwnPieces(g.actor, buff('bloodpact', '血の契約', Infinity, { atk: 2 }));
      g.damageHome(g.actor, 10);
    },
  },
  {
    id: 'plague', name: '疫病', rarity: 'cursed', category: 'sabotage',
    desc: '敵陣に「いやなやつ」を放つ。放置すると増殖する。',
    apply: (g) => g.spawnNearEnemy('nuisance', g.actor),
  },
  {
    id: 'glass-cannon', name: 'ガラスの大砲', rarity: 'cursed', category: 'piece-upgrade',
    desc: '全コマの攻撃を+3するが、最大HPが1になる。',
    apply: (g) => g.glassCannon(g.actor),
  },
  {
    id: 'demon-deal', name: '悪魔の取引', rarity: 'cursed', category: 'summon',
    desc: 'ランダムな強力特殊コマを2体得るが、敵の本拠地HPが6回復する。',
    apply: (g) => {
      g.spawnRandomSpecialNearHome(g.actor);
      g.spawnRandomSpecialNearHome(g.actor);
      g.healHome(g.foe, 6);
    },
  },
  {
    id: 'chaos-board', name: '混沌の盤', rarity: 'cursed', category: 'board-gimmick',
    desc: '盤面のあちこちに溶岩・罠・回復・ワープがランダム生成される。',
    apply: (g) => {
      g.addTiles('lava', 2, 'any');
      g.addTiles('trap', 2, 'any');
      g.addTiles('heal', 2, 'any');
      g.addWarpPair();
    },
  },
  {
    id: 'taunt-plus', name: '罵詈雑言＋', rarity: 'cursed', category: 'sabotage',
    desc: '盤上の「いやなやつ」に罵詈雑言を浴びせ、泣きべそをかいて逃げ出させる。',
    apply: (g) => g.tauntNuisances(g.actor),
  },
];

export const ABILITY_BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));

/** Default rarity draw weights (higher = more common). */
const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 58,
  rare: 26,
  epic: 10,
  legendary: 3,
  cursed: 8,
};

const RARITY_RANK: Record<Rarity, number> = {
  common: 0, rare: 1, epic: 2, legendary: 3, cursed: 2,
};

function pickRarity(bonus: number): Rarity {
  // bonus shifts the weights toward higher rarities (神託 effect).
  const weights: Array<[Rarity, number]> = (Object.keys(RARITY_WEIGHT) as Rarity[]).map((r) => {
    const boosted = RARITY_WEIGHT[r] * (1 + bonus * 0.6 * RARITY_RANK[r]);
    return [r, boosted];
  });
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of weights) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return 'common';
}

/** Roll `count` distinct ability cards, honouring a temporary rarity bonus. */
export function rollCards(count: number, rarityBonus = 0): AbilityDef[] {
  const out: AbilityDef[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const rarity = pickRarity(rarityBonus);
    const pool = ABILITIES.filter((a) => a.rarity === rarity && !used.has(a.id));
    const pick = pool.length
      ? pool[Math.floor(Math.random() * pool.length)]
      : ABILITIES[Math.floor(Math.random() * ABILITIES.length)];
    if (used.has(pick.id)) continue;
    used.add(pick.id);
    out.push(pick);
  }
  return out;
}

export { PAWN_EVOLUTIONS };
