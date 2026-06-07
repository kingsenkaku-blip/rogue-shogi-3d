import * as THREE from 'three';
import { Piece } from '../core/Piece';
import { COLORS } from '../core/constants';
import type { PieceType } from '../core/types';

/** Accent colours that mark special pieces (undefined => standard piece). */
const SPECIAL_ACCENT: Partial<Record<PieceType, number>> = {
  turret: 0x9aa6b2,
  ninja: 0x6c3bff,
  god: 0xffd24a,
  nuisance: 0x8a5a2b,
  golem: 0x808080,
  phoenix: 0xff6a3c,
  assassin: 0xff2a4a,
  healer: 0x5ad1a0,
  bomber: 0xff8c1a,
  archer: 0x3ad17a,
  witch: 0xb15cff,
  samurai: 0xc0392b,
  shieldbearer: 0x4a90d9,
  gambler: 0xe0c24a,
};

// Cache kanji textures so we don't rebuild canvases every frame.
const textureCache = new Map<string, THREE.Texture>();

function kanjiTexture(label: string, color: string, promoted: boolean): THREE.Texture {
  const cacheKey = `${label}|${color}|${promoted}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = promoted ? '#c0392b' : color;
  ctx.font = `bold ${size * 0.7}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size * 0.54);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Build a 3D mesh group for a piece: a koma body, a kanji decal on top,
 * a special-piece accent ring and an HP bar (for multi-HP pieces).
 * Returns a Group tagged with the piece id in userData.
 */
export function buildPieceMesh(piece: Piece): THREE.Group {
  const group = new THREE.Group();
  group.userData.pieceId = piece.id;

  const isPlayer = piece.owner === 'player';
  const def = piece.def;
  const accent = SPECIAL_ACCENT[piece.type];

  // ---- body ----
  const bodyColor = new THREE.Color(isPlayer ? COLORS.playerPiece : COLORS.aiPiece);
  if (accent !== undefined) bodyColor.lerp(new THREE.Color(accent), 0.35);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.22, 5),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.55,
      metalness: accent !== undefined ? 0.35 : 0.05,
      emissive: accent !== undefined ? new THREE.Color(accent).multiplyScalar(0.18) : 0x000000,
    }),
  );
  body.rotation.y = Math.PI / 2 + (isPlayer ? 0 : Math.PI); // point the pentagon forward
  body.position.y = 0.11;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ---- kanji decal facing up ----
  const textColor = isPlayer ? COLORS.playerText : COLORS.aiText;
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({
      map: kanjiTexture(piece.promoted && def.promotedLabel ? def.promotedLabel : def.label, textColor, piece.promoted),
      transparent: true,
      depthWrite: false,
    }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = isPlayer ? 0 : Math.PI; // orient text toward the owner
  decal.position.y = 0.225;
  group.add(decal);

  // ---- special accent ring ----
  if (accent !== undefined) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.52, 28),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    group.add(ring);
  }

  // ---- HP bar for multi-HP pieces ----
  if (piece.maxHp > 1) {
    group.add(buildHpBar(piece));
  }

  return group;
}

function buildHpBar(piece: Piece): THREE.Group {
  const bar = new THREE.Group();
  const w = 0.6;
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.85 }),
  );
  const ratio = Math.max(0, piece.hp / piece.maxHp);
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(w * ratio, 0.08),
    new THREE.MeshBasicMaterial({ color: ratio > 0.5 ? 0x35d07f : ratio > 0.25 ? 0xffb31a : 0xff3b6b }),
  );
  fg.position.set(-(w * (1 - ratio)) / 2, 0, 0.001);
  bar.add(bg, fg);
  bar.rotation.x = -Math.PI / 2;
  bar.position.set(0, 0.27, 0.34);
  return bar;
}

export function disposePieceMesh(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      // Don't dispose cached kanji textures; they're shared.
      else if (!(mat as THREE.MeshBasicMaterial).map) mat.dispose();
      else mat.dispose();
    }
  });
}
