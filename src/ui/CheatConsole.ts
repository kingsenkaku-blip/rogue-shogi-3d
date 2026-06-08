import type { GameManager } from '../core/GameManager';
import { ABILITIES } from '../data/abilityData';
import type { PieceType } from '../core/types';
import { SUMMONABLE_SPECIALS } from '../data/pieceData';

/**
 * Decorative terminal log lines for the load-window animation.
 * These are FICTIONAL paths only — not real project files.
 */
const LOAD_LINES: readonly string[] = [
  '> !injection /sys/core/cheat_engine.bin ... OK',
  '> mounting overlay://shogi/godmode.mod',
  '> allocating 0x8000 bytes at kernel ring-0',
  '> patch 0x4F2A → NOP applied',
  '> loading /dev/shm/galaxy_patch.so',
  '> verifying module signature ... PASS',
  '> checksum 0xDEADBEEF confirmed',
  '> [DONE] cheat module loaded',
];

const LOAD_DURATION_MS = 2500;

function getGame(): GameManager | null {
  return (window as unknown as { game?: GameManager }).game ?? null;
}

/**
 * Hidden cheat console — not surfaced in any UI.
 *
 * Activation (any of the following):
 *   - Backtick ` key
 *   - Sequential typing of "iddqd"
 *   - 5× pointerdown within 1.5 s in the top-right corner tap zone
 *     (works with both mouse and touch — no physical keyboard required)
 */
export class CheatConsole {
  private overlayEl!: HTMLDivElement;
  private inputEl!: HTMLInputElement;
  private outputEl!: HTMLDivElement;
  private visible = false;

  // "iddqd" sequential key detection
  private konamiBuffer = '';
  private readonly KONAMI_CODE = 'iddqd';

  // Corner tap detection
  private tapCount = 0;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly TAP_THRESHOLD = 5;
  private readonly TAP_WINDOW_MS = 1500;

  constructor() {
    this.buildDOM();
    this.wireKeyboard();
    this.wireTapZone();
  }

