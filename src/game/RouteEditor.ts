import Phaser from 'phaser';
import type { FieldSpec, GamePlan, Pace, PassCue, Team, Vec2 } from '../types';
import { distance, uid } from './geometry';
import { drawPlan, FieldRenderer } from './FieldRenderer';

export type RouteTool = 'route' | 'pass' | 'eraser';

export interface RouteEditorOptions {
  lockedStarts?: boolean;
  onChange: (plan: GamePlan) => void;
}

interface DragState {
  playerId: string;
  index: number;
}

export class RouteEditor {
  plan: GamePlan;
  tool: RouteTool = 'route';
  pace: Pace = 'run';
  selectedId?: string;
  passFromId?: string;
  private graphics: Phaser.GameObjects.Graphics;
  private drag?: DragState;
  private dirty = true;

  constructor(
    private scene: Phaser.Scene,
    private renderer: FieldRenderer,
    plan: GamePlan,
    private team: Team,
    private field: FieldSpec,
    private options: RouteEditorOptions
  ) {
    this.plan = structuredClone(plan);
    this.graphics = scene.add.graphics();
    this.selectedId = team.players[0]?.id;
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.graphics.destroy();
  }

  setPlan(plan: GamePlan): void {
    this.plan = structuredClone(plan);
    this.dirty = true;
  }

  setTool(tool: RouteTool): void {
    this.tool = tool;
    this.passFromId = undefined;
    this.dirty = true;
  }

  setPace(pace: Pace): void {
    this.pace = pace;
  }

  selectPlayer(id: string): void {
    this.selectedId = id;
    this.dirty = true;
  }

  redraw(): void {
    if (!this.dirty) return;
    this.graphics.clear();
    drawPlan(this.graphics, this.renderer, this.plan, this.team, this.selectedId);
    this.drawPassHandles();
    this.dirty = false;
  }

  private drawPassHandles(): void {
    for (const cue of this.plan.cues) {
      const from = this.plan.routes[cue.fromId]?.points[Math.min(cue.atWaypoint, this.plan.routes[cue.fromId].points.length - 1)];
      const receiver = this.plan.routes[cue.toId];
      const to = receiver?.points[Math.min(receiver.points.length - 1, Math.max(1, cue.atWaypoint + 1))] ?? receiver?.points[0];
      if (!from || !to) continue;
      const mid = this.renderer.toScreen({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
      this.graphics.fillStyle(0xfef08a, 0.95);
      this.graphics.fillCircle(mid.x, mid.y, 7);
      this.graphics.lineStyle(2, 0x111827, 1);
      this.graphics.strokeCircle(mid.x, mid.y, 7);
    }
  }

  private logical(pointer: Phaser.Input.Pointer): Vec2 {
    return this.renderer.toLogical({ x: pointer.x, y: pointer.y });
  }

  private hitWaypoint(p: Vec2): DragState | undefined {
    let best: { hit: DragState; distance: number } | undefined;
    for (const route of Object.values(this.plan.routes)) {
      route.points.forEach((point, index) => {
        const d = distance(point, p);
        if (d < 13 / this.renderer.scale && (!best || d < best.distance)) {
          best = { hit: { playerId: route.playerId, index }, distance: d };
        }
      });
    }
    return best?.hit;
  }

  private hitPlayer(p: Vec2): string | undefined {
    let best: { id: string; distance: number } | undefined;
    for (const id of Object.keys(this.plan.routes)) {
      const start = this.plan.routes[id].points[0];
      const d = distance(start, p);
      if (d < 17 / this.renderer.scale && (!best || d < best.distance)) best = { id, distance: d };
    }
    return best?.id;
  }

  private hitCue(p: Vec2): PassCue | undefined {
    return this.plan.cues.find((cue) => {
      const from = this.plan.routes[cue.fromId]?.points[Math.min(cue.atWaypoint, this.plan.routes[cue.fromId].points.length - 1)];
      const receiver = this.plan.routes[cue.toId];
      const to = receiver?.points[Math.min(receiver.points.length - 1, Math.max(1, cue.atWaypoint + 1))] ?? receiver?.points[0];
      if (!from || !to) return false;
      return distance(p, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }) < 14 / this.renderer.scale;
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const p = this.logical(pointer);
    if (p.x < 0 || p.y < 0 || p.x > this.field.width || p.y > this.field.height) return;

    const cue = this.hitCue(p);
    if (this.tool === 'eraser' && cue) {
      this.plan.cues = this.plan.cues.filter((c) => c.id !== cue.id);
      this.commit();
      return;
    }
    if (this.tool === 'pass') {
      if (cue) {
        this.plan.cues = this.plan.cues.filter((c) => c.id !== cue.id);
        this.commit();
        return;
      }
      const playerId = this.hitPlayer(p);
      if (!playerId) return;
      if (!this.passFromId) this.passFromId = playerId;
      else if (this.passFromId !== playerId) this.addCue(this.passFromId, playerId);
      else this.passFromId = undefined;
      this.dirty = true;
      return;
    }

    const hit = this.hitWaypoint(p);
    if (this.tool === 'eraser') {
      if (hit && hit.index > 0) {
        this.plan.routes[hit.playerId].points.splice(hit.index, 1);
        this.commit();
      }
      return;
    }

    if (hit) {
      this.selectedId = hit.playerId;
      if (!(this.options.lockedStarts && hit.index === 0)) this.drag = hit;
      return;
    }

    if (this.tool === 'route' && this.selectedId) {
      const route = this.plan.routes[this.selectedId];
      route.points.push({ x: p.x, y: p.y, pace: this.pace });
      this.drag = { playerId: this.selectedId, index: route.points.length - 1 };
      this.commit();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const p = this.logical(pointer);
    const route = this.plan.routes[this.drag.playerId];
    const point = route.points[this.drag.index];
    point.x = Phaser.Math.Clamp(p.x, 8, this.field.width - 8);
    point.y = Phaser.Math.Clamp(p.y, 8, this.field.height - 8);
    this.dirty = true;
  }

  private onPointerUp(): void {
    if (this.drag) this.commit();
    this.drag = undefined;
  }

  private addCue(fromId: string, toId: string): void {
    const route = this.plan.routes[fromId];
    const at = Math.max(1, route.points.length - 1);
    const existing = this.plan.cues.find((c) => c.fromId === fromId && c.toId === toId && c.atWaypoint === at);
    if (!existing) {
      this.plan.cues.push({ id: uid('cue'), fromId, toId, atWaypoint: at, delay: 0.35, lead: 32 });
    }
    this.passFromId = undefined;
    this.commit();
  }

  removeSelectedWaypoint(): void {
    if (!this.selectedId) return;
    const points = this.plan.routes[this.selectedId].points;
    if (points.length > 1) points.pop();
    this.commit();
  }

  clearSelectedRoute(): void {
    if (!this.selectedId) return;
    const start = this.plan.routes[this.selectedId].points[0];
    this.plan.routes[this.selectedId].points = [{ ...start, pace: 'jog' }];
    this.plan.cues = this.plan.cues.filter((c) => c.fromId !== this.selectedId && c.toId !== this.selectedId);
    this.commit();
  }

  private commit(): void {
    this.dirty = true;
    this.options.onChange(structuredClone(this.plan));
  }
}
