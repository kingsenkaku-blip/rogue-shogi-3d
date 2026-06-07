import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { buildPieceMesh, disposePieceMesh } from './PieceMesh';
import { BOARD_SIZE, TILE_SIZE, COLORS, TILE_COLOR_MAP, START_HOME_HP } from '../core/constants';
import type { GameManager, Highlight } from '../core/GameManager';
import type { Player } from '../core/types';

const HIGHLIGHT_COLOR: Record<Highlight['kind'], number> = {
  select: COLORS.select,
  move: COLORS.moveHint,
  attack: COLORS.attackHint,
  smite: 0xb15cff,
};

/**
 * Builds and updates all 3D board content from the game state.
 * `update()` is cheap to call on every state change (small object counts).
 */
export class BoardRenderer {
  private scene: THREE.Scene;
  private pieceGroup = new THREE.Group();
  private tileGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();
  private homePlates: Record<Player, THREE.Mesh> = {} as Record<Player, THREE.Mesh>;
  private pulse: THREE.Object3D[] = [];

  constructor(private sceneMgr: SceneManager) {
    this.scene = sceneMgr.scene;
    this.buildStaticBoard();
    this.scene.add(this.tileGroup, this.pieceGroup, this.highlightGroup);
    sceneMgr.onFrame((t) => this.animatePulse(t));
  }

  private buildStaticBoard(): void {
    const span = BOARD_SIZE * TILE_SIZE;

    // Wooden frame.
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(span + 0.8, 0.5, span + 0.8),
      new THREE.MeshStandardMaterial({ color: COLORS.boardFrame, roughness: 0.7 }),
    );
    frame.position.y = -0.26;
    frame.receiveShadow = true;
    this.scene.add(frame);

    // Playing surface.
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.1, span),
      new THREE.MeshStandardMaterial({ color: COLORS.boardLight, roughness: 0.6 }),
    );
    surface.position.y = -0.005;
    surface.receiveShadow = true;
    this.scene.add(surface);

    // Grid lines.
    const pts: number[] = [];
    const half = span / 2;
    for (let i = 0; i <= BOARD_SIZE; i++) {
      const p = -half + i * TILE_SIZE;
      pts.push(-half, 0.051, p, half, 0.051, p);
      pts.push(p, 0.051, -half, p, 0.051, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x6b4a23, transparent: true, opacity: 0.6 }),
    );
    this.scene.add(grid);

    // Home-base plates behind each back rank (recoloured by HP in update()).
    this.homePlates.ai = this.makeHomePlate(-(half + 0.75), 0x4a90d9);
    this.homePlates.player = this.makeHomePlate(half + 0.75, 0x35d07f);
  }

  private makeHomePlate(z: number, color: number): THREE.Mesh {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_SIZE * TILE_SIZE, 0.3, 0.9),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 }),
    );
    plate.position.set(0, 0.1, z);
    plate.castShadow = true;
    this.scene.add(plate);
    return plate;
  }

  /** Rebuild dynamic content (pieces, tiles, highlights) from game state. */
  update(game: GameManager): void {
    this.rebuildPieces(game);
    this.rebuildTiles(game);
    this.rebuildHighlights(game);
    this.updateHomePlates(game);
  }

  private rebuildPieces(game: GameManager): void {
    this.clearGroup(this.pieceGroup, true);
    for (const piece of game.board.allPieces()) {
      const mesh = buildPieceMesh(piece);
      const pos = SceneManager.cellToWorld(piece.row, piece.col);
      mesh.position.copy(pos);
      if (piece === game.selected) mesh.position.y += 0.18; // lift the selected piece
      this.pieceGroup.add(mesh);
    }
  }

  private rebuildTiles(game: GameManager): void {
    this.clearGroup(this.tileGroup, false);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const t = game.board.tiles[r][c];
        if (t === 'normal') continue;
        const color = TILE_COLOR_MAP[t] ?? 0xffffff;
        const tile = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE_SIZE * 0.92, TILE_SIZE * 0.92),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
        );
        tile.rotation.x = -Math.PI / 2;
        tile.position.copy(SceneManager.cellToWorld(r, c, 0.06));
        this.tileGroup.add(tile);
      }
    }
  }

  private rebuildHighlights(game: GameManager): void {
    this.clearGroup(this.highlightGroup, false);
    this.pulse = [];
    for (const h of game.getHighlights()) {
      const color = HIGHLIGHT_COLOR[h.kind];
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.46, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(SceneManager.cellToWorld(h.pos.row, h.pos.col, 0.08));
      this.highlightGroup.add(ring);
      if (h.kind !== 'select') this.pulse.push(ring);
    }
  }

  private updateHomePlates(game: GameManager): void {
    for (const who of ['player', 'ai'] as Player[]) {
      const st = game.players[who];
      const ratio = Math.max(0.05, st.homeHp / Math.max(START_HOME_HP, st.maxHomeHp));
      const mat = this.homePlates[who].material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.25 + ratio * 0.6;
      this.homePlates[who].scale.x = 0.4 + ratio * 0.6;
    }
  }

  private animatePulse(t: number): void {
    const s = 1 + Math.sin(t * 0.006) * 0.12;
    for (const obj of this.pulse) obj.scale.setScalar(s);
  }

  private clearGroup(group: THREE.Group, dispose: boolean): void {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      group.remove(child);
      if (dispose && child instanceof THREE.Group) disposePieceMesh(child);
      else if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }
}
