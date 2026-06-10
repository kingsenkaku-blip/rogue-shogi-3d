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
 *  - On open, a command-prompt style boot演出 plays *inside the console output*:
 *    a rotating |/-/-\ spinner and an ASCII progress bar like `58%[■■■■....]`,
 *    rendered in Courier New. Commands themselves apply immediately.
 *
 * Disabled in production builds (see main.ts gate on import.meta.env.DEV).
 */

// ---- boot演出: tweak these to retune the show (pure flavour) -----------------
const BOOT_DURATION_MS = 2600;
const BAR_WIDTH = 20;
const SPINNER = ['|', '/', '-', '\\']; // the rotating vertical bar
/** Fake, non-existent paths only — never reference real src/ files here. */
const BOOT_LINES: string[] = [
  '> !injection /sys/core/cheat_engine.bin ... OK',
  '> mounting overlay://shogi/godmode.mod',
  '> alloc 0x0DEFACED .. 0x0C0FFEE  (galaxy heap)',
  '> patch 0x4F2A applied',
  '> rewriting /proc/banou/ougi.tbl',
  '> verifying signature ... PASS',
  '> sync overlay://galaxy/x2.img',
];

type CheatOutcome =
  | { ok: false; msg: string }
  | { ok: true; summary: string; apply: () => void };

export class CheatConsole {
  private root: HTMLElement;
  private bar!: HTMLElement;
  private input!: HTMLInputElement;
  private out!: HTMLElement;

  private open = false;
  private booting = false;
  private bootSkip: (() => void) | null = null;
  private bootTimer: number | null = null;
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
    // Focus synchronously so iOS opens the soft keyboard (we're inside a gesture).
    this.input.focus();
    setTimeout(() => this.input.focus(), 60);
    this.boot(); // command-prompt startup演出 plays in the output area
  }

  private close(): void {
    this.open = false;
    this.stopBoot();
    this.bar.classList.add('hidden');
    this.input.blur();
  }

  private stopBoot(): void {
    this.booting = false;
    this.bootSkip = null;
    if (this.bootTimer !== null) { clearInterval(this.bootTimer); this.bootTimer = null; }
  }

  // ----------------------------------------------------------------- boot演出
  /**
   * Plays a command-prompt style "loading" sequence inside the console output
   * on open: a rotating |/-\ spinner and an ASCII bar like `58%[■■■■....]`.
   * Driven by setInterval (not rAF) so it keeps running even if the tab is
   * backgrounded, and the spinner advances per tick so it always rotates.
   */
  private boot(): void {
    this.stopBoot();
    this.out.innerHTML = '';
    this.booting = true;
    this.print('SYS // initializing cheat engine…', 'sys');

    // The live progress line stays at the bottom and is rewritten each tick.
    const prog = document.createElement('div');
    prog.className = 'cheat-line boot';
    this.out.appendChild(prog);

    const start = performance.now();
    let shown = 0;
    let tick = 0;

    const finalize = (): void => {
      if (!this.booting) return;
      this.stopBoot();
      while (shown < BOOT_LINES.length) this.insertBootLine(BOOT_LINES[shown++], prog);
      prog.textContent = `- 100%[${'■'.repeat(BAR_WIDTH)}]`;
      this.print('[DONE] cheat module loaded', 'ok');
      this.printHelp();
      this.out.scrollTop = this.out.scrollHeight;
    };
    this.bootSkip = finalize;

    this.bootTimer = window.setInterval(() => {
      if (!this.booting) { this.stopBoot(); return; }
      tick += 1;
      const p = Math.min(1, (performance.now() - start) / BOOT_DURATION_MS);

      // Reveal fake log lines progressively, above the live progress line.
      const want = Math.floor(p * BOOT_LINES.length);
      while (shown < want && shown < BOOT_LINES.length) this.insertBootLine(BOOT_LINES[shown++], prog);

      const pct = String(Math.round(p * 100)).padStart(3, ' ');
      const fill = Math.round(p * BAR_WIDTH);
      const gauge = '■'.repeat(fill) + '.'.repeat(BAR_WIDTH - fill);
      const spin = SPINNER[tick % SPINNER.length];
      prog.textContent = `${spin} ${pct}%[${gauge}]`;
      this.out.scrollTop = this.out.scrollHeight;

      if (p >= 1) finalize();
    }, 80);
  }

  private insertBootLine(text: string, ref: HTMLElement): void {
    const l = document.createElement('div');
    l.className = 'cheat-line boot';
    l.textContent = text;
    this.out.insertBefore(l, ref);
  }

  // ----------------------------------------------------------------- output
  private print(text: string, cls = ''): void {
    const line = document.createElement('div');
    line.className = `cheat-line ${cls}`.trim();
    line.textContent = text;
    this.out.appendChild(line);
    this.out.scrollTop = this.out.scrollHeight;
    while (this.out.childElementCount > 80) this.out.firstChild?.remove();
  }

  private printHelp(): void {
    this.print('利用可能コマンド:', 'sys');
    this.print('  god            自軍本拠地HP大幅増＋自軍防御バフ');
    this.print('  give <cardId>  能力カードを即付与（例: give summon-god）');
    this.print('  spawn <type>   特殊コマを召喚（例: spawn god）');
    this.print('  sethp <n>      自軍本拠地HPを n に設定');
    this.print('  win            即勝利（デバッグ）');
    this.print('  reboot         起動演出をもう一度再生');
    this.print('  help           このヘルプを表示');
  }

  // ----------------------------------------------------------------- run
  private submit(): void {
    if (this.booting) this.bootSkip?.(); // a keypress skips the boot animation
    const raw = this.input.value.trim();
    this.input.value = '';
    if (!raw) return;
    this.print(`> ${raw}`, 'echo');
    this.run(raw);
    this.input.focus();
  }

  private run(raw: string): void {
    const [cmd, ...args] = raw.split(/\s+/);
    const name = cmd.toLowerCase();

    if (name === 'help') { this.printHelp(); return; }
    if (name === 'reboot') { this.boot(); return; }

    const game = this.getGame();
    if (!game) { this.print('ゲーム開始前です。対局を始めてから使ってください', 'warn'); return; }

    const handler = this.handlers[name];
    if (!handler) { this.print(`未知のコマンド: ${name}（help 参照）`, 'err'); return; }

    const outcome = handler(game, args);
    if (!outcome.ok) { this.print(outcome.msg, 'err'); return; }

    try {
      outcome.apply();
      game.notify();
      this.print(`✔ ${outcome.summary}`, 'ok');
    } catch (err) {
      this.print(`実行エラー: ${String(err)}`, 'err');
    }
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
}
