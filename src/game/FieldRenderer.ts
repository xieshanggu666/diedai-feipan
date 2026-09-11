import type Phaser from 'phaser';
import type { FieldSpec, GamePlan, Team, Vec2, WindZone } from '../types';
import { TAU, windAt } from './geometry';

export interface RenderOptions {
  showWindArrows?: boolean;
  showStart?: boolean;
}

export class FieldRenderer {
  constructor(
    public field: FieldSpec,
    public scale: number,
    public originX: number,
    public originY: number
  ) {}

  toScreen(p: Vec2): Vec2 {
    return { x: this.originX + p.x * this.scale, y: this.originY + p.y * this.scale };
  }

  toLogical(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.originX) / this.scale,
      y: (screen.y - this.originY) / this.scale
    };
  }

  fitTo(scene: Phaser.Scene, topOffset = 24): void {
    const scale = Math.min(
      (scene.scale.width - 44) / this.field.width,
      (scene.scale.height - topOffset - 24) / this.field.height
    );
    const renderedW = this.field.width * scale;
    const renderedH = this.field.height * scale;
    this.scale = scale;
    this.originX = (scene.scale.width - renderedW) / 2;
    this.originY = (scene.scale.height - renderedH) / 2 + topOffset * 0.2;
  }

  draw(graphics: Phaser.GameObjects.Graphics, options: RenderOptions = {}): void {
    const { width, height, endzoneDepth } = this.field;
    graphics.fillStyle(0x07150f, 1);
    graphics.fillRect(this.originX - 22, this.originY - 22, width * this.scale + 44, height * this.scale + 44);

    for (let i = 0; i < 12; i += 1) {
      graphics.fillStyle(i % 2 ? 0x10331f : 0x0d2b1a, 1);
      graphics.fillRect(this.originX, this.originY + (i * height) / 12 * this.scale, width * this.scale, (height / 12) * this.scale + 1);
    }

    graphics.fillStyle(0x0d4a31, 0.95);
    graphics.fillRect(
      this.originX + (width - endzoneDepth) * this.scale,
      this.originY,
      endzoneDepth * this.scale,
      height * this.scale
    );
    graphics.lineStyle(3, 0xf8fafc, 0.9);
    graphics.strokeRect(this.originX, this.originY, width * this.scale, height * this.scale);
    graphics.lineBetween(
      this.originX + (width - endzoneDepth) * this.scale,
      this.originY,
      this.originX + (width - endzoneDepth) * this.scale,
      this.originY + height * this.scale
    );

    graphics.lineStyle(2, 0xffffff, 0.22);
    for (let x = 90; x < width - endzoneDepth; x += 90) {
      graphics.lineBetween(this.originX + x * this.scale, this.originY, this.originX + x * this.scale, this.originY + height * this.scale);
    }
    graphics.lineStyle(2, 0xfef08a, 0.16);
    graphics.save();
    graphics.translateCanvas(this.originX + width * 0.53 * this.scale, this.originY + height * 0.5 * this.scale);
    graphics.scaleCanvas((52 / 120), 1);
    graphics.strokeCircle(0, 0, 120 * this.scale);
    graphics.restore();

    this.drawObstacles(graphics);
    if (options.showWindArrows !== false) this.drawWind(graphics);
    if (options.showStart !== false) {
      graphics.lineStyle(2, 0x2dd4bf, 0.35);
      graphics.strokeCircle(this.originX + 96 * this.scale, this.originY + height * 0.5 * this.scale, 22 * this.scale);
    }
  }

  private drawObstacles(graphics: Phaser.GameObjects.Graphics): void {
    for (const o of this.field.obstacles) {
      const center = this.toScreen(o);
      const color = o.kind === 'tree' ? 0x166534 : o.kind === 'net' ? 0x60a5fa : o.kind === 'stand' ? 0x64748b : 0xa16207;
      graphics.save();
      graphics.translateCanvas(center.x, center.y);
      graphics.rotateCanvas(o.angle);
      graphics.fillStyle(color, 0.82);
      graphics.lineStyle(2, 0xe2e8f0, 0.45);
      graphics.fillRoundedRect(-(o.w * this.scale) / 2, -(o.h * this.scale) / 2, o.w * this.scale, o.h * this.scale, 5);
      graphics.strokeRoundedRect(-(o.w * this.scale) / 2, -(o.h * this.scale) / 2, o.w * this.scale, o.h * this.scale, 5);
      if (o.kind === 'tree') {
        graphics.lineStyle(2, 0x86efac, 0.55);
        graphics.strokeCircle(0, 0, Math.min(o.w, o.h) * 0.32 * this.scale);
      }
      graphics.restore();
    }
  }

  private arrow(graphics: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, size: number, alpha: number): void {
    graphics.save();
    graphics.translateCanvas(x, y);
    graphics.rotateCanvas(angle);
    graphics.lineStyle(2, 0x7dd3fc, alpha);
    graphics.beginPath();
    graphics.moveTo(-size * 0.5, 0);
    graphics.lineTo(size * 0.5, 0);
    graphics.lineTo(size * 0.22, -size * 0.22);
    graphics.moveTo(size * 0.5, 0);
    graphics.lineTo(size * 0.22, size * 0.22);
    graphics.strokePath();
    graphics.restore();
  }

  private drawWind(graphics: Phaser.GameObjects.Graphics): void {
    const zones: WindZone[] = [
      {
        id: 'global',
        x: 0,
        y: 0,
        w: this.field.width,
        h: this.field.height,
        angle: this.field.globalWind.angle,
        strength: this.field.globalWind.strength
      },
      ...this.field.windZones
    ];
    for (const zone of zones) {
      if (zone.id !== 'global') {
        graphics.lineStyle(2, 0x38bdf8, 0.28);
        graphics.strokeRect(
          this.originX + zone.x * this.scale,
          this.originY + zone.y * this.scale,
          zone.w * this.scale,
          zone.h * this.scale
        );
      }
      const step = 72;
      for (let x = Math.max(35, zone.x + 35); x < Math.min(this.field.width - 20, zone.x + zone.w); x += step) {
        for (let y = Math.max(35, zone.y + 35); y < Math.min(this.field.height - 20, zone.h + zone.y); y += step) {
          const wind = windAt({ x, y }, this.field);
          const power = Math.hypot(wind.x, wind.y);
          if (power < 3) continue;
          const screen = this.toScreen({ x, y });
          this.arrow(graphics, screen.x, screen.y, Math.atan2(wind.y, wind.x), 13 + Math.min(12, power * 0.28), 0.18 + Math.min(0.48, power / 80));
        }
      }
    }
  }
}

