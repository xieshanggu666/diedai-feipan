import Phaser from 'phaser';
import type { Pace, RouteValidation, Team } from '../types';
import { BaseFieldScene } from './BaseFieldScene';
import { RouteEditor, type RouteTool } from '../game/RouteEditor';
import { validatePlan } from '../game/plans';
import { playSfx, unlockAudio } from '../audio';
import { currentPlanFor, useAppStore, type PlanSession, type Screen } from '../store/useAppStore';
import { HOME_TEAM } from '../data/gameData';
import { drawPlayer } from '../game/FieldRenderer';

export class PlanScene extends BaseFieldScene {
  private homeTeam: Team = HOME_TEAM;
  private editor!: RouteEditor;
  private validationRoot!: HTMLDivElement;
  private starterIds: string[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private validation: RouteValidation = { ok: false, errors: [], warnings: [] };
  private session?: PlanSession;
  private returnScreen: Screen = 'season';

  constructor() {
    super('plan');
  }

  create(): void {
    super.create();
    const store = useAppStore.getState();
    this.session = store.planSession;
    this.returnScreen = this.session?.returnScreen ?? 'season';
    this.starterIds = this.session?.starterIds ?? store.starterIds;
    const plan = currentPlanFor(this.field, this.starterIds, this.session?.plan ?? store.plans[this.field.id]);
    const starters = HOME_TEAM.players.filter((p) => this.starterIds.includes(p.id));
    this.homeTeam = { ...HOME_TEAM, players: starters };
    this.editor = new RouteEditor(this, this.fieldView, plan, this.homeTeam, this.field, {
      onChange: () => this.refreshValidation(false)
    });
    this.drawStaticField();
    this.makeControls();
    this.labels = this.homeTeam.players.map((player) => {
      const point = this.editor.plan.routes[player.id]?.points[0];
      const s = this.fieldView.toScreen(point ?? { x: 0, y: 0 });
      return this.add.text(s.x, s.y - 28, player.name, { color: '#e0f2fe', fontSize: '12px', fontFamily: 'system-ui' }).setOrigin(0.5);
    });
    this.refreshValidation(true);

    this.events.on(Phaser.Scenes.Events.UPDATE, this.redraw, this);
    this.input.keyboard?.on('keydown-ESC', () => {
      useAppStore.getState().setScreen(this.returnScreen);
    });
  }

  private redraw(): void {
    this.drawStaticField();
    this.editor.redraw();
    this.homeTeam.players.forEach((player, index) => {
      const point = this.editor.plan.routes[player.id]?.points[0];
      if (point) {
        drawPlayer(
          this.graphics,
          this.fieldView,
          { ...point, energy: undefined, maxEnergy: undefined },
          player.color,
          this.editor.selectedId === player.id ? 13 : 11
        );
        const s = this.fieldView.toScreen({ x: point.x, y: point.y - 22 });
        this.labels[index]?.setPosition(s.x, s.y - 6);
      }
    });
    this.drawFocusMarker();
  }

  private drawFocusMarker(): void {
    const focus = this.session?.focus;
    if (focus?.x === undefined || focus.y === undefined) return;
    const s = this.fieldView.toScreen({ x: focus.x, y: focus.y });
    const pulse = 2.5 * Math.sin(this.time.now / 220);
    this.graphics.lineStyle(2, 0xef4444, 0.95);
    this.graphics.strokeCircle(s.x, s.y, 15 + pulse);
    this.graphics.lineBetween(s.x - 8, s.y - 8, s.x + 8, s.y + 8);
    this.graphics.lineBetween(s.x - 8, s.y + 8, s.x + 8, s.y - 8);
  }

  private makeControls(): void {
    const root = this.makeUi('plan-ui');
    const focus = this.session?.focus;
    root.innerHTML = `
      <div class="panel topbar">
        <div>
          <strong>战术路线</strong>
          <span class="muted">黄色线是传接意图；受风、盯人和接球判定影响，不代表盘一定能到。</span>
        </div>
        <div class="row gap">
          <button data-action="back">${this.returnScreen === 'replay' ? '返回回放' : '返回赛程'}</button>
          <button class="primary" data-action="save">保存路线</button>
        </div>
      </div>
      ${focus ? `<div class="panel focus-banner">针对 <b>${focus.time.toFixed(1)}s</b> 的失误「${focus.message}」调整路线 · ${this.field.name}</div>` : ''}
      <div class="panel left-tools">
        <div class="tool-grid">
          <button data-tool="route" class="active">路线</button>
          <button data-tool="pass">传接</button>
          <button data-tool="eraser">删除</button>
        </div>
        <div class="pace-box">
          <span>新点速度</span>
          <button data-pace="jog">慢跑</button>
          <button data-pace="run" class="active">正常</button>
          <button data-pace="sprint">冲刺</button>
        </div>
        <div class="players"></div>
        <button data-action="undo" class="small">删除最后一点</button>
        <button data-action="clear" class="small danger">清空当前路线</button>
      </div>
      <div class="panel validation"></div>
    `;

    root.addEventListener('click', (event) => {
      unlockAudio();
      const target = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      playSfx('click');
      const { tool, pace, action, player } = target.dataset;
      if (tool) {
        this.editor.setTool(tool as RouteTool);
        root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b === target));
      }
      if (pace) {
        this.editor.setPace(pace as Pace);
        root.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b === target));
      }
      if (player) {
        this.editor.selectPlayer(player);
        this.updatePlayerButtons(root);
      }
      if (action === 'undo') this.editor.removeSelectedWaypoint();
      if (action === 'clear') this.editor.clearSelectedRoute();
      if (action === 'back') useAppStore.getState().setScreen(this.returnScreen);
      if (action === 'save') this.savePlan();
      this.refreshValidation(false);
    });

    const players = root.querySelector('.players')!;
    players.innerHTML = this.homeTeam.players
      .map(
        (p, i) =>
          `<button data-player="${p.id}" class="${i === 0 ? 'active' : ''}"><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${p.name}</button>`
      )
      .join('');
    if (focus?.playerId && this.starterIds.includes(focus.playerId)) {
      this.editor.selectPlayer(focus.playerId);
      this.updatePlayerButtons(root);
    }
    this.validationRoot = root.querySelector('.validation')!;
  }

  private updatePlayerButtons(root: HTMLElement): void {
    root.querySelectorAll('[data-player]').forEach((button) => {
      button.classList.toggle('active', (button as HTMLButtonElement).dataset.player === this.editor.selectedId);
    });
  }

  private refreshValidation(initial: boolean): void {
    this.validation = validatePlan(this.editor.plan, this.field, this.homeTeam.players, this.starterIds);
    if (!this.validationRoot) return;
    const errors = this.validation.errors.map((e) => `<li>${e}</li>`).join('');
    const warnings = this.validation.warnings.map((e) => `<li>${e}</li>`).join('');
    this.validationRoot.innerHTML = `
      <strong>路线检查</strong>
      ${errors ? `<ul class="errors">${errors}</ul>` : '<p class="ok">没有穿障或越界点。</p>'}
      ${warnings ? `<ul class="warnings">${warnings}</ul>` : initial ? '<p class="muted">提示：长冲刺会在比赛中快速消耗体力。</p>' : ''}
    `;
  }

  private savePlan(): void {
    this.refreshValidation(false);
    if (!this.validation.ok) {
      playSfx('error');
      return;
    }
    useAppStore.getState().savePlan(this.field.id, this.editor.plan);
    playSfx('score');
    this.validationRoot.insertAdjacentHTML('beforeend', '<p class="ok">已保存，可以进入比赛。</p>');
  }
}