  // ---------------------------------------------------------------- DOM
  private buildDOM(): void {
    // ---- main console overlay ----
    const overlay = document.createElement('div');
    overlay.className = 'cheat-overlay hidden';

    const box = document.createElement('div');
    box.className = 'cheat-box';

    const header = document.createElement('div');
    header.className = 'cheat-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'cheat-title';
    titleEl.textContent = '◈ CHEAT CONSOLE  [DEV]';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cheat-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.hide();
    });

    header.append(titleEl, closeBtn);

    this.outputEl = document.createElement('div');
    this.outputEl.className = 'cheat-output';
    this.outputEl.setAttribute('aria-live', 'polite');

    const inputRow = document.createElement('div');
    inputRow.className = 'cheat-input-row';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'cheat-input';
    this.inputEl.placeholder = 'コマンド入力  (help で一覧)';
    this.inputEl.setAttribute('inputmode', 'text');
    this.inputEl.setAttribute('enterkeyhint', 'send');
    this.inputEl.setAttribute('autocomplete', 'off');
    this.inputEl.setAttribute('autocorrect', 'off');
    this.inputEl.setAttribute('autocapitalize', 'none');
    this.inputEl.setAttribute('spellcheck', 'false');
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.hide(); return; }
      if (e.key === 'Enter') { e.preventDefault(); void this.run(); }
    });

    const runBtn = document.createElement('button');
    runBtn.className = 'cheat-run-btn';
    runBtn.textContent = '実行';
    // pointerdown fires before blur so the input value is still current
    runBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      void this.run();
    });

    inputRow.append(this.inputEl, runBtn);
    box.append(header, this.outputEl, inputRow);
    overlay.append(box);
    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    // ---- invisible tap-trigger zone at top-right corner ----
    const tapZone = document.createElement('div');
    tapZone.className = 'cheat-tap-zone';
    tapZone.id = 'cheat-tap-zone';
    document.body.appendChild(tapZone);
  }

  // ---------------------------------------------------------------- triggers
  private wireKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      // Backtick (`) toggles the console
      if (e.key === '`') {
        e.preventDefault();
        this.toggle();
        return;
      }
      // "iddqd" sequence
      if (e.key.length === 1) {
        this.konamiBuffer = (this.konamiBuffer + e.key.toLowerCase())
          .slice(-this.KONAMI_CODE.length);
        if (this.konamiBuffer === this.KONAMI_CODE) {
          this.konamiBuffer = '';
          this.toggle();
        }
      }
    });
  }

  private wireTapZone(): void {
    const zone = document.getElementById('cheat-tap-zone');
    if (!zone) return;

    zone.addEventListener('pointerdown', (e) => {
      // Prevent double-fire on touch devices (touch → mouse emulation)
      e.preventDefault();
      this.tapCount++;

      if (this.tapTimer !== null) clearTimeout(this.tapTimer);
      this.tapTimer = setTimeout(() => {
        this.tapCount = 0;
        this.tapTimer = null;
      }, this.TAP_WINDOW_MS);

      if (this.tapCount >= this.TAP_THRESHOLD) {
        this.tapCount = 0;
        if (this.tapTimer !== null) { clearTimeout(this.tapTimer); this.tapTimer = null; }
        this.toggle();
      }
    });
  }

  // ---------------------------------------------------------------- visibility
  toggle(): void {
    if (this.visible) { this.hide(); } else { this.show(); }
  }

  show(): void {
    this.visible = true;
    this.overlayEl.classList.remove('hidden');
    // rAF ensures the element is painted before focus (avoids iOS quirk)
    requestAnimationFrame(() => this.inputEl.focus());
  }

  hide(): void {
    this.visible = false;
    this.overlayEl.classList.add('hidden');
  }

  // ---------------------------------------------------------------- output
  private print(text: string, variant: 'cmd' | 'ok' | 'err' | 'info' = 'info'): void {
    const line = document.createElement('div');
    line.className = `cheat-line cheat-line-${variant}`;
    line.textContent = text;
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
    // Keep log bounded
    while (this.outputEl.children.length > 80) {
      this.outputEl.firstChild?.remove();
    }
  }

  // ---------------------------------------------------------------- execution
  private async run(): Promise<void> {
    const raw = this.inputEl.value.trim();
    if (!raw) return;
    this.inputEl.value = '';
    this.print(`> ${raw}`, 'cmd');

    const [cmd, ...args] = raw.split(/\s+/);

    if (cmd === 'help') {
      this.cmdHelp();
      return;
    }

    const game = getGame();
    if (!game) {
      this.print('[ERROR] ゲームが起動していません。対局を開始してから使用してください。', 'err');
      return;
    }

    // Show the animated load window, then apply the command on completion
    await new Promise<void>((resolve) => {
      this.showLoadWindow(cmd, () => {
        const handled = this.applyCommand(cmd, args, game);
        if (!handled) {
          this.print(`[ERROR] 不明なコマンド: "${cmd}"  (help で一覧)`, 'err');
        }
        resolve();
      });
    });
  }

  private applyCommand(cmd: string, args: string[], game: GameManager): boolean {
    switch (cmd.toLowerCase()) {
      case 'god':    this.cmdGod(game);           return true;
      case 'give':   this.cmdGive(args, game);    return true;
      case 'spawn':  this.cmdSpawn(args, game);   return true;
      case 'sethp':  this.cmdSetHp(args, game);   return true;
      case 'win':    this.cmdWin(game);            return true;
      default:       return false;
    }
  }

  // ---------------------------------------------------------------- commands
  private cmdHelp(): void {
    const lines = [
      '┌─ CHEAT CONSOLE ─────────────────────────────────────────',
      '│  god             本拠地HP MAX + 自軍 攻+3 防+5 (永続バフ)',
      '│  give <id>       能力カードを即時付与   例: give iron-wall',
      '│  spawn <type>    特殊コマを自陣に召喚   例: spawn ninja',
      '│  sethp <n>       本拠地HPをnに設定      例: sethp 100',
      '│  win             即勝利',
      '│  help            このヘルプを表示',
      '│',
      '│  give の主なID: ' + ABILITIES.slice(0, 8).map((a) => a.id).join(', '),
      '│  spawn の主なタイプ: ' + SUMMONABLE_SPECIALS.join(', '),
      '└─────────────────────────────────────────────────────────',
    ];
    for (const l of lines) this.print(l, 'info');
  }

  private cmdGod(game: GameManager): void {
    game.boostHomeMax('player', 100);
    game.cheatSetHomeHp('player', game.players.player.maxHomeHp);
    game.buffOwnPieces('player', {
      id: 'cheat-god',
      label: 'GODモード',
      turns: Infinity,
      atk: 3,
      defense: 5,
    });
    game.cheatRefreshState();
    this.print('[god] 本拠地HP MAX / 自軍: 攻+3・防+5 (永続) 適用完了', 'ok');
  }

  private cmdGive(args: string[], game: GameManager): void {
    const id = args[0];
    if (!id) {
      this.print('[give] 能力IDを指定してください  例: give iron-wall', 'err');
      this.print('  ID一覧: ' + ABILITIES.map((a) => a.id).join(', '), 'info');
      return;
    }
    const ability = ABILITIES.find((a) => a.id === id);
    if (!ability) {
      this.print(`[give] 不明な能力ID: "${id}"`, 'err');
      this.print('  ID一覧: ' + ABILITIES.map((a) => a.id).join(', '), 'info');
      return;
    }
    game.actor = 'player';
    try {
      ability.apply(game);
      game.cheatRefreshState();
      this.print(`[give] 「${ability.name}」を付与しました`, 'ok');
    } catch (e) {
      this.print(`[give] 実行エラー: ${String(e)}`, 'err');
    }
  }

  private cmdSpawn(args: string[], game: GameManager): void {
    const type = args[0];
    if (!type) {
      this.print('[spawn] コマタイプを指定してください  例: spawn ninja', 'err');
      this.print('  タイプ一覧: ' + SUMMONABLE_SPECIALS.join(', '), 'info');
      return;
    }
    try {
      const piece = game.spawnNearHome(type as PieceType, 'player');
      if (piece) {
        game.cheatRefreshState();
        this.print(`[spawn] ${type} を自陣に召喚しました`, 'ok');
      } else {
        this.print('[spawn] 空きマスがありません', 'err');
      }
    } catch {
      this.print(`[spawn] 無効なコマタイプ: "${type}"`, 'err');
      this.print('  タイプ一覧: ' + SUMMONABLE_SPECIALS.join(', '), 'info');
    }
  }

  private cmdSetHp(args: string[], game: GameManager): void {
    const n = parseInt(args[0] ?? '', 10);
    if (!Number.isFinite(n) || n < 0) {
      this.print('[sethp] 0以上の整数を指定してください  例: sethp 100', 'err');
      return;
    }
    game.cheatSetHomeHp('player', n);
    this.print(`[sethp] 本拠地HPを ${n} に設定しました`, 'ok');
  }

  private cmdWin(game: GameManager): void {
    game.cheatWin();
    this.print('[win] 即勝利を実行しました', 'ok');
  }

  // ---------------------------------------------------------------- load window animation
  private showLoadWindow(cmd: string, onDone: () => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'cheat-load-overlay';

    const box = document.createElement('div');
    box.className = 'cheat-load-box';

    const titleEl = document.createElement('div');
    titleEl.className = 'cheat-load-title';
    titleEl.textContent = `LOADING: ${cmd.toUpperCase()}`;

    const barTrack = document.createElement('div');
    barTrack.className = 'cheat-load-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'cheat-load-bar-fill';
    barFill.style.width = '0%';
    barTrack.appendChild(barFill);

    const pctEl = document.createElement('div');
    pctEl.className = 'cheat-load-pct';
    pctEl.textContent = '0%';

    const logEl = document.createElement('div');
    logEl.className = 'cheat-load-log';

    box.append(titleEl, barTrack, pctEl, logEl);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const lines = [...LOAD_LINES];
    let logIdx = 0;
    const start = performance.now();

    const tick = (now: number): void => {
      const elapsed = now - start;
      const raw = Math.min(1, elapsed / LOAD_DURATION_MS);
      // Ease-in-out
      const t = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw;
      const pctInt = Math.round(t * 100);
      barFill.style.width = `${pctInt}%`;
      pctEl.textContent = `${pctInt}%`;

      // Reveal log lines at evenly-spaced time points
      const nextLineAt = (logIdx * LOAD_DURATION_MS) / lines.length;
      if (logIdx < lines.length && elapsed >= nextLineAt) {
        const line = document.createElement('div');
        line.textContent = lines[logIdx++];
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      }

      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        // Flush any remaining lines
        while (logIdx < lines.length) {
          const line = document.createElement('div');
          line.textContent = lines[logIdx++];
          logEl.appendChild(line);
        }
        logEl.scrollTop = logEl.scrollHeight;
        setTimeout(() => {
          overlay.remove();
          onDone();
        }, 350);
      }
    };

    requestAnimationFrame(tick);
  }
}
