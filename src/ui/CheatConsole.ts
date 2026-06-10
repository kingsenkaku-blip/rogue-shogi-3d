import type { GameManager } from '../core/GameManager';
import type { Piece } from '../core/Piece';
import { ABILITIES } from '../data/abilityData';
import { PIECE_DATA, SUMMONABLE_SPECIALS } from '../data/pieceData';

/**
 * DEV-only cheat / demo console.
 *
 * Design notes:
 *  - Self-contained: owns its own DOM and calls only the GameManager *public*
 *    API (spawnNearHome / buffOwnPieces / healHome / giveCardById / …). It never
 *    touches rule logic.
 *  - Two activation paths so it works with or without a physical keyboard:
 *      1. keyboard: type "iddqd", or press backtick (`).
 *      2. touch:    tap the top-right screen corner 5× within 1.5s
 *         (pointerdown-based → works for mouse, touch and pen alike).
 *  - Running a cheat shows a fake "loading" window (progress bar + terminal-style
 *    log) purely for flavour; the *real* effect is applied when the bar fills.
 *
 * Disabled in production builds (see main.ts gate on import.meta.env.DEV).
 */

// ---- loading-window演出: swap these to retune the show (pure flavour) --------
const LOADING_DURATION_MS = 2600;
/** Fake, non-existent paths only — never reference real src/ files here. */
const LOADING_LINES: string[] = [
  '> !injection /sys/core/cheat_engine.bin ... OK',
  '> mounting overlay://shogi/godmode.mod',
  '> alloc 0x0DEFACED .. 0x0C0FFEE  (galaxy heap)',
  '> patch 0x4F2A applied',
  '> rewriting /proc/banou/ougi.tbl',
  '> verifying signature ... PASS',
  '> sync overlay://galaxy/x2.img  [■■■■■■■■]',
  '> [DONE] cheat module loaded',
];

type CheatOutcome =
  | { ok: false; msg: string }
  | { ok: true; summary: string; apply: () => void };

export class CheatConsole {
  private root: HTMLElement;
  private bar!: HTMLElement;
  private input!: HTMLInputElement;
  private out!: HTMLElement;
  private loadWin!: HTMLElement;
  private loadBar!: HTMLElement;
  private loadPct!: HTMLElement;
  private loadLog!: HTMLElement;

  private open = false;
  private busy = false; // a loading演出 is currently running
  private keyBuffer = '';
  private cornerTaps = 0;
  private lastCornerTap = 0;

  constructor(private getGame: () => GameManager | null, root: HTMLElement = document.body) {
    this.root = root;
    this.buildDom();
    this.installTriggers();
  }

