import type { GameManager } from '../core/GameManager';
import type { ActionLog, Player } from '../core/types';
import { RARITY_COLOR, RARITY_LABEL } from '../core/types';
import type { AbilityDef } from '../data/abilityData';
import { getDef } from '../data/pieceData';
import { CHARACTERS, type CharacterDef } from '../data/characterData';
import { START_HOME_HP } from '../core/constants';

const CATEGORY_LABEL: Record<string, string> = {
  'piece-upgrade': 'コマ強化',
  summon: '召喚',
  'board-gimmick': '盤面ギミック',
  'temp-buff': '一時バフ',
  passive: '永続パッシブ',
  sabotage: '妨害',
  base: '本拠地',
};

/** Tiny DOM helper. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/**
 * Owns the whole DOM overlay. The renderer draws the 3D scene; this draws the
 * HUD, ability-card chooser, side panels, action log and end screen.
 */
export class UIManager {
  // External callbacks wired up by main.ts.
  onPickCard: (index: number) => void = () => {};
  onSelectHand: (type: string) => void = () => {};
  onSmite: () => void = () => {};
  onTaunt: () => void = () => {};
  onUltimate: () => void = () => {};
  onStartHome: () => void = () => {};
  onPickCharacter: (id: string) => void = () => {};
  onRestart: () => void = () => {};

  private root: HTMLElement;
  private turnBadge!: HTMLElement;
  private turnNum!: HTMLElement;
  private hpFill: Record<Player, HTMLElement> = {} as Record<Player, HTMLElement>;
  private hpText: Record<Player, HTMLElement> = {} as Record<Player, HTMLElement>;
  private charBadge: Record<Player, HTMLElement> = {} as Record<Player, HTMLElement>;
  private selectedPanel!: HTMLElement;
  private handPanel!: HTMLElement;
  private passivePanel!: HTMLElement;
  private controlsPanel!: HTMLElement;
  private logList!: HTMLElement;
  private cardsOverlay!: HTMLElement;
  private gameOverOverlay!: HTMLElement;
  private homeOverlay!: HTMLElement;
  private charOverlay!: HTMLElement;
  private toastEl!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build(): void {
    // ---------- top HUD ----------
    const top = el('div', 'hud-top');
    this.hpFill.ai = this.makeHpBar(top, 'AI', 'ai');
    const center = el('div', 'hud-center');
    this.turnBadge = el('div', 'turn-badge', 'あなたのターン');
    this.turnNum = el('div', 'turn-num', 'ターン 1');
    center.append(this.turnBadge, this.turnNum);
    top.append(center);
    this.hpFill.player = this.makeHpBar(top, 'あなた', 'player');
    this.root.append(top);

    // ---------- right side panels ----------
    const side = el('div', 'side-panel');
    side.append(this.sectionTitle('選択中のコマ'));
    this.selectedPanel = el('div', 'panel-box selected-box', 'コマをクリックして選択');
    side.append(this.selectedPanel);

    this.controlsPanel = el('div', 'controls-box');
    side.append(this.controlsPanel);

    side.append(this.sectionTitle('持ち駒（クリックで打つ）'));
    this.handPanel = el('div', 'panel-box hand-box', '—');
    side.append(this.handPanel);

    side.append(this.sectionTitle('所持中の能力'));
    this.passivePanel = el('div', 'panel-box passive-box', '—');
    side.append(this.passivePanel);
    this.root.append(side);

    // ---------- action log ----------
    const logWrap = el('div', 'log-wrap');
    logWrap.append(this.sectionTitle('行動ログ'));
    this.logList = el('div', 'log-list');
    logWrap.append(this.logList);
    this.root.append(logWrap);

    // ---------- overlays ----------
    this.cardsOverlay = el('div', 'cards-overlay hidden');
    this.root.append(this.cardsOverlay);

    this.gameOverOverlay = el('div', 'gameover-overlay hidden');
    this.root.append(this.gameOverOverlay);

    this.homeOverlay = el('div', 'home-overlay hidden');
    this.root.append(this.homeOverlay);

    this.charOverlay = el('div', 'char-overlay hidden');
    this.root.append(this.charOverlay);

    this.toastEl = el('div', 'toast hidden');
    this.root.append(this.toastEl);

    // ---------- help footer ----------
    const help = el('div', 'help-bar',
      'ドラッグで視点回転 / ホイールでズーム ｜ コマをクリック→光ったマスをクリックで移動');
    this.root.append(help);
  }

  private makeHpBar(parent: HTMLElement, label: string, who: Player): HTMLElement {
    const box = el('div', `hp-box hp-${who}`);
    box.append(el('div', 'hp-label', label));
    const track = el('div', 'hp-track');
    const fill = el('div', 'hp-fill');
    track.append(fill);
    const text = el('div', 'hp-text', `${START_HOME_HP}/${START_HOME_HP}`);
    const char = el('div', 'hp-char', '—');
    box.append(track, text, char);
    parent.append(box);
    this.hpText[who] = text;
    this.charBadge[who] = char;
    return fill;
  }

