import { describe, expect, it } from 'vitest';
import { DEMO_FIELDS, DEMO_TEAMS, HOME_TEAM } from '../data/gameData';
import { MatchEngine, runEngineToEnd } from './MatchEngine';
import { makeDefaultPlan } from './plans';

function makeEngine(seed = 42, planOverrides?: { x: number; y: number; pace: 'jog' | 'run' | 'sprint' }[][]) {
  const field = DEMO_FIELDS[0];
  const starters = HOME_TEAM.players.slice(0, 5);
  const plan = makeDefaultPlan(starters, field);
  if (planOverrides) {
    starters.forEach((player, index) => {
      const points = planOverrides[index];
      if (points) plan.routes[player.id].points = [{ ...plan.routes[player.id].points[0] }, ...points];
    });
  }
  return new MatchEngine({
    homeTeam: { ...HOME_TEAM, players: starters },
    awayTeam: DEMO_TEAMS[0],
    field,
    plan,
    starterIds: starters.map((p) => p.id),
    seed,
    targetScore: 2
  });
}

describe('match simulation', () => {
  it('runs to a result and records every frame for replay', () => {
    const engine = makeEngine(7);
    const result = runEngineToEnd(engine, 120);
    expect(result).toBeDefined();
    expect(result!.events.at(-1)?.type).toBe('matchEnd');
    expect(engine.frames.at(-1)?.eventId).toBe(result!.events.at(-1)?.id);
    expect(result!.homeScore + result!.awayScore).toBeGreaterThanOrEqual(2);
    expect(engine.frames.length).toBeGreaterThan(100);
    expect(engine.frames[0].players[HOME_TEAM.players[0].id]).toBeDefined();
  });

  it('starts every point with the home team on offense', () => {
    const engine = makeEngine(9);
    runEngineToEnd(engine, 120);
    expect(engine.frames[0].possession).toBe('home');
    expect(engine.frames.at(-1)!.phase).toBe('matchOver');
  });

  it('allows a tactical pause and route edit', () => {
    const engine = makeEngine(11);
    for (let i = 0; i < 45; i += 1) engine.step();
    expect(engine.requestPause()).toBe(true);
    expect(engine.paused).toBe(true);
    expect(engine.timeoutsLeft).toBe(1);
    const plan = structuredClone(engine.plan);
    const moving = HOME_TEAM.players[1].id;
    plan.routes[moving].points = [
      { ...plan.routes[moving].points[0] },
      { x: 420, y: 80, pace: 'run' }
    ];
    expect(engine.editPlan(plan).ok).toBe(true);
    engine.resume();
    for (let i = 0; i < 90 && engine.phase !== 'matchOver'; i += 1) engine.step();
    expect(engine.phase === 'pointOver' || engine.phase === 'route' || engine.phase === 'disk' || engine.phase === 'matchOver').toBe(true);
  });

  it('rejects a paused route that crosses an obstacle and keeps the old plan', () => {
    const engine = makeEngine(13);
    for (let i = 0; i < 45; i += 1) engine.step();
    expect(engine.requestPause()).toBe(true);
    const plan = structuredClone(engine.plan);
    const moving = HOME_TEAM.players[1].id;
    const player = engine.players[moving];
    const obstacle = DEMO_FIELDS[0].obstacles[1];
    plan.routes[moving].points = [
      { x: player.x, y: player.y, pace: 'jog' },
      { x: obstacle.x, y: obstacle.y, pace: 'sprint' }
    ];

    const validation = engine.editPlan(plan);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('设备箱');
    expect(engine.plan).not.toBe(plan);
    expect(engine.paused).toBe(true);
  });

  it('produces different outcomes with different seeds because wind and catches vary', () => {
    const first = runEngineToEnd(makeEngine(101), 120);
    const second = runEngineToEnd(makeEngine(909), 120);
    expect(first && second).toBeDefined();
    const sameScore = first!.homeScore === second!.homeScore && first!.awayScore === second!.awayScore;
    const sameEvents = first!.events.map((e) => e.message).join('|') === second!.events.map((e) => e.message).join('|');
    expect(sameScore && sameEvents).toBe(false);
  });
});