  // ----------------------------------------------------------------- DOM
  private buildDom(): void {
    this.bar = document.createElement('div');
    this.bar.className = 'cheat-bar hidden';
    this.bar.innerHTML = `
      <div class="cheat-head">
        <span class="cheat-tag">▌ CHEAT CONSOLE <small>(dev)</small></span>
        <button class="cheat-x" title="閉じる">✕</button>
      </div>
      <div class="cheat-out"></div>
      <div class="cheat-row">
        <span class="cheat-caret">&gt;</span>
        <input class="cheat-input" type="text" inputmode="text"
               autocomplete="off" autocapitalize="none" autocorrect="off"
               spellcheck="false" placeholder="コマンド入力（help）" />
        <button class="cheat-run">実行</button>
      </div>`;
    this.root.appendChild(this.bar);

    this.input = this.bar.querySelector('.cheat-input')!;
    this.out = this.bar.querySelector('.cheat-out')!;
    this.bar.querySelector('.cheat-run')!.addEventListener('click', () => this.submit());
    this.bar.querySelector('.cheat-x')!.addEventListener('click', () => this.close());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      e.stopPropagation(); // don't let the global key triggers see console typing
    });

    // Loading演出 window.
    this.loadWin = document.createElement('div');
    this.loadWin.className = 'cheat-load hidden';
    this.loadWin.innerHTML = `
      <div class="cheat-load-box">
        <div class="cheat-load-title">LOADING CHEAT MODULE…</div>
        <div class="cheat-load-barwrap"><div class="cheat-load-bar"></div></div>
        <div class="cheat-load-pct">0%</div>
        <div class="cheat-loadlog"></div>
      </div>`;
    this.root.appendChild(this.loadWin);
    this.loadBar = this.loadWin.querySelector('.cheat-load-bar')!;
    this.loadPct = this.loadWin.querySelector('.cheat-load-pct')!;
    this.loadLog = this.loadWin.querySelector('.cheat-loadlog')!;
  }

  // ----------------------------------------------------------------- triggers
  private installTriggers(): void {
    // Keyboard: backtick toggles, "iddqd" opens.
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '`' || e.key === '~' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggle();
        return;
      }
      if (e.key.length === 1) {
        this.keyBuffer = (this.keyBuffer + e.key.toLowerCase()).slice(-8);
        if (this.keyBuffer.includes('iddqd')) { this.keyBuffer = ''; this.show(); }
      }
    });

    // Touch / mouse: 5 quick taps in the top-right corner (no physical keyboard needed).
    window.addEventListener('pointerdown', (e) => {
      const cornerSize = 90; // ≥44px tap target zone
      const inCorner = e.clientX > window.innerWidth - cornerSize && e.clientY < cornerSize;
      if (!inCorner) return;
      const now = performance.now();
      if (now - this.lastCornerTap > 1500) this.cornerTaps = 0;
      this.lastCornerTap = now;
      this.cornerTaps += 1;
      if (this.cornerTaps >= 5) { this.cornerTaps = 0; this.toggle(); }
    }, { capture: true, passive: true });
  }

  // ----------------------------------------------------------------- show/hide
  private toggle(): void {
    this.open ? this.close() : this.show();
  }

  private show(): void {
    if (this.open) return;
    this.open = true;
    this.bar.classList.remove('hidden');
    if (!this.out.childElementCount) this.printHelp();
    // Focus synchronously so iOS opens the soft keyboard (we're inside a gesture).
    this.input.focus();
    setTimeout(() => this.input.focus(), 60);
  }

  private close(): void {
    this.open = false;
    this.bar.classList.add('hidden');
    this.input.blur();
  }

  // ----------------------------------------------------------------- output
  private print(text: string, cls = ''): void {
    const line = document.createElement('div');
    line.className = `cheat-line ${cls}`.trim();
    line.textContent = text;
    this.out.appendChild(line);
    this.out.scrollTop = this.out.scrollHeight;
    while (this.out.childElementCount > 60) this.out.firstChild?.remove();
  }

  private printHelp(): void {
    this.print('利用可能コマンド:', 'sys');
    this.print('  god            自軍本拠地HP大幅増＋自軍防御バフ');
    this.print('  give <cardId>  能力カードを即付与（例: give summon-god）');
    this.print('  spawn <type>   特殊コマを召喚（例: spawn god）');
    this.print('  sethp <n>      自軍本拠地HPを n に設定');
    this.print('  win            即勝利（デバッグ）');
    this.print('  help           このヘルプを表示');
  }

  // ----------------------------------------------------------------- run
  private submit(): void {
    const raw = this.input.value.trim();
    this.input.value = '';
    if (!raw) return;
    this.print(`> ${raw}`, 'echo');
    if (this.busy) { this.print('… ロード中です。少し待ってください', 'warn'); return; }
    this.run(raw);
    this.input.focus();
  }

  private run(raw: string): void {
    const [cmd, ...args] = raw.split(/\s+/);
    const name = cmd.toLowerCase();

    if (name === 'help') { this.printHelp(); return; }

    const game = this.getGame();
    if (!game) { this.print('ゲーム開始前です。対局を始めてから使ってください', 'warn'); return; }

    const handler = this.handlers[name];
    if (!handler) { this.print(`未知のコマンド: ${name}（help 参照）`, 'err'); return; }

    const outcome = handler(game, args);
    if (!outcome.ok) { this.print(outcome.msg, 'err'); return; }

    // Flavour loading window, then apply the real effect.
    this.runLoading(() => {
      try {
        outcome.apply();
        game.notify();
        this.print(`✔ ${outcome.summary}`, 'ok');
      } catch (err) {
        this.print(`実行エラー: ${String(err)}`, 'err');
      }
    });
  }

  /** Command table — each returns either an error or an `apply` thunk. */
  private handlers: Record<string, (g: GameManager, args: string[]) => CheatOutcome> = {
    god: (g) => ({
      ok: true,
      summary: 'GODMODE: 本拠地HP増強＋自軍防御バフ',
      apply: () => {
        g.boostHomeMax('player', 200);
        g.healHome('player', 999);
        g.buffOwnPieces('player', { id: 'cheat-god', label: 'GODMODE', turns: Infinity, defense: 5, atk: 2 });
      },
    }),

    give: (g, args) => {
      const id = args[0];
      if (!id) return { ok: false, msg: '使い方: give <cardId>　例: give army-upgrade' };
      if (!ABILITIES.some((a) => a.id === id)) {
        const hint = ABILITIES.slice(0, 8).map((a) => a.id).join(', ');
        return { ok: false, msg: `不明なカードid: ${id}\n候補例: ${hint} …（全${ABILITIES.length}種）` };
      }
      return { ok: true, summary: `カード「${id}」を付与`, apply: () => g.giveCardById(id, 'player') };
    },

    spawn: (g, args) => {
      const type = args[0] as Piece['type'];
      if (!type) {
        return { ok: false, msg: `使い方: spawn <type>\n特殊コマ: ${SUMMONABLE_SPECIALS.join(', ')}` };
      }
      if (!(type in PIECE_DATA)) {
        return { ok: false, msg: `不明なコマtype: ${type}\n特殊コマ: ${SUMMONABLE_SPECIALS.join(', ')}` };
      }
      return {
        ok: true,
        summary: `${PIECE_DATA[type].name} を召喚`,
        apply: () => g.spawnNearHome(type, 'player'),
      };
    },

    sethp: (g, args) => {
      const n = Number(args[0]);
      if (!Number.isFinite(n)) return { ok: false, msg: '使い方: sethp <数値>　例: sethp 99' };
      return { ok: true, summary: `本拠地HPを ${Math.floor(n)} に設定`, apply: () => g.setHomeHp('player', n) };
    },

    win: (g) => ({ ok: true, summary: '強制勝利', apply: () => g.debugWin('player') }),
  };

  // ----------------------------------------------------------------- loading演出
  private runLoading(onDone: () => void): void {
    this.busy = true;
    this.loadLog.innerHTML = '';
    this.loadBar.style.width = '0%';
    this.loadPct.textContent = '0%';
    this.loadWin.classList.remove('hidden');

    const start = performance.now();
    const total = LOADING_LINES.length;
    let shown = 0;

    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / LOADING_DURATION_MS);
      const pct = Math.round(p * 100);
      this.loadBar.style.width = `${pct}%`;
      this.loadPct.textContent = `${pct}%`;

      // Reveal log lines spread across the duration.
      const wantShown = Math.floor(p * total);
      while (shown < wantShown && shown < total) {
        const l = document.createElement('div');
        l.textContent = LOADING_LINES[shown];
        this.loadLog.appendChild(l);
        this.loadLog.scrollTop = this.loadLog.scrollHeight;
        shown += 1;
      }

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        // Make sure the final line is shown.
        while (shown < total) {
          const l = document.createElement('div');
          l.textContent = LOADING_LINES[shown++];
          this.loadLog.appendChild(l);
        }
        setTimeout(() => {
          this.loadWin.classList.add('hidden');
          this.busy = false;
          onDone();
        }, 350);
      }
    };
    requestAnimationFrame(frame);
  }
}
