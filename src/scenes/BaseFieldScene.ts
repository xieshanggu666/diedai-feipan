import Phaser from 'phaser';
import { fitField, FieldRenderer, drawDisk, drawPlayer } from '../game/FieldRenderer';
import type { FieldSpec, MatchFrame, Team } from '../types';

export class BaseFieldScene extends Phaser.Scene {
  protected fieldView!: FieldRenderer;
  protected graphics!: Phaser.GameObjects.Graphics;
  protected field!: FieldSpec;
  protected uiRoot?: HTMLDivElement;

  constructor(key: string) {
    super(key);
  }

  init(data: { field: FieldSpec }): void {
    this.field = data.field;
  }

  create(): void {
    this.fieldView = fitField(this, this.field, 70);
    this.graphics = this.add.graphics();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyUi, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.handleResize, this));
  }

  protected drawStaticField(): void {
    this.graphics.clear();
    this.fieldView.draw(this.graphics);
  }

  protected drawFrame(frame: MatchFrame, home: Team, away: Team): void {
    this.drawStaticField();
    for (const state of Object.values(frame.players)) {
      const team = state.side === 'home' ? home : away;
      const attr = team.players.find((p) => p.id === state.id);
      drawPlayer(this.graphics, this.fieldView, state, attr?.color ?? 0xffffff, 11);
    }
    drawDisk(this.graphics, this.fieldView, frame.disk);
  }

  protected destroyUi(): void {
    this.uiRoot?.remove();
    this.uiRoot = undefined;
  }

  protected makeUi(className = ''): HTMLDivElement {
    const root = document.createElement('div');
    root.className = `scene-ui ${className}`;
    document.getElementById('game-root')?.appendChild(root);
    this.uiRoot = root;
    return root;
  }

  protected onViewResize(): void {}

  private handleResize(): void {
    this.fieldView.fitTo(this, 70);
    this.onViewResize();
  }
}
