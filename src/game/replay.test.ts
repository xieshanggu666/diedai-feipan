import { describe, expect, it } from 'vitest';
import { FAILURE_EVENT_TYPES, isFailureEvent, planContextFromReplay } from './replay';
import type { MatchEvent, ReplayData } from '../types';
import { DEMO_FIELDS, DEMO_TEAMS, HOME_TEAM } from '../data/gameData';

function makeReplay(): ReplayData {
  return {
    id: 'replay-test',
    createdAt: '2026-09-11T00:00:00.000Z',
    opponentId: DEMO_TEAMS[1].id,
    fieldId: DEMO_FIELDS[1].id,
    result: {
      homeScore: 1,
      awayScore: 4,
      won: false,
      draw: false,
      opponentId: DEMO_TEAMS[1].id,
      fieldId: DEMO_FIELDS[1].id,
      events: [],
      pointsFor: 1,
      pointsAgainst: 4
    },
    frames: [],
    homeTeam: { ...HOME_TEAM, players: HOME_TEAM.players.slice(0, 5) },
    awayTeam: DEMO_TEAMS[1],
    field: DEMO_FIELDS[1],
    seed: 42,
    plan: { routes: {}, cues: [] },
    starterIds: HOME_TEAM.players.slice(0, 5).map((p) => p.id)
  };
}

describe('replay failure focus', () => {
  it('flags exactly the turnover event types as failures', () => {
    expect(FAILURE_EVENT_TYPES).toEqual(['drop', 'interception', 'stall', 'blocked', 'outOfBounds']);
    for (const type of FAILURE_EVENT_TYPES) expect(isFailureEvent({ type })).toBe(true);
    expect(isFailureEvent({ type: 'catch' })).toBe(false);
    expect(isFailureEvent({ type: 'throw' })).toBe(false);
    expect(isFailureEvent({ type: 'homeScore' })).toBe(false);
    expect(isFailureEvent({ type: 'matchEnd' })).toBe(false);
  });

  it('carries the match field, lineup, plan and event into a plan context', () => {
    const replay = makeReplay();
    const event: MatchEvent = {
      id: 4,
      time: 8.5,
      type: 'drop',
      message: '接球脱手',
      playerId: replay.starterIds[1],
      x: 210,
      y: 160
    };

    const context = planContextFromReplay(replay, event);

    expect(context.fieldId).toBe(replay.fieldId);
    expect(context.starterIds).toEqual(replay.starterIds);
    expect(context.plan).toBe(replay.plan);
    expect(context.focus).toEqual({
      eventId: 4,
      time: 8.5,
      type: 'drop',
      message: '接球脱手',
      playerId: replay.starterIds[1],
      x: 210,
      y: 160
    });
  });
});
