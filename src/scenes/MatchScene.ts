import Phaser from 'phaser';
import type { FieldSpec, GamePlan, MatchEvent, ReplayData, RouteValidation, Team } from '../types';
import { BaseFieldScene } from './BaseFieldScene';
import { MatchEngine, START_TIMEOUTS } from '../game/MatchEngine';
import { RouteEditor } from '../game/RouteEditor';
import { HOME_TEAM } from '../data/gameData';
import { useAppStore } from '../store/useAppStore';
import { playSfx, unlockAudio } from '../audio';
import { drawPlan } from '../game/FieldRenderer';

interface MatchSceneData {
  field: FieldSpec;
  awayTeam: Team;
  seed: number;
  plan: GamePlan;
}

export class MatchScene extends BaseFieldScene {
  private engine!: MatchEngine;
  private awayTeam!: Team;
  private homeTeam!: Team;
  private accumulator = 0;
  private speed = 1;
  private eventList!: HTMLDivElement;
  private statusBar!: HTMLDivElement;
  private pausePanel!: HTMLDivElement;
  private pauseEditor?: RouteEditor;
  private finished = false;
  private seed = 1;
  private initialPlan!: GamePlan;

  constructor() {
    super('match');
  }

  init(data: MatchSceneData): void {
    super.init(data);
    this.awayTeam = data.awayTeam;
    this.seed = data.seed;
    this.initialPlan = data.plan;
  }

  create(): void {
    super.create();
    const store = useAppStore.getState();
    const starters = HOME_TEAM.players.filter((p) => store.starterIds.includes(p.id));
    this.homeTeam = { ...HOME_TEAM, players: starters };
    const plan = this.initialPlan;
    this.engine = new MatchEngine({
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      field: this.field,
      plan,
      starterIds: store.starterIds,
      seed: this.seed,
      targetScore: 4
    });

    this.makeControls();
    this.updateHud();
    this.input.keyboard?.on('keydown-SPACE', () => this.togglePause());
    this.events.on(Phaser.Scenes.Events.UPDATE, this.renderFrame, this);
  }

