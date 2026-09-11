import { describe, expect, it } from 'vitest';
import { DEMO_FIELDS, HOME_TEAM } from '../data/gameData';
import { makeDefaultPlan, validatePlan } from './plans';
import { distance, windAt } from './geometry';

describe('route validation', () => {
  const field = DEMO_FIELDS[0];
  const starters = HOME_TEAM.players.slice(0, 5);
  const ids = starters.map((p) => p.id);

  it('accepts the starter plan inside the field', () => {
    const plan = makeDefaultPlan(starters, field);
    const result = validatePlan(plan, field, starters, ids);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a route crossing a crate obstacle', () => {
    const plan = makeDefaultPlan(starters, field);
    const id = ids[1];
    plan.routes[id].points = [
      { ...plan.routes[id].points[0] },
      { x: 72, y: 112, pace: 'sprint' }
    ];
    const result = validatePlan(plan, field, starters, ids);
    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('广告牌'))).toBe(true);
  });

  it('warns about a long sprint without blocking it', () => {
    const plan = makeDefaultPlan(starters, field);
    const route = plan.routes[ids[0]];
    route.points = [route.points[0], { x: 620, y: 40, pace: 'sprint' }];
    plan.cues = [];
    const result = validatePlan(plan, field, starters, ids);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((message) => message.includes('长冲刺'))).toBe(true);
  });
});

describe('field wind sampling', () => {
  it('adds a local wind zone to the global wind', () => {
    const field = DEMO_FIELDS[1];
    const outside = windAt({ x: 20, y: 400 }, field);
    const inside = windAt({ x: 330, y: 160 }, field);
    expect(distance(outside, { x: 12, y: 0 })).toBeLessThan(0.001);
    expect(Math.hypot(inside.x, inside.y)).toBeGreaterThan(Math.hypot(outside.x, outside.y));
  });
});