  private sectionTitle(t: string): HTMLElement {
    return el('div', 'section-title', t);
  }

  // ================================================================ refresh
  refresh(game: GameManager): void {
    // Turn badge.
    let badge = 'あなたのターン';
    let badgeCls = 'turn-badge player';
    if (game.phase === 'card') { badge = '能力カードを選択'; badgeCls = 'turn-badge cardphase'; }
    else if (game.phase === 'ai') { badge = 'AIのターン…'; badgeCls = 'turn-badge ai'; }
    else if (game.phase === 'over') { badge = '対局終了'; badgeCls = 'turn-badge over'; }
    else if (game.turn === 'player') {
      badge = game.actionsLeft > 1 ? `あなたのターン（残り行動${game.actionsLeft}）` : 'あなたのターン';
    }
    this.turnBadge.textContent = badge;
    this.turnBadge.className = badgeCls;
    this.turnNum.textContent = `ターン ${game.turnNumber}`;

    // HP bars.
    for (const who of ['player', 'ai'] as Player[]) {
      const st = game.players[who];
      const max = Math.max(START_HOME_HP, st.maxHomeHp);
      const pct = Math.max(0, (st.homeHp / max) * 100);
      this.hpFill[who].style.width = `${pct}%`;
      this.hpText[who].textContent = `${st.homeHp}/${st.maxHomeHp}`;
      const ch = game.getCharacter(who);
      this.charBadge[who].innerHTML =
        `<span class="emblem" style="background:${ch.color}">${ch.emblem}</span>` +
        `<span class="cname">${ch.name}<small>${ch.title}</small></span>`;
    }

    this.refreshSelected(game);
    this.refreshControls(game);
    this.refreshHand(game);
    this.refreshPassives(game);
  }

  private refreshSelected(game: GameManager): void {
    if (game.smiteMode) {
      this.selectedPanel.innerHTML = '<b>神の消滅モード</b><br>敵コマをクリックで消滅';
      return;
    }
    if (game.dropType) {
      this.selectedPanel.innerHTML = `<b>${getDef(game.dropType as any).name}を打つ</b><br>光ったマスをクリック`;
      return;
    }
    const p = game.selected;
    if (!p) {
      this.selectedPanel.innerHTML = 'コマをクリックして選択';
      return;
    }
    this.selectedPanel.innerHTML = game.describePiece(p).replace(/\n/g, '<br>');
  }

  private refreshControls(game: GameManager): void {
    this.controlsPanel.innerHTML = '';
    if (game.phase !== 'play') return;

    // 奥義 (ultimate) button — always shown on your turn, with cooldown state.
    const ch = game.getCharacter('player');
    const cd = game.players.player.ultimateCd;
    const ult = el('button', `ctrl-btn ult${cd > 0 ? ' disabled' : ''}`,
      cd > 0 ? `奥義 残り${cd}T` : `⚔ 奥義「${ch.ultimateName}」`);
    ult.title = ch.ultimateDesc;
    if (cd === 0) {
      ult.style.background = `linear-gradient(135deg, ${ch.color}, #1b2233)`;
      ult.onclick = () => this.onUltimate();
    }
    this.controlsPanel.append(ult);

    const hasGod = game.board.piecesOf('player').some((p) => p.type === 'god' && p.cooldown === 0);
    if (hasGod) {
      const btn = el('button', 'ctrl-btn smite', '⚡ 神の消滅');
      btn.onclick = () => this.onSmite();
      this.controlsPanel.append(btn);
    }
    const enemyPest = game.board.allPieces().some((p) => p.type === 'nuisance' && p.owner !== 'player');
    if (enemyPest) {
      const btn = el('button', 'ctrl-btn taunt', '💢 罵詈雑言');
      btn.onclick = () => this.onTaunt();
      this.controlsPanel.append(btn);
    }
  }

  private refreshHand(game: GameManager): void {
    const hand = game.players.player.hand;
    const types = Object.keys(hand).filter((t) => hand[t] > 0);
    this.handPanel.innerHTML = '';
    if (!types.length) {
      this.handPanel.textContent = '—';
      return;
    }
    for (const type of types) {
      const chip = el('button', 'hand-chip', `${getDef(type as any).label}×${hand[type]}`);
      chip.onclick = () => this.onSelectHand(type);
      if (game.dropType === type) chip.classList.add('active');
      this.handPanel.append(chip);
    }
  }

  private refreshPassives(game: GameManager): void {
    const st = game.players.player;
    this.passivePanel.innerHTML = '';
    if (!st.passives.length && !st.abilityLog.length) {
      this.passivePanel.textContent = '—';
      return;
    }
    for (const p of st.passives) {
      const row = el('div', 'passive-row');
      row.style.borderColor = RARITY_COLOR[p.rarity];
      row.innerHTML = `<b>${p.name}</b><span>${p.desc}</span>`;
      this.passivePanel.append(row);
    }
    if (st.abilityLog.length) {
      const recent = el('div', 'ability-recent',
        '獲得: ' + st.abilityLog.slice(0, 6)
          .map((a) => `<span style="color:${RARITY_COLOR[a.rarity]}">${a.name}</span>`).join(' / '));
      this.passivePanel.append(recent);
    }
  }

