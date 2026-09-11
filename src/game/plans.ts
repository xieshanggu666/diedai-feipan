import type { FieldSpec, GamePlan, Pace, PlayerAttributes, RouteValidation, Vec2, Waypoint } from '../types';
import { distance, routeLength, segmentIntersectsRotatedRect, sprintDistance } from './geometry';

const PACE_SPRINT_COST: Record<Pace, number> = {
  jog: 0.05,
  run: 0.12,
  sprint: 0.32
};

export function waypoint(x: number, y: number, pace: Pace): Waypoint {
  return { x, y, pace };
}

export function validatePlan(
  plan: GamePlan,
  field: FieldSpec,
  roster: PlayerAttributes[],
  starterIds: string[]
): RouteValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const starters = roster.filter((p) => starterIds.includes(p.id));
  const byId = new Map(starters.map((p) => [p.id, p]));

  for (const id of starterIds) {
    const player = byId.get(id);
    const route = plan.routes[id];
    if (!player) {
      errors.push(`找不到上场队员：${id}`);
      continue;
    }
    if (!route || route.points.length < 2) {
      warnings.push(`${player.name} 只有起点，开球后会等待接应。`);
      continue;
    }
    if (route.playerId !== id) errors.push(`${player.name} 的路线 ID 不匹配。`);

    route.points.forEach((p, index) => {
      if (p.x < 0 || p.y < 0 || p.x > field.width || p.y > field.height) {
        errors.push(`${player.name} 的第 ${index + 1} 个点在场外。`);
      }
    });

    for (let i = 1; i < route.points.length; i += 1) {
      const a = route.points[i - 1];
      const b = route.points[i];
      for (const obstacle of field.obstacles) {
        if (segmentIntersectsRotatedRect(a, b, obstacle, 7)) {
          errors.push(`${player.name} 的路线穿过「${obstacle.label}」。`);
        }
      }
      const d = distance(a, b);
      if (d > 250) warnings.push(`${player.name} 有一段 ${Math.round(d)} 单位的长冲刺，容易被风与盯防影响。`);
    }

    const total = routeLength(route.points);
    const sprint = sprintDistance(route.points);
    const cumulative = route.points.reduce((cost, p) => cost + (p.pace ? PACE_SPRINT_COST[p.pace] : 0), 0);
    const staminaBudget = 70 + player.stamina * 3.5;
    if (sprint > 185) warnings.push(`${player.name} 高速段较长（${Math.round(sprint)}），末段会明显降速。`);
    if (cumulative * 100 + sprint * 0.16 > staminaBudget) {
      warnings.push(`${player.name} 可能在本回合后期体力不足。`);
    }
    if (total > 520) warnings.push(`${player.name} 总跑动距离很长，连续回合需要恢复。`);
  }

  const routeIds = new Set(starterIds);
  for (const cue of plan.cues) {
    if (!routeIds.has(cue.fromId) || !routeIds.has(cue.toId)) {
      errors.push('传接计划引用了不在场上的队员。');
      continue;
    }
    if (cue.fromId === cue.toId) errors.push('不能把盘传给自己。');
    const from = byId.get(cue.fromId);
    const to = byId.get(cue.toId);
    const fromRoute = plan.routes[cue.fromId];
    const toRoute = plan.routes[cue.toId];
    if (!from || !to || !fromRoute || !toRoute) continue;
    if (cue.atWaypoint >= fromRoute.points.length) {
      errors.push(`${from.name} 的出盘点不存在。`);
    }
    const fromPoint = fromRoute.points[Math.min(cue.atWaypoint, fromRoute.points.length - 1)];
    const toPoint = toRoute.points[Math.min(toRoute.points.length - 1, cue.atWaypoint + 1)] ?? toRoute.points[0];
    const passLength = distance(fromPoint as Vec2, toPoint as Vec2);
    if (passLength > 360) warnings.push(`${from.name} → ${to.name} 是 ${Math.round(passLength)} 单位长传，拦截风险很高。`);
    if (cue.lead < 0 || cue.lead > 120) errors.push('提前量必须在 0–120 之间。');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function emptyPlan(ids: string[], formations: Record<string, Vec2>): GamePlan {
  const routes: GamePlan['routes'] = {};
  for (const id of ids) {
    const start = formations[id] ?? { x: 120, y: 215 };
    routes[id] = {
      playerId: id,
      points: [waypoint(start.x, start.y, 'jog')]
    };
  }
  return { routes, cues: [] };
}

export function formationForIndex(index: number, field: FieldSpec): Vec2 {
  const y = field.height / 2;
  const positions: Vec2[] = [
    { x: 100, y },
    { x: 135, y: 112 },
    { x: 135, y: 318 },
    { x: 190, y: 165 },
    { x: 190, y: 265 }
  ];
  return positions[index] ?? { x: 120 + index * 12, y: 80 + index * 65 };
}

export function makeDefaultPlan(players: PlayerAttributes[], field: FieldSpec): GamePlan {
  const ids = players.slice(0, 5).map((p) => p.id);
  const formations = Object.fromEntries(ids.map((id, i) => [id, formationForIndex(i, field)]));
  const routes: GamePlan['routes'] = {};
  ids.forEach((id) => {
    const start = formations[id];
    routes[id] = { playerId: id, points: [waypoint(start.x, start.y, 'jog')] };
  });

  const [lin, miao, ahu, qiao, nian] = ids;
  routes[lin].points.push(
    waypoint(formations[lin].x + 35, formations[lin].y - 38, 'jog'),
    waypoint(formations[lin].x + 95, formations[lin].y + 10, 'run')
  );
  routes[miao].points.push(
    waypoint(formations[miao].x + 95, formations[miao].y + 52, 'sprint'),
    waypoint(formations[miao].x + 205, 218, 'run'),
    waypoint(formations[miao].x + 330, 105, 'run'),
    waypoint(620, 92, 'jog')
  );
  routes[ahu].points.push(
    waypoint(formations[ahu].x + 48, formations[ahu].y - 72, 'run'),
    waypoint(formations[ahu].x + 190, 122, 'sprint'),
    waypoint(formations[ahu].x + 325, 226, 'run'),
    waypoint(515, 360, 'run'),
    waypoint(590, 398, 'run'),
    waypoint(620, 398, 'jog')
  );
  routes[qiao].points.push(
    waypoint(formations[qiao].x + 78, formations[qiao].y + 55, 'jog'),
    waypoint(formations[qiao].x + 165, formations[qiao].y + 15, 'run')
  );
  routes[nian].points.push(
    waypoint(formations[nian].x + 28, formations[nian].y - 64, 'jog'),
    waypoint(formations[nian].x + 92, formations[nian].y - 34, 'jog')
  );

  return {
    routes,
    cues: [
      { id: 'cue-1', fromId: lin, toId: miao, atWaypoint: 1, delay: 0.35, lead: 28 },
      { id: 'cue-2', fromId: miao, toId: ahu, atWaypoint: 0, delay: 0.55, lead: 30 },
      { id: 'cue-3', fromId: ahu, toId: miao, atWaypoint: 0, delay: 0.55, lead: 34 }
    ]
  };
}