export function drawPlayer(
  graphics: Phaser.GameObjects.Graphics,
  renderer: FieldRenderer,
  p: { x: number; y: number; side?: 'home' | 'away'; caught?: boolean; energy?: number; maxEnergy?: number },
  color: number,
  radius = 11,
  ring = 0xffffff
): void {
  const s = renderer.toScreen(p);
  graphics.fillStyle(p.side === 'away' ? 0x111827 : color, 0.95);
  graphics.lineStyle(3, p.side === 'away' ? color : ring, 0.95);
  graphics.fillCircle(s.x, s.y, radius * renderer.scale);
  graphics.strokeCircle(s.x, s.y, radius * renderer.scale);
  if (p.caught) {
    graphics.lineStyle(3, 0xfef08a, 1);
    graphics.strokeCircle(s.x, s.y, (radius + 5) * renderer.scale);
  }
  if (typeof p.energy === 'number' && typeof p.maxEnergy === 'number') {
    const ratio = Math.max(0, Math.min(1, p.energy / p.maxEnergy));
    graphics.fillStyle(0x020617, 0.65);
    graphics.fillRect(s.x - 14 * renderer.scale, s.y - 20 * renderer.scale, 28 * renderer.scale, 4 * renderer.scale);
    graphics.fillStyle(ratio < 0.25 ? 0xef4444 : ratio < 0.5 ? 0xf59e0b : 0x22c55e, 1);
    graphics.fillRect(s.x - 14 * renderer.scale, s.y - 20 * renderer.scale, 28 * renderer.scale * ratio, 4 * renderer.scale);
  }
}