  // ================================================================ cards
  showCards(cards: AbilityDef[]): void {
    this.cardsOverlay.innerHTML = '';
    const wrap = el('div', 'cards-wrap');
    wrap.append(el('div', 'cards-title', '能力カードを1つ選択'));
    const row = el('div', 'cards-row');
    cards.forEach((card, i) => {
      const c = el('div', 'card');
      c.style.borderColor = RARITY_COLOR[card.rarity];
      c.innerHTML = `
        <div class="card-rarity" style="background:${RARITY_COLOR[card.rarity]}">${RARITY_LABEL[card.rarity]}</div>
        <div class="card-name">${card.name}</div>
        <div class="card-cat">${CATEGORY_LABEL[card.category] ?? card.category}</div>
        <div class="card-desc">${card.desc}</div>`;
      c.onclick = () => this.onPickCard(i);
      row.append(c);
    });
    wrap.append(row);
    this.cardsOverlay.append(wrap);
    this.cardsOverlay.classList.remove('hidden');
  }

  hideCards(): void {
    this.cardsOverlay.classList.add('hidden');
  }

  // ================================================================ log
  pushLog(entry: ActionLog): void {
    const line = el('div', `log-line${entry.important ? ' important' : ''}`, entry.text);
    this.logList.prepend(line);
    while (this.logList.children.length > 30) this.logList.lastChild?.remove();
  }

  // ================================================================ end
  showGameOver(winner: Player): void {
    const win = winner === 'player';
    this.gameOverOverlay.innerHTML = '';
    const box = el('div', `gameover-box ${win ? 'win' : 'lose'}`);
    box.append(el('div', 'gameover-title', win ? '勝利！' : '敗北…'));
    box.append(el('div', 'gameover-sub', win ? '銀河を制した！' : '次はきっと勝てる'));
    const btn = el('button', 'restart-btn', 'タイトルへ戻る');
    btn.onclick = () => this.onRestart();
    box.append(btn);
    this.gameOverOverlay.append(box);
    this.gameOverOverlay.classList.remove('hidden');
  }

  // ================================================================ home / character select
  /** The title screen: 銀河将棋X². */
  showHome(): void {
    this.gameOverOverlay.classList.add('hidden');
    this.charOverlay.classList.add('hidden');
    this.homeOverlay.innerHTML = '';
    const box = el('div', 'home-box');
    box.innerHTML = `
      <div class="home-sub">ROGUELIKE SHOGI</div>
      <h1 class="home-title">銀河将棋<span class="x">X<sup>2</sup></span></h1>
      <div class="home-desc">将棋 × ローグライク × 武将の奥義。<br>軍師を選び、銀河の覇権を賭けて戦え。</div>
      <button class="home-start">▶ ゲームスタート</button>
      <div class="home-tip">ドラッグで視点回転 / ホイールでズーム</div>`;
    box.querySelector<HTMLButtonElement>('.home-start')!.onclick = () => this.onStartHome();
    this.homeOverlay.append(box);
    this.homeOverlay.classList.remove('hidden');
  }

  hideHome(): void {
    this.homeOverlay.classList.add('hidden');
  }

  /** The commander-select screen. */
  showCharacterSelect(): void {
    this.homeOverlay.classList.add('hidden');
    this.charOverlay.innerHTML = '';
    const wrap = el('div', 'char-wrap');
    wrap.append(el('div', 'char-head', '軍師を選べ'));
    const grid = el('div', 'char-grid');
    for (const c of CHARACTERS) {
      grid.append(this.makeCharCard(c));
    }
    wrap.append(grid);
    this.charOverlay.append(wrap);
    this.charOverlay.classList.remove('hidden');
  }

  hideCharacterSelect(): void {
    this.charOverlay.classList.add('hidden');
  }

  private makeCharCard(c: CharacterDef): HTMLElement {
    const card = el('div', 'char-card');
    card.style.borderColor = c.color;
    card.innerHTML = `
      <div class="char-top">
        <span class="char-emblem" style="background:${c.color}">${c.emblem}</span>
        <div class="char-id">
          <div class="char-name">${c.name}</div>
          <div class="char-title" style="color:${c.color}">${c.title}</div>
        </div>
      </div>
      <div class="char-quote">${c.quote}</div>
      <div class="char-skill"><b>パッシブ｜${c.passiveName}</b><span>${c.passiveDesc}</span></div>
      <div class="char-skill ult"><b>奥義｜${c.ultimateName}（CD${c.ultimateCooldown}）</b><span>${c.ultimateDesc}</span></div>
      <button class="char-pick" style="background:${c.color}">この軍師で出陣</button>`;
    card.querySelector<HTMLButtonElement>('.char-pick')!.onclick = () => this.onPickCharacter(c.id);
    return card;
  }

  // ================================================================ toast
  private toastTimer = 0;
  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }
}
