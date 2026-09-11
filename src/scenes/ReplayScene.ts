import Phaser from 'phaser';
import type { FieldSpec, ReplayData } from '../types';
import { BaseFieldScene } from './BaseFieldScene';
import { useAppStore } from '../store/useAppStore';
import { playSfx, unlockAudio } from '../audio';

export class ReplayScene extends BaseFieldScene {
  private replay!: ReplayData;
  private index = 0;
  private playing = false;
  private accumulator = 0;
  private speed = 1;
  private timeline!: HTMLInputElement;
  private eventList!: HTMLDivElement;
  private analysis!: HTMLDivElement;
  private timeText!: HTMLSpanElement;
  private markerBar!: HTMLDivElement;

  constructor() {
    super('replay');
  }

  init(data: { field: FieldSpec; replay: ReplayData }): void {
    super.init(data);
    this.replay = data.replay;
    this.index = 0;
  }

  create(): void {
    super.create();
    this.makeControls();
    this.showFrame(0);
    this.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  private makeControls(): void {
    const root = this.makeUi('replay-ui');
    root.innerHTML = `
      <div class="panel topbar">
        <div><strong>比赛回放</strong><span class="muted">拖动时间轴，点击关键节点回到失误前后。</span></div>
        <div class="row gap">
          <button data-action="restart-season">返回赛季</button>
          ${this.storeAllowsContinue() ? '<button class="primary" data-action="continue">继续赛季</button>' : '<button class="primary" data-action="complete">查看总结</button>'}
        </div>
      </div>
      <div class="panel replay-analysis"></div>
      <div class="panel replay-events"></div>
      <div class="panel timeline-panel">
        <div class="timeline-marks"></div>
        <input class="timeline" type="range" min="0" max="${this.replay.frames.length - 1}" value="0" />
        <div class="row gap between">
          <span>时间 <b data-time>0.0s</b></span>
          <span class="muted">绿=接球 红=失误 金=得分 青=比赛结束</span>
          <div class="row gap">
            <button data-action="prev">上一节点</button>
            <button data-action="play">播放</button>
            <button data-action="next">下一节点</button>
            <button data-action="speed">1×</button>
          </div>
        </div>
      </div>
    `;
    root.addEventListener('click', (event) => {
      unlockAudio();
      const button = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!button) return;
      playSfx('click');
      const action = button.dataset.action;
      if (action === 'play') this.togglePlay(button);
      if (action === 'next') this.jumpMarker(1);
      if (action === 'prev') this.jumpMarker(-1);
      if (action === 'speed') {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.25 : 1;
        button.textContent = `${this.speed}×`;
      }
      if (action === 'restart-season') useAppStore.getState().setScreen('season');
      if (action === 'continue') useAppStore.getState().setScreen('season');
      if (action === 'complete') useAppStore.getState().setScreen('seasonComplete');
    });
    this.timeline = root.querySelector('.timeline')!;
    this.timeline.addEventListener('input', () => {
      this.playing = false;
      this.showFrame(Number(this.timeline.value));
    });
    this.markerBar = root.querySelector('.timeline-marks')!;
    this.eventList = root.querySelector('.replay-events')!;
    this.analysis = root.querySelector('.replay-analysis')!;
    this.timeText = root.querySelector('[data-time]')!;
    this.renderMarkers();
    this.renderEvents();
    this.renderAnalysis();
  }

  private storeAllowsContinue(): boolean {
    return !useAppStore.getState().season.complete;
  }

  private frameForEvent(eventId: number): number {
    const direct = this.replay.frames.findIndex((f) => f.eventId === eventId);
    if (direct >= 0) return direct;
    const event = this.replay.result.events.find((e) => e.id === eventId);
    if (!event) return 0;
    const after = this.replay.frames.findIndex((f) => f.time >= event.time);
    return after >= 0 ? after : this.replay.frames.length - 1;
  }

  private criticalEvents() {
    return this.replay.result.events.filter((e) => e.critical || ['throw', 'catch'].includes(e.type));
  }