export function drawDisk(graphics: Phaser.GameObjects.Graphics, renderer: FieldRenderer, disk: { x: number; y: number; z?: number; holderId?: string }): void {
  if (disk.holderId) return;
  const s = renderer.toScreen(disk);
  const elevation = (disk.z ?? 0) * 0.18;
  graphics.fillStyle(0x000000, 0.18);
  fillEllipse(graphics, s.x + 3, s.y + 5, 8 * renderer.scale, 4 * renderer.scale, true);
  graphics.fillStyle(0xfef3c7, 1);
  graphics.lineStyle(2, 0xf97316, 1);
  fillEllipse(graphics, s.x - elevation, s.y - elevation, 8 * renderer.scale, 4 * renderer.scale);
}

function fillEllipse(graphics: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, fillOnly = false): void {
  graphics.save();
  graphics.translateCanvas(x, y);
  graphics.scaleCanvas(rx / ry, 1);
  graphics.fillCircle(0, 0, ry);
  if (!fillOnly) graphics.strokeCircle(0, 0, ry);
  graphics.restore();
}

export function drawPlan(graphics: Phaser.GameObjects.Graphics, renderer: FieldRenderer, plan: GamePlan, team: Team, selectedId?: string): void {
    graphics.lineStyle(3, 0xfef08a, 0.28);
  for (const cue of plan.cues) {
    const from = plan.routes[cue.fromId]?.points[Math.min(cue.atWaypoint, plan.routes[cue.fromId].points.length - 1)];
    const receiver = plan.routes[cue.toId];
    const to = receiver?.points[Math.min(receiver.points.length - 1, Math.max(1, cue.atWaypoint + 1))] ?? receiver?.points[0];
    if (!from || !to) continue;
    const a = renderer.toScreen(from);
    const b = renderer.toScreen(to);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.strokePath();
    drawArrowHead(graphics, a, b, 0xfef08a, 0.42);
  }

  for (const route of Object.values(plan.routes)) {
    const player = team.players.find((p) => p.id === route.playerId);
    const color = player?.color ?? 0xffffff;
    const selected = route.playerId === selectedId;
    graphics.lineStyle(selected ? 5 : 3, color, selected ? 1 : 0.72);
    graphics.beginPath();
    route.points.forEach((point, i) => {
      const s = renderer.toScreen(point);
      if (i === 0) graphics.moveTo(s.x, s.y);
      else graphics.lineTo(s.x, s.y);
    });
    graphics.strokePath();

    route.points.forEach((point, i) => {
      const s = renderer.toScreen(point);
      if (i === 0) {
        graphics.fillStyle(0xffffff, 0.9);
        graphics.fillCircle(s.x, s.y, 5 * renderer.scale);
      } else {
        graphics.fillStyle(point.pace === 'sprint' ? 0xef4444 : point.pace === 'run' ? 0xfacc15 : 0x86efac, 1);
        graphics.lineStyle(2, 0x0f172a, 0.9);
        graphics.fillCircle(s.x, s.y, (selected ? 7 : 5.5) * renderer.scale);
        graphics.strokeCircle(s.x, s.y, (selected ? 7 : 5.5) * renderer.scale);
      }
    });
  }
}

export function drawArrowHead(graphics: Phaser.GameObjects.Graphics, a: Vec2, b: Vec2, color: number, alpha: number): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const size = 12;
  graphics.save();
  graphics.translateCanvas(b.x, b.y);
  graphics.rotateCanvas(angle);
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(0, 0);
  graphics.lineTo(-size, -size * 0.45);
  graphics.lineTo(-size, size * 0.45);
  graphics.closePath();
  graphics.fillPath();
  graphics.restore();
}

export function fitField(scene: Phaser.Scene, field: FieldSpec, topOffset = 24): FieldRenderer {
  const renderer = new FieldRenderer(field, 1, 0, 0);
  renderer.fitTo(scene, topOffset);
  return renderer;
}

export function tintToHex(tint: number): number {
  return tint;
}

export { TAU };
