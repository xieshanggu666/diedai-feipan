export const GAME_SCENE_SCREENS = new Set(['plan', 'match', 'replay', 'fieldEditor']);

export function shouldRestartScenes(previousScreen: string | undefined, nextScreen: string): boolean {
  return previousScreen !== nextScreen;
}

export function isGameSceneScreen(screen: string): boolean {
  return GAME_SCENE_SCREENS.has(screen);
}
