import type { FieldSpec, Obstacle, Vec2, Waypoint, WindVector } from '../types';

export const TAU = Math.PI * 2;

export function vec(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  return l < 1e-6 ? vec(1, 0) : { x: a.x / l, y: a.y / l };
}

export function fromAngle(angle: number, magnitude = 1): Vec2 {
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clampPointToField(p: Vec2, field: FieldSpec, margin = 8): Vec2 {
  return {
    x: clamp(p.x, margin, field.width - margin),
    y: clamp(p.y, margin, field.height - margin)
  };
}

export function pointInRect(p: Vec2, rect: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

export function pointInRotatedRect(p: Vec2, o: Obstacle, inflation = 0): boolean {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const angle = -o.angle;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  return (
    Math.abs(localX) <= o.w / 2 + inflation &&
    Math.abs(localY) <= o.h / 2 + inflation
  );
}

interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function rotatedAABB(o: Obstacle, inflation: number): AABB {
  const cr = Math.abs(Math.cos(o.angle)) * (o.w / 2 + inflation);
  const sr = Math.abs(Math.sin(o.angle)) * (o.w / 2 + inflation);
  const cr2 = Math.abs(Math.cos(o.angle)) * (o.h / 2 + inflation);
  const sr2 = Math.abs(Math.sin(o.angle)) * (o.h / 2 + inflation);
  const hx = cr + sr2;
  const hy = sr + cr2;
  return { minX: o.x - hx, maxX: o.x + hx, minY: o.y - hy, maxY: o.y + hy };
}

export function segmentIntersectsRotatedRect(a: Vec2, b: Vec2, o: Obstacle, inflation = 10): boolean {
  const aabb = rotatedAABB(o, inflation);
  if (
    Math.max(a.x, b.x) < aabb.minX ||
    Math.min(a.x, b.x) > aabb.maxX ||
    Math.max(a.y, b.y) < aabb.minY ||
    Math.min(a.y, b.y) > aabb.maxY
  ) {
    return false;
  }

  // Conservative sampled segment. Field coordinates are short and routes are
  // hand-drawn, so this is deterministic and catches rotated narrow obstacles.
  const samples = Math.max(8, Math.ceil(distance(a, b) / 4));
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    if (pointInRotatedRect(p, o, inflation)) return true;
  }
  return false;
}

export function routeLength(points: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

export function sprintDistance(points: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].pace === 'sprint') total += distance(points[i - 1], points[i]);
  }
  return total;
}

export function positionAlongPolyline(points: Vec2[], distanceTraveled: number): { pos: Vec2; angle: number; done: boolean } {
  let remaining = distanceTraveled;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = distance(a, b);
    if (remaining <= seg) {
      const dir = normalize(sub(b, a));
      return {
        pos: { x: a.x + dir.x * remaining, y: a.y + dir.y * remaining },
        angle: Math.atan2(dir.y, dir.x),
        done: false
      };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1];
  const prev = points[Math.max(0, points.length - 2)];
  return { pos: { ...last }, angle: Math.atan2(last.y - prev.y, last.x - prev.x), done: true };
}

export function routeBlocksField(field: FieldSpec): boolean {
  return field.obstacles.some((o) => o.kind === 'net' || o.kind === 'stand');
}

export function windAt(p: Vec2, field: FieldSpec): Vec2 {
  let x = Math.cos(field.globalWind.angle) * field.globalWind.strength;
  let y = Math.sin(field.globalWind.angle) * field.globalWind.strength;
  for (const zone of field.windZones) {
    if (pointInRect(p, zone)) {
      x += Math.cos(zone.angle) * zone.strength;
      y += Math.sin(zone.angle) * zone.strength;
    }
  }
  return { x, y };
}

export function describeWind(w: WindVector): string {
  if (w.strength < 4) return '微风';
  if (w.strength < 28) return '中风';
  return '强风';
}

export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}
