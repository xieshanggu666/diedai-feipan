import { describe, expect, it } from 'vitest';
import { isGameSceneScreen, shouldRestartScenes } from './sceneRouting';

describe('Phaser scene routing', () => {
  it('does not restart a scene when the screen is unchanged', () => {
    expect(shouldRestartScenes('match', 'match')).toBe(false);
    expect(shouldRestartScenes('plan', 'plan')).toBe(false);
  });

  it('restarts scenes only when navigating between screens', () => {
    expect(shouldRestartScenes('season', 'match')).toBe(true);
    expect(shouldRestartScenes('match', 'replay')).toBe(true);
    expect(shouldRestartScenes(undefined, 'match')).toBe(true);
  });

  it('identifies screens backed by Phaser scenes', () => {
    expect(isGameSceneScreen('match')).toBe(true);
    expect(isGameSceneScreen('plan')).toBe(true);
    expect(isGameSceneScreen('replay')).toBe(true);
    expect(isGameSceneScreen('fieldEditor')).toBe(true);
    expect(isGameSceneScreen('season')).toBe(false);
  });
});
