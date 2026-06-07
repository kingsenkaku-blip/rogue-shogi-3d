import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BOARD_SIZE, TILE_SIZE } from '../core/constants';
import type { Vec2 } from '../core/types';

/**
 * Owns the Three.js scene, camera, renderer, lights and orbit controls.
 * Translates pointer clicks on the board plane into (row, col) cell coordinates.
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pickPlane: THREE.Mesh;
  private frameCbs: Array<(t: number) => void> = [];
  private downPos = { x: 0, y: 0 };

  onCellClick: (cell: Vec2) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x10131c);
    this.scene.fog = new THREE.Fog(0x10131c, 22, 40);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 11.5, 11.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.49; // don't go under the board
    this.controls.update();

    this.setupLights();

    // Invisible plane used purely for click → cell raycasting.
    const span = BOARD_SIZE * TILE_SIZE;
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);

    this.bindInput(canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.animate(0);
  }

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x33240f, 0.5));

    const key = new THREE.DirectionalLight(0xfff2d8, 1.15);
    key.position.set(6, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 9;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x6c8bff, 0.4);
    rim.position.set(-8, 6, -8);
    this.scene.add(rim);
  }

  /** Convert a board cell to a world position (centre of the cell). */
  static cellToWorld(row: number, col: number, y = 0): THREE.Vector3 {
    const half = (BOARD_SIZE - 1) / 2;
    return new THREE.Vector3((col - half) * TILE_SIZE, y, (row - half) * TILE_SIZE);
  }

  onFrame(cb: (t: number) => void): void {
    this.frameCbs.push(cb);
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      this.downPos = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      // Treat as a click only if the pointer barely moved (else it was an orbit drag).
      const moved = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
      if (moved > 6) return;
      const cell = this.pickCell(e);
      if (cell) this.onCellClick(cell);
    });
  }

  private pickCell(e: PointerEvent): Vec2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.pickPlane);
    if (!hits.length) return null;
    const p = hits[0].point;
    const half = (BOARD_SIZE - 1) / 2;
    const col = Math.round(p.x / TILE_SIZE + half);
    const row = Math.round(p.z / TILE_SIZE + half);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    return { row, col };
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private animate = (t: number): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    for (const cb of this.frameCbs) cb(t);
    this.renderer.render(this.scene, this.camera);
  };
}
