import Phaser from 'phaser';
import type { FieldSpec, Obstacle, ObstacleKind, Vec2, WindZone } from '../types';
import { uid } from './geometry';
import { FieldRenderer } from './FieldRenderer';

export type FieldTool = 'select' | 'stand' | 'tree' | 'net' | 'crate' | 'wind' | 'erase';

interface DragState {
  kind: 'obstacle' | 'wind';
  id: string;
}

export class FieldEditor {
  field: FieldSpec;
  tool: FieldTool = 'select';
  private graphics: Phaser.GameObjects.Graphics;
  private drag?: DragState;

  constructor(
    private scene: Phaser.Scene,
    private renderer: FieldRenderer,
    field: FieldSpec,
    private onChange: (field: FieldSpec) => void
  ) {
    this.field = structuredClone(field);
    this.graphics = scene.add.graphics();
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.redraw();
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.graphics.destroy();
  }

  setTool(tool: FieldTool): void {
    this.tool = tool;
  }

  setField(field: FieldSpec): void {
    this.field = structuredClone(field);
    this.redraw();
  }

  setGlobalWind(angle: number, strength: number): void {
    this.field.globalWind = { angle, strength };
    this.commit();
  }

  redraw(): void {
    this.graphics.clear();
    for (const zone of this.field.windZones) {
      const a = this.renderer.toScreen({ x: zone.x, y: zone.y });
      this.graphics.fillStyle(0x38bdf8, 0.11);
      this.graphics.fillRect(a.x, a.y, zone.w * this.renderer.scale, zone.h * this.renderer.scale);
      this.graphics.lineStyle(2, 0x7dd3fc, 0.65);
      this.graphics.strokeRect(a.x, a.y, zone.w * this.renderer.scale, zone.h * this.renderer.scale);
      const center = this.renderer.toScreen({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 });
      this.graphics.save();
      this.graphics.translateCanvas(center.x, center.y);
      this.graphics.rotateCanvas(zone.angle);
      this.graphics.lineStyle(3, 0xe0f2fe, 0.85);
      this.graphics.beginPath();
      this.graphics.moveTo(-18, 0);
      this.graphics.lineTo(18, 0);
      this.graphics.lineTo(9, -7);
      this.graphics.moveTo(18, 0);
      this.graphics.lineTo(9, 7);
      this.graphics.strokePath();
      this.graphics.restore();
    }
  }

  private logical(pointer: Phaser.Input.Pointer): Vec2 {
    return this.renderer.toLogical({ x: pointer.x, y: pointer.y });
  }

  private hitObstacle(p: Vec2): Obstacle | undefined {
    return [...this.field.obstacles].reverse().find((o) => Math.abs(p.x - o.x) < o.w / 2 + 6 && Math.abs(p.y - o.y) < o.h / 2 + 6);
  }

  private hitWind(p: Vec2): WindZone | undefined {
    return [...this.field.windZones].reverse().find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const p = this.logical(pointer);
    if (p.x < 0 || p.y < 0 || p.x > this.field.width || p.y > this.field.height) return;

    const wind = this.hitWind(p);
    const obstacle = this.hitObstacle(p);
    if (this.tool === 'erase') {
      if (wind) this.field.windZones = this.field.windZones.filter((z) => z.id !== wind.id);
      if (obstacle) this.field.obstacles = this.field.obstacles.filter((o) => o.id !== obstacle.id);
      this.commit();
      return;
    }
    if (this.tool === 'select' || this.tool === 'wind') {
      if (wind) {
        this.drag = { kind: 'wind', id: wind.id };
        return;
      }
      if (obstacle) {
        this.drag = { kind: 'obstacle', id: obstacle.id };
        return;
      }
    }
    if (this.tool === 'wind') {
      const zone: WindZone = {
        id: uid('wind'),
        x: Phaser.Math.Clamp(p.x - 65, 0, this.field.width - 130),
        y: Phaser.Math.Clamp(p.y - 50, 0, this.field.height - 100),
        w: 130,
        h: 100,
        angle: this.field.globalWind.angle,
        strength: 28
      };
      this.field.windZones.push(zone);
      this.drag = { kind: 'wind', id: zone.id };
      this.commit();
      return;
    }

    const kinds: ObstacleKind[] = ['stand', 'tree', 'net', 'crate'];
    if (kinds.includes(this.tool as ObstacleKind)) {
      const kind = this.tool as ObstacleKind;
      const size = kind === 'tree' ? { w: 68, h: 68 } : kind === 'stand' ? { w: 32, h: 170 } : kind === 'net' ? { w: 110, h: 20 } : { w: 38, h: 72 };
      this.field.obstacles.push({
        id: uid('obstacle'),
        x: p.x,
        y: p.y,
        w: size.w,
        h: size.h,
        angle: 0,
        kind,
        label: kind === 'tree' ? '树' : kind === 'net' ? '防护网' : kind === 'stand' ? '看台' : '设备箱'
      });
      this.commit();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const p = this.logical(pointer);
    if (this.drag.kind === 'obstacle') {
      const o = this.field.obstacles.find((item) => item.id === this.drag!.id);
      if (o) {
        o.x = Phaser.Math.Clamp(p.x, o.w / 2, this.field.width - o.w / 2);
        o.y = Phaser.Math.Clamp(p.y, o.h / 2, this.field.height - o.h / 2);
      }
    } else {
      const z = this.field.windZones.find((item) => item.id === this.drag!.id);
      if (z) {
        z.x = Phaser.Math.Clamp(p.x - z.w / 2, 0, this.field.width - z.w);
        z.y = Phaser.Math.Clamp(p.y - z.h / 2, 0, this.field.height - z.h);
      }
    }
    this.commit();
  }

  private onPointerUp(): void {
    this.drag = undefined;
  }

  rotateSelected(angleDelta: number): void {
    const obstacle = this.field.obstacles[this.field.obstacles.length - 1];
    if (obstacle) {
      obstacle.angle += angleDelta;
      this.commit();
    }
  }

  private commit(): void {
    this.redraw();
    this.onChange(structuredClone(this.field));
  }
}