  private makeControls(): void {
    const root = this.makeUi('match-ui');
    root.innerHTML = `
      <div class="panel match-top">
        <div class="score"><b>破风者</b><strong data-hud="home">0</strong>:<strong data-hud="away">0</strong><b id="away-name"></b></div>
        <div data-hud="phase" class="phase">准备</div>
        <div class="row gap">
          <button data-action="pause">暂停 (<span data-hud="timeouts">${START_TIMEOUTS}</span>)</button>
          <button data-action="speed">速度 1×</button>
          <button data-action="quit">放弃复盘</button>
        </div>
      </div>
      <div class="panel event-log"></div>
      <div class="panel pause-panel hidden"></div>
    `;
    root.querySelector('#away-name')!.textContent = this.awayTeam.name;
    root.addEventListener('click', (event) => {
      unlockAudio();
      const button = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!button) return;
      playSfx('click');
      const action = button.dataset.action;
      if (action === 'pause') this.togglePause();
      if (action === 'resume') this.resumeMatch();
      if (action === 'speed') {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1;
        button.textContent = `速度 ${this.speed}×`;
      }
      if (action === 'quit') useAppStore.getState().setScreen('season');
    });
    this.statusBar = root.querySelector('.match-top')!;
    this.eventList = root.querySelector('.event-log')!;
    this.pausePanel = root.querySelector('.pause-panel')!;
  }

  private togglePause(): void {
    if (this.engine.paused) this.resumeMatch();
    else {
      if (this.engine.requestPause()) {
        playSfx('click');
        this.openPauseEditor();
      } else {
        playSfx('error');
      }
    }
  }

  private openPauseEditor(): void {
    if (!this.pausePanel) return;
    this.pausePanel.classList.remove('hidden');
    this.pausePanel.innerHTML = `
      <strong>暂停改战术</strong>
      <p class="muted">持球人会停在当前位置；你可以修改其他四条跑位路线，或重画后续接应。</p>
      <div class="tool-grid">
        <button data-tool="route" class="active">路线</button>
        <button data-tool="pass">传接</button>
        <button data-tool="eraser">删除</button>
      </div>
      <div class="pace-box">
        <button data-pace="jog">慢跑</button><button data-pace="run" class="active">正常</button><button data-pace="sprint">冲刺</button>
      </div>
      <div class="pause-actions"><button class="primary" data-action="resume">应用并继续</button></div>
      <div class="pause-validation muted"></div>
    `;
    const livePlan = structuredClone(this.engine.plan);
    for (const player of Object.values(this.engine.players)) {
      if (player.side === 'home' && livePlan.routes[player.id]) {
        livePlan.routes[player.id].points[0] = { x: player.x, y: player.y, pace: 'jog' };
      }
    }
    this.pauseEditor = new RouteEditor(this, this.fieldView, livePlan, this.homeTeam, this.field, {
      lockedStarts: true,
      onChange: () => undefined
    });
    this.pausePanel.addEventListener('click', this.onPausePanelClick);
  }

  private onPausePanelClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!button || !this.pauseEditor) return;
    if (button.dataset.tool) {
      this.pauseEditor.setTool(button.dataset.tool as 'route' | 'pass' | 'eraser');
      this.pausePanel.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b === button));
    }
    if (button.dataset.pace) {
      this.pauseEditor.setPace(button.dataset.pace as 'jog' | 'run' | 'sprint');
      this.pausePanel.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b === button));
    }
  };

  private resumeMatch(): void {
    if (this.pauseEditor) {
      const validation = this.engine.editPlan(this.pauseEditor.plan);
      if (!validation.ok) {
        this.showPauseValidation(validation);
        playSfx('error');
        return;
      }
      this.pauseEditor.destroy();
      this.pauseEditor = undefined;
    }
    this.pausePanel.classList.add('hidden');
    this.pausePanel.removeEventListener('click', this.onPausePanelClick);
    this.engine.resume();
    playSfx('snap');
  }

  private showPauseValidation(validation: RouteValidation): void {
    const target = this.pausePanel.querySelector('.pause-validation');
    if (target) target.innerHTML = validation.errors.map((message) => `<div class="error-line">${message}</div>`).join('');
  }

  update(_time: number, deltaMs: number): void {
    if (!this.engine || this.engine.paused || this.finished) return;
    this.accumulator += (deltaMs / 1000) * this.speed;
    const fixed = 1 / 30;
    let loops = 0;
    while (this.accumulator >= fixed && loops < 4) {
      const before = this.engine.events.length;
      this.engine.step();
      this.handleNewEvents(before);
      this.accumulator -= fixed;
      loops += 1;
      if (this.engine.phase === 'matchOver') {
        this.finishAfterDelay();
        break;
      }
    }
  }

  private handleNewEvents(before: number): void {
    const fresh = this.engine.events.slice(before);
    for (const event of fresh) {
      this.playEventSound(event);
    }
    if (fresh.length) this.updateHud();
  }

  private playEventSound(event: MatchEvent): void {
    if (event.type === 'snap') playSfx('snap');
    if (event.type === 'throw') playSfx('throw');
    if (event.type === 'catch') playSfx('catch');
    if (event.type.includes('Score') || event.type === 'matchEnd') playSfx('score');
    if (['drop', 'interception', 'stall', 'blocked', 'outOfBounds'].includes(event.type)) {
      playSfx('error');
    }
  }

  private renderFrame(): void {
    if (!this.engine) return;
    const frame = this.engine.frames[this.engine.frames.length - 1];
    if (frame) this.drawFrame(frame, this.homeTeam, this.awayTeam);
    if (this.engine.paused && this.pauseEditor) {
      drawPlan(this.graphics, this.fieldView, this.pauseEditor.plan, this.homeTeam);
      this.pauseEditor.redraw();
    }
  }

  private updateHud(): void {
    if (!this.statusBar) return;
    this.statusBar.querySelector('[data-hud="home"]')!.textContent = String(this.engine.homeScore);
    this.statusBar.querySelector('[data-hud="away"]')!.textContent = String(this.engine.awayScore);
    this.statusBar.querySelector('[data-hud="phase"]')!.textContent = this.phaseText();
    this.statusBar.querySelector('[data-hud="timeouts"]')!.textContent = String(this.engine.timeoutsLeft);
    const events = this.engine.events.slice(-6).reverse();
    this.eventList.innerHTML = events
      .map((event) => `<div class="event ${event.critical ? 'critical' : ''}"><span>${event.time.toFixed(1)}s</span>${event.message}</div>`)
      .join('');
  }

  private phaseText(): string {
    switch (this.engine.phase) {
      case 'preSnap': return '开球前';
      case 'route': return this.engine.paused ? '暂停改战术' : '跑位 / 传接';
      case 'disk': return '飞盘在空中';
      case 'pointOver': return '回合结束';
      case 'matchOver': return '比赛结束';
    }
  }

  private finishAfterDelay(): void {
    if (this.finished) return;
    this.finished = true;
    this.time.delayedCall(650, () => {
      const result = this.engine.getResult();
      if (!result) return;
      const replay: ReplayData = {
        id: `replay-${this.seed}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        opponentId: this.awayTeam.id,
        fieldId: this.field.id,
        result,
        frames: this.engine.frames,
        homeTeam: this.homeTeam,
        awayTeam: this.awayTeam,
        field: this.field,
        seed: this.seed,
        plan: structuredClone(this.engine.plan),
        starterIds: this.homeTeam.players.map((p) => p.id)
      };
      useAppStore.getState().recordResult(replay);
    });
  }
}
