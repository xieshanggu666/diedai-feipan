import Phaser from 'phaser';
import { PlanScene } from '../scenes/PlanScene';
import { MatchScene } from '../scenes/MatchScene';
import { ReplayScene } from '../scenes/ReplayScene';
import { FieldEditorScene } from '../scenes/FieldEditorScene';

class RouterScene extends Phaser.Scene {
  constructor() {
    super('router');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#020617');
  }
}

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#020617',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight
    },
    render: {
      antialias: true,
      pixelArt: false
    },
    scene: [RouterScene, PlanScene, MatchScene, ReplayScene, FieldEditorScene]
  });
}
