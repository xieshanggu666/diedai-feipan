import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_FIELDS, DEMO_TEAMS, HOME_TEAM } from '../data/gameData';
import type { ReplayData } from '../types';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    }
  } as Storage;
}

function makeReplay(homeScore: number, awayScore: number): ReplayData {
  return {
    id: 'replay-test',
    createdAt: '2026-09-11T00:00:00.000Z',
    opponentId: DEMO_TEAMS[0].id,
    fieldId: DEMO_FIELDS[0].id,
    result: {
      homeScore,
      awayScore,
      won: homeScore > awayScore,
      draw: homeScore === awayScore,
      opponentId: DEMO_TEAMS[0].id,
      fieldId: DEMO_FIELDS[0].id,
      events: [],
      pointsFor: homeScore,
      pointsAgainst: awayScore
    },
    frames: [],
    homeTeam: { ...HOME_TEAM, players: HOME_TEAM.players.slice(0, 5) },
    awayTeam: DEMO_TEAMS[0],
    field: DEMO_FIELDS[0],
    seed: 123,
    plan: { routes: {}, cues: [] },
    starterIds: HOME_TEAM.players.slice(0, 5).map((p) => p.id)
  };
}

describe('season save store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('resets currentMatchday, fixtures and replay after clearing a completed matchday', async () => {
    const { useAppStore } = await import('./useAppStore');
    useAppStore.setState({
      currentMatchday: 2,
      lastReplay: makeReplay(4, 2),
      season: {
        ...useAppStore.getState().season,
        matchday: 2,
        points: 3,
        scoreFor: 4,
        scoreAgainst: 2,
        fixtures: useAppStore.getState().season.fixtures.map((fixture, index) =>
          index === 0
            ? { ...fixture, played: true, scoreFor: 4, scoreAgainst: 2, points: 3 }
            : fixture
        )
      }
    });

    useAppStore.getState().resetAll();

    const state = useAppStore.getState();
    expect(state.currentMatchday).toBe(1);
    expect(state.season.matchday).toBe(1);
    expect(state.season.points).toBe(0);
    expect(state.lastReplay).toBeUndefined();
    expect(state.season.fixtures[0]).toMatchObject({ played: false, points: 0 });
  });

  it('does not notify subscribers when saving the identical plan reference', async () => {
    const { useAppStore } = await import('./useAppStore');
    const state = useAppStore.getState();
    const plan = state.plans[DEMO_FIELDS[0].id]!;
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      notifications += 1;
    });

    useAppStore.getState().savePlan(DEMO_FIELDS[0].id, plan);
    unsubscribe();

    expect(notifications).toBe(0);
  });

  it('does not return a playable fixture after all four matches are complete', async () => {
    const { getPlayableFixture, useAppStore } = await import('./useAppStore');
    const fourResults = [
      [4, 1],
      [3, 4],
      [4, 2],
      [4, 3]
    ] as const;
    fourResults.forEach(([home, away]) => useAppStore.getState().recordResult(makeReplay(home, away)));

    const state = useAppStore.getState();
    expect(state.season.complete).toBe(true);
    expect(state.season.fixtures.every((fixture) => fixture.played)).toBe(true);
    expect(getPlayableFixture(state.season)).toBeUndefined();
  });

  it('adapts a saved plan to the current five starters before a match', async () => {
    const { currentPlanFor, useAppStore } = await import('./useAppStore');
    const field = DEMO_FIELDS[0];
    const oldPlan = useAppStore.getState().plans[field.id]!;
    const [lin, miao, ahu, qiao, nian, yu] = HOME_TEAM.players;
    const nextStarters = [miao.id, ahu.id, qiao.id, nian.id, yu.id];

    const adapted = currentPlanFor(field, nextStarters, oldPlan);

    expect(Object.keys(adapted.routes).sort()).toEqual(nextStarters.slice().sort());
    expect(adapted.routes[lin.id]).toBeUndefined();
    expect(adapted.routes[yu.id]?.points[0]).toMatchObject({ pace: 'jog' });
    expect(adapted.routes[miao.id]?.points).toHaveLength(oldPlan.routes[miao.id].points.length);
    expect(adapted.cues.some((cue) => cue.fromId === lin.id || cue.toId === lin.id)).toBe(false);
    expect(adapted.cues.some((cue) => cue.fromId === ahu.id && cue.toId === miao.id)).toBe(true);
  });

  it('advances currentMatchday together with season matchday after recording a result', async () => {
    const { useAppStore } = await import('./useAppStore');
    expect(useAppStore.getState().currentMatchday).toBe(1);

    useAppStore.getState().recordResult(makeReplay(4, 1));

    const state = useAppStore.getState();
    expect(state.currentMatchday).toBe(2);
    expect(state.season.matchday).toBe(2);
    expect(state.season.points).toBe(3);
    expect(state.season.fixtures[0]).toMatchObject({ played: true, scoreFor: 4, scoreAgainst: 1 });
  });

  it('opens a plan session from a replay failure and clears it after leaving the plan screen', async () => {
    const { useAppStore } = await import('./useAppStore');
    const { planContextFromReplay } = await import('../game/replay');
    const replay = makeReplay(1, 4);
    useAppStore.getState().recordResult(replay);
    expect(useAppStore.getState().screen).toBe('replay');

    const failure = {
      id: 9,
      time: 12.3,
      type: 'interception' as const,
      message: '被防守断盘',
      playerId: replay.starterIds[0],
      x: 320,
      y: 200
    };
    useAppStore.getState().openPlanSession({ ...planContextFromReplay(replay, failure), returnScreen: 'replay' });

    let state = useAppStore.getState();
    expect(state.screen).toBe('plan');
    expect(state.planSession?.fieldId).toBe(replay.fieldId);
    expect(state.planSession?.starterIds).toEqual(replay.starterIds);
    expect(state.planSession?.plan).toEqual(replay.plan);
    expect(state.planSession?.focus).toMatchObject({ eventId: 9, time: 12.3, type: 'interception' });
    expect(state.planSession?.returnScreen).toBe('replay');

    useAppStore.getState().setScreen('replay');
    state = useAppStore.getState();
    expect(state.planSession).toBeUndefined();
  });

  it('keeps the plan session when navigating to the plan screen directly', async () => {
    const { useAppStore } = await import('./useAppStore');
    const { planContextFromReplay } = await import('../game/replay');
    const replay = makeReplay(0, 4);
    const failure = { id: 3, time: 4.2, type: 'stall' as const, message: '读秒未出盘' };
    useAppStore.getState().openPlanSession({ ...planContextFromReplay(replay, failure), returnScreen: 'replay' });

    useAppStore.getState().setScreen('plan');

    expect(useAppStore.getState().planSession).toBeDefined();
  });
});
