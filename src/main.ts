import './style.css';
import { SceneManager } from './render/SceneManager';
import { BoardRenderer } from './render/BoardRenderer';
import { UIManager } from './ui/UIManager';
import { GameManager, type GameEvents } from './core/GameManager';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const sceneMgr = new SceneManager(canvas);
const renderer = new BoardRenderer(sceneMgr);
const ui = new UIManager(uiRoot);

/**
 * Wire the game's events to the renderer + UI. The GameManager itself knows
 * nothing about Three.js or the DOM — it only emits these events.
 */
function createGame(): GameManager {
  const events: GameEvents = {
    onState: () => {
      renderer.update(game);
      ui.refresh(game);
    },
    onCards: (cards) => {
      if (cards) ui.showCards(cards);
      else ui.hideCards();
    },
    onLog: (entry) => ui.pushLog(entry),
    onGameOver: (winner) => ui.showGameOver(winner),
    onMessage: (text) => ui.toast(text),
  };
  const game = new GameManager(events);
  return game;
}

let game = createGame();

// ----- input wiring -----
sceneMgr.onCellClick = (cell) => game.handleCellClick(cell.row, cell.col);
ui.onPickCard = (i) => game.chooseCard(i);
ui.onSelectHand = (type) => game.beginDrop(type);
ui.onSmite = () => game.beginSmite();
ui.onTaunt = () => game.taunt();
ui.onRestart = () => location.reload();

game.start();

// Debug hook: lets you poke at the running game from the console (e.g. window.game).
(window as unknown as { game: GameManager }).game = game;
