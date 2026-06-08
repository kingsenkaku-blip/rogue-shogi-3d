import './style.css';
import { SceneManager } from './render/SceneManager';
import { BoardRenderer } from './render/BoardRenderer';
import { UIManager } from './ui/UIManager';
import { CheatConsole } from './ui/CheatConsole';
import { GameManager, type GameEvents } from './core/GameManager';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

// These three live for the whole session; the GameManager is recreated per match.
const sceneMgr = new SceneManager(canvas);
const renderer = new BoardRenderer(sceneMgr);
const ui = new UIManager(uiRoot);
// DEV only — no-op in production builds.
new CheatConsole();

let game: GameManager | null = null;

/**
 * Build a fresh GameManager wired to the renderer + UI. The GameManager itself
 * knows nothing about Three.js or the DOM — it only emits these events.
 */
function createGame(): GameManager {
  const events: GameEvents = {
    onState: () => {
      renderer.update(g);
      ui.refresh(g);
    },
    onCards: (cards) => (cards ? ui.showCards(cards) : ui.hideCards()),
    onLog: (entry) => ui.pushLog(entry),
    onGameOver: (winner) => ui.showGameOver(winner),
    onMessage: (text) => ui.toast(text),
  };
  const g = new GameManager(events);
  return g;
}

function startGame(characterId: string): void {
  game = createGame();
  ui.hideHome();
  ui.hideCharacterSelect();
  game.start(characterId);
  // Debug hook: poke the running game from the console via window.game.
  (window as unknown as { game: GameManager }).game = game;
}

// ----- input wiring (all guarded: no game exists on the title screen) -----
sceneMgr.onCellClick = (cell) => game?.handleCellClick(cell.row, cell.col);
ui.onPickCard = (i) => game?.chooseCard(i);
ui.onSelectHand = (type) => game?.beginDrop(type);
ui.onSmite = () => game?.beginSmite();
ui.onTaunt = () => game?.taunt();
ui.onUltimate = () => game?.useUltimate();

// ----- screen flow: title → character select → match → (game over) → title -----
ui.onStartHome = () => ui.showCharacterSelect();
ui.onPickCharacter = (id) => startGame(id);
ui.onRestart = () => ui.showHome();

ui.showHome();