  private renderMarkers(): void {
    const total = this.replay.frames.length - 1;
    this.markerBar.innerHTML = this.criticalEvents()
      .map((event) => {
        const frameIndex = this.frameForEvent(event.id);
        const percent = Math.max(0, Math.min(100, (frameIndex / total) * 100));
        const cls = event.type === 'matchEnd'
          ? 'finish'
          : event.type.includes('Score')
            ? 'score'
            : ['catch', 'throw'].includes(event.type)
              ? 'catch'
              : 'error';
        return `<button class="mark ${cls}" title="${event.message}" data-frame="${frameIndex}" style="left:${percent}%"></button>`;
      })
      .join('');
    this.markerBar.querySelectorAll('.mark').forEach((button) => {
      button.addEventListener('click', () => {
        this.playing = false;
        this.showFrame(Number((button as HTMLButtonElement).dataset.frame));
      });
    });
  }

  private renderEvents(): void {
    this.eventList.innerHTML =
      '<strong>关键节点</strong>' +
      this.criticalEvents()
        .reverse()
        .map((event) => {
          const cls = event.critical ? 'critical' : '';
          return `<div class="event ${cls}"><span>${event.time.toFixed(1)}s</span>${event.message}</div>`;
        })
        .join('');
  }

  private renderAnalysis(): void {
    const result = this.replay.result;
    const failures = result.events.filter((e) => ['drop', 'interception', 'stall', 'blocked', 'outOfBounds'].includes(e.type));
    const counts: Record<string, number> = {};
    for (const failure of failures) counts[failure.type] = (counts[failure.type] ?? 0) + 1;
    const labels: Record<string, string> = {
      drop: '接球脱手',
      interception: '被防守断盘',
      stall: '读秒未出盘',
      blocked: '撞障',
      outOfBounds: '出界'
    };
    const verdict = result.won
      ? '胜利：路线总体能制造空位，注意节省末段体力。'
      : failures.some((f) => f.type === 'interception')
        ? '主要问题是长传或拥挤区域被读盘：缩短第一传、增加折返接应。'
        : failures.some((f) => f.type === 'blocked' || f.type === 'outOfBounds')
          ? '主要问题是飞盘受风或障碍影响：绕开不可达区域，降低提前量。'
          : '接应不足导致停滞：增加一名短传复位点，减少单点冲刺。';
    this.analysis.innerHTML = `
      <strong>复盘结论</strong>
      <p>${verdict}</p>
      <div class="analysis-grid">
        <div><b>${result.homeScore}:${result.awayScore}</b><span>比分</span></div>
        <div><b>${failures.length}</b><span>失误回合</span></div>
        <div><b>${Object.entries(counts).map(([k, v]) => `${labels[k] ?? k}×${v}`).join(' / ') || '无'}</b><span>失误类型</span></div>
      </div>
      <p class="muted">建议：先修改失败节点前 2–4 秒的路线，再开始下一场。</p>
    `;
  }

  private togglePlay(button: HTMLButtonElement): void {
    this.playing = !this.playing;
    if (this.index >= this.replay.frames.length - 1) this.showFrame(0);
    button.textContent = this.playing ? '暂停' : '播放';
  }

  private jumpMarker(direction: 1 | -1): void {
    const markers = this.criticalEvents()
      .map((event) => this.frameForEvent(event.id))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    const target = direction > 0 ? markers.find((i) => i > this.index + 2) : [...markers].reverse().find((i) => i < this.index - 2);
    if (target !== undefined) this.showFrame(target);
  }

  private tick(_time: number, deltaMs: number): void {
    if (!this.playing) return;
    this.accumulator += (deltaMs / 1000) * this.speed;
    const frameTime = 1 / 12;
    while (this.accumulator >= frameTime) {
      this.accumulator -= frameTime;
      if (this.index >= this.replay.frames.length - 1) {
        this.playing = false;
        break;
      }
      this.showFrame(this.index + 1, false);
    }
  }

  private showFrame(index: number, updateRange = true): void {
    this.index = Phaser.Math.Clamp(index, 0, this.replay.frames.length - 1);
    const frame = this.replay.frames[this.index];
    this.drawFrame(frame, this.replay.homeTeam, this.replay.awayTeam);
    this.timeText.textContent = `${frame.time.toFixed(1)}s`;
    if (updateRange) this.timeline.value = String(this.index);
  }
}
