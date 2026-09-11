import Matter from 'matter-js';
import type {
  DiskState,
  FieldSpec,
  GamePlan,
  MatchEvent,
  MatchFrame,
  MatchPhase,
  MatchPlayerState,
  MatchResult,
  PlayerAttributes,
  PointEndReason,
  RouteValidation,
  Side,
  Team,
  Vec2,
  Waypoint
} from '../types';
import {
  add,
  clamp,
  distance,
  fromAngle,
  length,
  normalize,
  scale,
  sub,
  windAt
} from './geometry';
import { mulberry32, type Rng } from './rng';
import { formationForIndex, validatePlan } from './plans';

const { Engine, Bodies, Body, Composite, Events } = Matter;
const FIXED_DT = 1 / 30;
export const MATCH_TARGET = 4;
export const START_TIMEOUTS = 2;

export interface MatchEngineConfig {
  homeTeam: Team;
  awayTeam: Team;
  field: FieldSpec;
  plan: GamePlan;
  starterIds: string[];
  seed?: number;
  targetScore?: number;
}

type RouteRuntime = {
  points: Waypoint[];
  segment: number;
  accumulated: number;
  done: boolean;
};

type DiskObstacleBody = Matter.Body & { obstacleId?: string };
type PlayerBody = Matter.Body & { playerId?: string };
type DiskBody = Matter.Body & { disk?: true };

export class MatchEngine {
  readonly config: MatchEngineConfig;
  readonly field: FieldSpec;
  readonly rng: Rng;
  readonly frames: MatchFrame[] = [];
  events: MatchEvent[] = [];
  time = 0;
  phase: MatchPhase = 'preSnap';
  possession: Side = 'home';
  homeScore = 0;
  awayScore = 0;
  timeoutsLeft = START_TIMEOUTS;
  paused = false;
  plan: GamePlan;
  result?: MatchResult;

  players: Record<string, MatchPlayerState> = {};
  playerSide: Record<string, Side> = {};
  disk: DiskState;
  awayAssignments: Record<string, string> = {};
  homeAssignments: Record<string, string> = {};
  activeCueAt = 0;
  throwHoldTime = 0;
  preSnapTime = 0;
  pointPauseTime = 0;
  diskLiveTime = 0;
  usedCueIds = new Set<string>();
  initialHolderId?: string;
  routeRuntime: Record<string, RouteRuntime> = {};
  waitingCue?: { cueId: string; fromId: string; toId: string; delay: number; lead: number };
  diskBlockedObstacle?: string;

  private engine: Matter.Engine;
  private diskBody!: DiskBody;
  private obstacleBodies = new Map<string, DiskObstacleBody>();
  private playerBodies = new Map<string, PlayerBody>();
  private nextEventId = 1;

  constructor(config: MatchEngineConfig) {
    this.config = config;
    this.field = config.field;
    this.plan = structuredClone(config.plan);
    this.rng = mulberry32(config.seed ?? 1);
    this.engine = Engine.create();
    this.engine.gravity.y = 0;
    this.engine.gravity.scale = 0;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 8;

    this.createObstacles();
    this.disk = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    this.resetPoint();
    this.createDisk();
    this.registerCollisions();
    this.snapshot();
  }

  get targetScore(): number {
    return this.config.targetScore ?? MATCH_TARGET;
  }

  get holder(): MatchPlayerState | undefined {
    return this.disk.holderId ? this.players[this.disk.holderId] : undefined;
  }

  get sidePlayers(): Record<Side, MatchPlayerState[]> {
    const home = Object.values(this.players).filter((p) => p.side === 'home');
    const away = Object.values(this.players).filter((p) => p.side === 'away');
    return { home, away };
  }

  private emit(type: MatchEvent['type'], message: string, extra: Partial<MatchEvent> = {}): MatchEvent {
    const event: MatchEvent = {
      id: this.nextEventId++,
      time: this.time,
      type,
      message,
      critical: ['homeScore', 'awayScore', 'drop', 'interception', 'stall', 'blocked', 'outOfBounds'].includes(type),
      ...extra
    };
    this.events.push(event);
    return event;
  }

  private createObstacles(): void {
    for (const obstacle of this.field.obstacles) {
      const body = Bodies.rectangle(obstacle.x, obstacle.y, obstacle.w, obstacle.h, {
        isStatic: true,
        isSensor: true,
        angle: obstacle.angle,
        friction: 0,
        frictionStatic: 0
      }) as DiskObstacleBody;
      body.obstacleId = obstacle.id;
      body.label = `obstacle:${obstacle.id}`;
      Composite.add(this.engine.world, body);
      this.obstacleBodies.set(obstacle.id, body);
    }
  }

  private createDisk(): void {
    this.diskBody = Bodies.circle(this.disk.x, this.disk.y, 8, {
      isSensor: true,
      friction: 0,
      frictionAir: 0,
      mass: 0.2
    }) as DiskBody;
    this.diskBody.disk = true;
    this.diskBody.label = 'disk';
    Composite.add(this.engine.world, this.diskBody);
  }

  private createPlayer(p: PlayerAttributes, side: Side, x: number, y: number): MatchPlayerState {
    const maxEnergy = 72 + p.stamina * 3.2;
    const body = Bodies.circle(x, y, 11, {
      isStatic: true,
      isSensor: true,
      friction: 0,
      label: `player:${p.id}`
    }) as PlayerBody;
    body.playerId = p.id;
    Composite.add(this.engine.world, body);
    this.playerBodies.set(p.id, body);
    return {
      id: p.id,
      side,
      x,
      y,
      vx: 0,
      vy: 0,
      energy: maxEnergy,
      maxEnergy,
      speedRating: p.speed,
      catchRating: p.catching,
      defenseRating: p.defense,
      staminaRating: p.stamina,
      releaseRating: p.release,
      caught: false,
      sprintDistance: 0
    };
  }

  private resetAssignments(home: MatchPlayerState[], away: MatchPlayerState[]): void {
    this.awayAssignments = {};
    this.homeAssignments = {};
    away.forEach((defender, i) => {
      const target = home[Math.min(i, home.length - 1)];
      if (target) this.awayAssignments[defender.id] = target.id;
    });
    home.forEach((defender, i) => {
      const target = away[Math.min(i, away.length - 1)];
      if (target) this.homeAssignments[defender.id] = target.id;
    });
  }

  private resetPoint(): void {
    const starterAttrs = this.config.homeTeam.players.filter((p) => this.config.starterIds.includes(p.id));
    const awayAttrs = this.config.awayTeam.players.slice(0, 5);
    const existing = new Set(Object.keys(this.players));

    for (const body of this.playerBodies.values()) Composite.remove(this.engine.world, body);
    this.playerBodies.clear();

    const homeStarters = starterAttrs.slice(0, 5).map((attr, i) => {
      const start = this.plan.routes[attr.id]?.points[0] ?? formationForIndex(i, this.field);
      const state = this.createPlayer(attr, 'home', start.x, start.y);
      const previous = existing.has(attr.id) ? this.players[attr.id] : undefined;
      if (previous) state.energy = clamp(previous.energy + 18, 0, state.maxEnergy);
      return state;
    });
    const awayStarters = awayAttrs.map((attr, i) => {
      const pos = this.awayFormation(i);
      const state = this.createPlayer(attr, 'away', pos.x, pos.y);
      const previous = existing.has(attr.id) ? this.players[attr.id] : undefined;
      if (previous) state.energy = clamp(previous.energy + 22, 0, state.maxEnergy);
      return state;
    });

    this.players = Object.fromEntries([...homeStarters, ...awayStarters].map((p) => [p.id, p]));
    this.playerSide = Object.fromEntries([...homeStarters, ...awayStarters].map((p) => [p.id, p.side]));
    this.resetAssignments(homeStarters, awayStarters);
    this.possession = 'home';

    for (const p of homeStarters) {
      const route = this.plan.routes[p.id];
      this.routeRuntime[p.id] = {
        points: route?.points.length ? route.points.map((point) => ({ ...point })) : [{ x: p.x, y: p.y, pace: 'jog' }],
        segment: 0,
        accumulated: 0,
        done: false
      };
    }
    for (const p of awayStarters) {
      this.routeRuntime[p.id] = { points: [{ x: p.x, y: p.y, pace: 'jog' }], segment: 0, accumulated: 0, done: true };
    }

    // The demo is a half-field offensive tactics game: every point restarts with
    // the player's team on offense. An away takeaway is converted into a point.
    const holder = homeStarters[0];
    this.disk = {
      x: holder.x,
      y: holder.y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      holderId: holder.id,
      lastThrowerId: holder.id,
      targetId: undefined
    };
    this.initialHolderId = holder.id;
    this.phase = 'preSnap';
    this.preSnapTime = 0;
    this.pointPauseTime = 0;
    this.diskLiveTime = 0;
    this.throwHoldTime = 0;
    this.waitingCue = undefined;
    this.activeCueAt = 0;
    this.usedCueIds.clear();
    this.diskBlockedObstacle = undefined;
    for (const p of Object.values(this.players)) {
      p.caught = false;
      p.vx = 0;
      p.vy = 0;
    }
  }

  private awayFormation(i: number): Vec2 {
    const y = this.field.height / 2;
    const positions: Vec2[] = [
      { x: 235, y },
      { x: 285, y: 130 },
      { x: 285, y: 300 },
      { x: 365, y: 175 },
      { x: 380, y: 270 }
    ];
    return positions[i] ?? { x: 260 + i * 25, y: 100 + i * 55 };
  }

  private registerCollisions(): void {
    Events.on(this.engine, 'collisionStart', (event) => {
      if (this.phase !== 'disk') return;
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const diskBody = bodies.find((b) => (b as DiskBody).disk) as DiskBody | undefined;
        if (!diskBody) continue;
        const obstacle = bodies.find((b) => (b as DiskObstacleBody).obstacleId) as DiskObstacleBody | undefined;
        if (obstacle?.obstacleId && this.disk.z < 32) {
          this.diskBlockedObstacle = obstacle.obstacleId;
        }
      }
    });
  }

  snap(): void {
    if (this.phase !== 'preSnap') return;
    this.phase = 'route';
    this.emit('snap', '开球！路线开始执行。', { x: this.disk.x, y: this.disk.y });
  }

  requestPause(): boolean {
    if (this.paused || this.phase === 'pointOver' || this.phase === 'matchOver') return false;
    if (this.timeoutsLeft <= 0) return false;
    this.timeoutsLeft -= 1;
    this.paused = true;
    this.emit('pauseEdit', `暂停！剩余 ${this.timeoutsLeft} 次战术修改。`, { critical: true });
    return true;
  }

  resume(): void {
    this.paused = false;
  }

  editPlan(plan: GamePlan): RouteValidation {
    const normalized = structuredClone(plan);
    for (const p of Object.values(this.players)) {
      if (p.side !== 'home') continue;
      const route = normalized.routes[p.id];
      if (!route) normalized.routes[p.id] = { playerId: p.id, points: [{ x: p.x, y: p.y, pace: 'jog' }] };
      else if (!route.points.length) route.points = [{ x: p.x, y: p.y, pace: 'jog' }];
      else route.points[0] = { ...route.points[0], x: p.x, y: p.y };
    }

    const homeIds = Object.values(this.players).filter((p) => p.side === 'home').map((p) => p.id);
    const roster = this.config.homeTeam.players.filter((p) => homeIds.includes(p.id));
    const validation = validatePlan(normalized, this.field, roster, homeIds);
    if (!validation.ok) return validation;

    this.plan = normalized;
    for (const p of Object.values(this.players)) {
      if (p.side !== 'home') continue;
      this.routeRuntime[p.id] = {
        points: this.plan.routes[p.id].points.map((point) => ({ ...point })),
        segment: 0,
        accumulated: 0,
        done: false
      };
    }
    this.waitingCue = undefined;
    return validation;
  }

  private isHolder(p: MatchPlayerState): boolean {
    return this.disk.holderId === p.id;
  }

  step(): MatchFrame | undefined {
    if (this.paused || this.phase === 'matchOver') return undefined;
    this.time += FIXED_DT;
    if (this.phase === 'preSnap') {
      this.preSnapTime += FIXED_DT;
      if (this.preSnapTime >= 0.9) this.snap();
    } else if (this.phase === 'pointOver') {
      this.pointPauseTime += FIXED_DT;
      if (this.pointPauseTime >= 2.2) {
        if (this.homeScore >= this.targetScore || this.awayScore >= this.targetScore) {
          this.finishMatch();
        } else {
          this.resetPoint();
        }
      }
    } else {
      if (this.phase === 'route') this.updateRoutePhase(FIXED_DT);
      if (this.phase === 'disk') this.updateDiskPhase(FIXED_DT);
    }

    this.updateBodies();
    Engine.update(this.engine, 1000 / 60);
    this.separatePlayers();
    this.snapshot();
    return this.frames[this.frames.length - 1];
  }

  private updateBodies(): void {
    Body.setPosition(this.diskBody, { x: this.disk.x, y: this.disk.y });
    Body.setVelocity(this.diskBody, { x: this.disk.vx, y: this.disk.vy });
    for (const p of Object.values(this.players)) {
      const body = this.playerBodies.get(p.id);
      if (body) {
        Body.setPosition(body, { x: p.x, y: p.y });
        Body.setVelocity(body, { x: p.vx, y: p.vy });
      }
    }
  }

  private separatePlayers(): void {
    const list = Object.values(this.players);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const d = distance(a, b);
        const min = 19;
        if (d > 0.001 && d < min) {
          const n = normalize(sub(a, b));
          const push = (min - d) * 0.32;
          if (this.disk.holderId !== a.id) {
            a.x += n.x * push;
            a.y += n.y * push;
          }
          if (this.disk.holderId !== b.id) {
            b.x -= n.x * push;
            b.y -= n.y * push;
          }
        }
      }
      list[i].x = clamp(list[i].x, 8, this.field.width - 8);
      list[i].y = clamp(list[i].y, 8, this.field.height - 8);
    }
  }

  private paceSpeed(pace: Waypoint['pace'], player: MatchPlayerState): number {
    const ratingSpeed = 34 + player.speedRating * 3.1;
    const multiplier = pace === 'jog' ? 0.52 : pace === 'run' ? 0.78 : 1;
    const fatigueMultiplier = player.energy < 24 ? 0.68 : player.energy < 42 ? 0.86 : 1;
    return ratingSpeed * multiplier * fatigueMultiplier;
  }

  private drain(player: MatchPlayerState, pace: Waypoint['pace'], dt: number, moved: number): void {
    const factor = player.staminaRating / 10;
    const rates: Record<Waypoint['pace'], number> = {
      jog: 1.8 + (1 - factor),
      run: 5.4 + (1 - factor) * 2,
      sprint: 11.5 + (1 - factor) * 4
    };
    player.energy = clamp(player.energy - rates[pace] * dt - moved * (pace === 'sprint' ? 0.025 : 0.006), 0, player.maxEnergy);
    if (pace !== 'sprint') player.energy = clamp(player.energy + 3.5 * dt, 0, player.maxEnergy);
    if (pace === 'sprint') player.sprintDistance += moved;
  }

  private updateRoutePhase(dt: number): void {
    const sides = this.sidePlayers;
    for (const p of sides.home) this.updateHomeRoute(p, dt);
    for (const p of sides.away) this.updateAwayDefense(p, dt);
    this.updatePossessionLogic(dt);
  }

  private updateHomeRoute(player: MatchPlayerState, dt: number): void {
    if (this.isHolder(player)) {
      player.vx = 0;
      player.vy = 0;
      player.energy = clamp(player.energy + 4.5 * dt, 0, player.maxEnergy);
      return;
    }
    const runtime = this.routeRuntime[player.id];
    const target = this.followRuntime(runtime, player, dt);
    if (!target) {
      player.vx = 0;
      player.vy = 0;
      return;
    }
    this.movePlayerTowards(player, target.pos, target.pace, dt);
  }

  private followRuntime(runtime: RouteRuntime, player: MatchPlayerState, dt: number): { pos: Vec2; pace: Waypoint['pace'] } | undefined {
    if (!runtime || runtime.done || runtime.segment >= runtime.points.length - 1) {
      runtime.done = true;
      return undefined;
    }
    const b = runtime.points[runtime.segment + 1];
    const pace = b.pace;
    const speed = this.paceSpeed(pace, player);
    const stepDistance = speed * dt;
    runtime.accumulated += stepDistance;
    let currentLength = distance(runtime.points[runtime.segment], runtime.points[runtime.segment + 1]);
    while (runtime.accumulated >= currentLength && runtime.segment < runtime.points.length - 1) {
      runtime.accumulated -= currentLength;
      runtime.segment += 1;
      if (runtime.segment >= runtime.points.length - 1) {
        runtime.done = true;
        const end = runtime.points[runtime.points.length - 1];
        return { pos: end, pace };
      }
      currentLength = distance(runtime.points[runtime.segment], runtime.points[runtime.segment + 1]);
    }
    if (runtime.done || runtime.segment >= runtime.points.length - 1) return undefined;
    const currentA = runtime.points[runtime.segment];
    const currentB = runtime.points[runtime.segment + 1];
    const t = currentLength < 0.001 ? 1 : clamp(runtime.accumulated / currentLength, 0, 1);
    return {
      pos: { x: currentA.x + (currentB.x - currentA.x) * t, y: currentA.y + (currentB.y - currentA.y) * t },
      pace
    };
  }

  private movePlayerTowards(player: MatchPlayerState, target: Vec2, pace: Waypoint['pace'], dt: number): void {
    const delta = sub(target, player);
    const d = length(delta);
    if (d < 1) {
      player.vx = 0;
      player.vy = 0;
      return;
    }
    const speed = Math.min(this.paceSpeed(pace, player), d / dt);
    const dir = normalize(delta);
    player.vx = dir.x * speed;
    player.vy = dir.y * speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    this.drain(player, pace, dt, speed * dt);
  }

  private updateAwayDefense(player: MatchPlayerState, dt: number): void {
    const targetId = this.awayAssignments[player.id];
    const target = targetId ? this.players[targetId] : undefined;
    if (!target) {
      player.vx = 0;
      player.vy = 0;
      return;
    }
    let aim: Vec2;
    let pace: Waypoint['pace'] = 'run';
    if (this.phase === 'disk' && this.disk.targetId) {
      const receiver = this.players[this.disk.targetId];
      aim = receiver && receiver.side === 'home' ? receiver : target;
      pace = distance(player, this.disk) < 150 ? 'sprint' : 'run';
    } else if (this.holder && this.holder.side === 'home') {
      const markOffset = scale(normalize(sub(target, this.holder)), 15);
      aim = add(target, markOffset);
      if (target.id === this.holder.id) aim = this.keeperSpot(player, this.holder);
      pace = distance(player, aim) > 30 ? 'run' : 'jog';
    } else {
      aim = target;
    }
    const ratingBoost = 1 + (player.defenseRating - 5) * 0.035;
    this.moveAtRating(player, aim, pace, dt, ratingBoost);
  }

  private keeperSpot(_defender: MatchPlayerState, holder: MatchPlayerState): Vec2 {
    // Stay between the initial home side and the holder, rather than body-blocking.
    const dir = normalize(sub(holder, { x: 0, y: holder.y }));
    return add(holder, scale(dir, -20));
  }

  private moveAtRating(player: MatchPlayerState, target: Vec2, pace: Waypoint['pace'], dt: number, boost = 1): void {
    const delta = sub(target, player);
    const d = length(delta);
    if (d < 2) {
      player.vx = 0;
      player.vy = 0;
      player.energy = clamp(player.energy + 3 * dt, 0, player.maxEnergy);
      return;
    }
    const base = this.paceSpeed(pace, player) * boost;
    const speed = Math.min(base, d / dt);
    const dir = normalize(delta);
    player.vx = dir.x * speed;
    player.vy = dir.y * speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    this.drain(player, pace, dt, speed * dt);
  }

  private updatePossessionLogic(dt: number): void {
    const holder = this.holder;
    if (!holder || holder.side !== 'home') return;
    this.throwHoldTime += dt;

    if (this.waitingCue) {
      const cue = this.waitingCue;
      cue.delay -= dt;
      if (cue.delay <= 0) {
        const target = this.players[cue.toId];
        if (target && target.side === 'home' && !this.isHolder(target)) {
          this.throwTo(target, cue.lead, 'planned');
        } else {
          this.waitingCue = undefined;
        }
      }
      return;
    }

    const nodeIndex = this.routeRuntime[holder.id]?.segment ?? 0;
    const isOriginalHolder = holder.id === this.initialHolderId;
    const cue = this.plan.cues.find((c) => {
      if (c.fromId !== holder.id || this.usedCueIds.has(c.id)) return false;
      if (c.atWaypoint === 0) return !isOriginalHolder;
      if (isOriginalHolder) return this.throwHoldTime >= 0.35;
      return nodeIndex >= c.atWaypoint;
    });
    if (cue) {
      this.usedCueIds.add(cue.id);
      this.waitingCue = { cueId: cue.id, fromId: cue.fromId, toId: cue.toId, delay: cue.delay, lead: cue.lead };
      this.emit('info', `${this.nameOf(cue.fromId)} 准备传给 ${this.nameOf(cue.toId)}。`);
      return;
    }

    if (this.throwHoldTime >= 2.6) {
      const target = this.chooseAiTarget(holder);
      if (target && target.x > holder.x - 20) this.throwTo(target, 10, 'auto');
    }
    if (this.throwHoldTime >= 6.5) this.endPoint('stall', '持盘超时，攻防转换。', 'away');
  }

  private chooseAiTarget(holder: MatchPlayerState): MatchPlayerState | undefined {
    const receivers = Object.values(this.players).filter((p) => {
      if (p.side !== 'home' || p.id === holder.id) return false;
      const rt = this.routeRuntime[p.id];
      return rt && rt.points.slice(rt.segment + 1).some((point) => distance(point, p) > 16);
    });
    const pool = receivers.length ? receivers : Object.values(this.players).filter((p) => p.side === 'home' && p.id !== holder.id);
    const candidates = pool
      .map((p) => {
        const nearestDefender = Math.min(
          ...Object.values(this.players).filter((d) => d.side === 'away').map((d) => distance(d, p))
        );
        const route = this.routeRuntime[p.id];
        const forward = clamp((p.x - holder.x) / this.field.width, -0.25, 1);
        const futureRoute = route.points.slice(route.segment + 1);
        const moving = futureRoute.some((point) => distance(point, p) > 16);
        const endzonePush = p.x > this.field.width - this.field.endzoneDepth - 25 ? 75 : 0;
        const score = nearestDefender * 2.2 + forward * 78 + endzonePush + (moving ? 24 : -30) + p.energy * 0.12 + distance(p, holder) * 0.08;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.p;
  }

  private throwTo(target: MatchPlayerState, lead: number, reason: 'planned' | 'auto'): void {
    const thrower = this.holder;
    if (!thrower) return;
    const runtime = this.routeRuntime[target.id];
    const direct = sub({ x: target.x, y: target.y }, thrower);
    const roughLength = length(direct);
    const flightTime = clamp(roughLength / 175, 0.45, 1.75);
    const aim = runtime && !runtime.done
      ? this.predictRoutePosition(runtime, flightTime * (0.78 + lead / 150), target)
      : { x: target.x, y: target.y };
    const passLength = length(sub(aim, thrower));
    const wind = windAt(aim, this.field);
    const aimPoint = add(aim, scale(wind, -0.5 * flightTime * flightTime));
    const inaccuracy = (10 - thrower.releaseRating) * 1.1 + passLength * 0.035;
    const miss = fromAngle(this.rng() * Math.PI * 2, this.rng() * inaccuracy);
    let finalAim = add(aimPoint, miss);
    if (reason === 'planned') {
      const cover = this.nearestDefenderTo(aim);
      if (cover) {
        const awayFromDefender = normalize(sub(aim, cover));
        const sideStep = { x: -awayFromDefender.y, y: awayFromDefender.x };
        const coverDistance = distance(cover, aim);
        const safety = clamp((coverDistance - 8) / 45, 0, 1);
        finalAim.x += (awayFromDefender.x * 10 + sideStep.x * 5) * safety;
        finalAim.y += (awayFromDefender.y * 10 + sideStep.y * 5) * safety;
      }
    }
    const to = sub(finalAim, thrower);
    const horizontalSpeed = length(to) / flightTime;
    const dir = normalize(to);

    this.disk.vx = dir.x * horizontalSpeed;
    this.disk.vy = dir.y * horizontalSpeed;
    this.disk.vz = (34 + passLength * 0.19) / flightTime - 0.5 * 95 * flightTime;
    this.disk.holderId = undefined;
    this.disk.targetId = target.id;
    this.disk.lastThrowerId = thrower.id;
    this.disk.z = 4;
    this.phase = 'disk';
    this.diskLiveTime = 0;
    this.diskBlockedObstacle = undefined;
    this.waitingCue = undefined;
    this.throwHoldTime = 0;
    thrower.caught = false;
    target.caught = true;
    this.emit('throw', reason === 'planned' ? '按计划出盘！' : '读秒后自动选择接应。', {
      side: 'home',
      playerId: thrower.id,
      x: thrower.x,
      y: thrower.y
    });
  }

  private predictRoutePosition(runtime: RouteRuntime, t: number, player: MatchPlayerState): Vec2 {
    const remainingPoints = runtime.points.slice(runtime.segment);
    let remaining = this.paceSpeed(remainingPoints[1]?.pace ?? 'run', player) * t;
    let current = { ...runtime.points[runtime.segment] };
    for (const next of remainingPoints.slice(1)) {
      const d = distance(current, next);
      if (d >= remaining) return add(current, scale(normalize(sub(next, current)), remaining));
      remaining -= d;
      current = { ...next };
    }
    return current;
  }

  private updateDiskPhase(dt: number): void {
    this.diskLiveTime += dt;
    const wind = windAt(this.disk, this.field);
    this.disk.vx += wind.x * dt;
    this.disk.vy += wind.y * dt;
    this.disk.x += this.disk.vx * dt;
    this.disk.y += this.disk.vy * dt;
    this.disk.vz -= 95 * dt;
    this.disk.z = Math.max(0, this.disk.z + this.disk.vz * dt);

    for (const p of this.sidePlayers.home) {
      if (this.disk.targetId === p.id) this.homePlayerDiskBehavior(p, dt);
      else this.updateHomeRoute(p, dt);
    }
    for (const p of this.sidePlayers.away) this.awayPlayerDiskBehavior(p, dt);

    if (this.diskBlockedObstacle) {
      const obstacle = this.field.obstacles.find((o) => o.id === this.diskBlockedObstacle);
      this.endPoint('blocked', `飞盘撞上「${obstacle?.label ?? '障碍'}」，攻防转换。`, 'away');
      return;
    }
    if (this.disk.x < 0 || this.disk.x > this.field.width || this.disk.y < 0 || this.disk.y > this.field.height) {
      this.endPoint('outOfBounds', '飞盘飞出界外，攻防转换。', 'away');
      return;
    }
    this.checkDiskCatch();
  }

  private homePlayerDiskBehavior(player: MatchPlayerState, dt: number): void {
    const isTarget = this.disk.targetId === player.id;
    let aim: Vec2 | undefined;
    let pace: Waypoint['pace'] = 'run';
    if (isTarget) {
      const secondsToLanding = this.disk.vz < 0 ? Math.min(0.8, Math.max(0.08, -this.disk.z / this.disk.vz)) : 0.12;
      aim = {
        x: this.disk.x + this.disk.vx * secondsToLanding * 0.68,
        y: this.disk.y + this.disk.vy * secondsToLanding * 0.68
      };
      pace = distance(player, aim) > 100 ? 'sprint' : 'run';
    } else {
      const assigned = this.homeAssignments[player.id] ? this.players[this.homeAssignments[player.id]] : undefined;
      if (assigned) aim = add(assigned, scale(normalize(sub(assigned, player)), -8));
    }
    if (aim) this.moveAtRating(player, aim, pace, dt, 0.95);
  }

  private awayPlayerDiskBehavior(player: MatchPlayerState, dt: number): void {
    const targetId = this.awayAssignments[player.id];
    const assignedReceiver = targetId ? this.players[targetId] : undefined;
    const target = this.disk.targetId ? this.players[this.disk.targetId] : undefined;
    const chase = assignedReceiver ?? target;
    const diskDistance = distance(player, this.disk);
    const assignedDistance = chase ? distance(player, chase) : 999;
    const canRead = player.defenseRating >= 9 && assignedDistance < 90;
    const aim = canRead && diskDistance < 115 ? this.disk : chase ?? this.disk;
    const pace: Waypoint['pace'] = diskDistance < 130 ? 'sprint' : 'run';
    this.moveAtRating(player, aim, pace, dt, 1.02);
  }

  private nearestDefenderTo(p: Vec2): MatchPlayerState | undefined {
    return this.sidePlayers.away.sort((a, b) => distance(a, p) - distance(b, p))[0];
  }

  private checkDiskCatch(): void {
    const inRange = Object.values(this.players)
      .filter((p) => p.id !== this.disk.lastThrowerId && distance(p, this.disk) <= (this.disk.z < 8 ? 30 : 22) && this.disk.z <= 30)
      .filter((p) => {
        if (p.side === 'away') {
          const targetPlayer = this.disk.targetId ? this.players[this.disk.targetId] : undefined;
          return this.awayAssignments[p.id] === this.disk.targetId && (!targetPlayer || distance(p, targetPlayer) < 38);
        }
        return p.id === this.disk.targetId || this.disk.z < 11;
      })
      .sort((a, b) => this.catchPriority(b) - this.catchPriority(a));
    const catcher = inRange[0];
    if (!catcher) {
      if (this.disk.z <= 0.5 && this.diskLiveTime > 0.45) {
        this.endPoint('drop', '飞盘落地，无人接住。', 'away');
      }
      return;
    }

    if (catcher.side === 'home') {
      const targetBonus = this.disk.targetId === catcher.id ? 0.24 : -0.18;
      const probability = clamp(0.64 + catcher.catchRating * 0.03 + targetBonus - this.pressure(catcher) * 0.014, 0.35, 0.97);
      if (this.rng() < probability) this.completeCatch(catcher);
      else if (this.disk.z < 8 && this.diskLiveTime > 0.55) this.endPoint('drop', `${this.nameOf(catcher.id)} 没能接住飞盘。`, 'away');
      return;
    }

    const probability = clamp(0.08 + catcher.defenseRating * 0.026 + catcher.catchRating * 0.008 - this.pressure(catcher) * 0.01, 0.04, 0.62);
    if (this.rng() < probability) {
      this.endPoint('interception', `${this.nameOf(catcher.id)} 断下飞盘，对手直接得分！`, 'away', catcher.id);
    }
  }

  private catchPriority(p: MatchPlayerState): number {
    return (this.disk.targetId === p.id ? 10 : 0) + p.catchRating + (p.side === 'away' ? p.defenseRating * 0.5 : 0);
  }

  private pressure(player: MatchPlayerState): number {
    const enemies = player.side === 'home' ? this.sidePlayers.away : this.sidePlayers.home;
    return Math.max(0, ...enemies.map((e) => 34 - distance(e, player)));
  }

  private completeCatch(catcher: MatchPlayerState): void {
    this.disk.x = catcher.x;
    this.disk.y = catcher.y;
    this.disk.z = 0;
    this.disk.vx = 0;
    this.disk.vy = 0;
    this.disk.vz = 0;
    this.disk.holderId = catcher.id;
    this.disk.targetId = undefined;
    this.diskBlockedObstacle = undefined;
    Object.values(this.players).forEach((p) => (p.caught = false));
    catcher.caught = true;
    const receiverRoute = this.routeRuntime[catcher.id];
    if (receiverRoute) {
      const futurePoints = receiverRoute.points.slice(receiverRoute.segment + 1).filter((point) => distance(point, catcher) > 6);
      this.routeRuntime[catcher.id] = {
        points: [{ x: catcher.x, y: catcher.y, pace: 'jog' }, ...futurePoints],
        segment: 0,
        accumulated: 0,
        done: futurePoints.length === 0
      };
    }

    if (catcher.x >= this.field.width - this.field.endzoneDepth) {
      this.endPoint('homeScore', `${this.nameOf(catcher.id)} 在得分区接住，破风者得分！`, 'home', catcher.id);
      return;
    }
    this.phase = 'route';
    this.throwHoldTime = 0.05;
    this.waitingCue = undefined;
    this.activeCueAt = 0;
    this.emit('catch', `${this.nameOf(catcher.id)} 完成接应。`, { side: 'home', playerId: catcher.id, x: catcher.x, y: catcher.y });
  }

  private endPoint(reason: PointEndReason, message: string, scoreSide: Side, playerId?: string): void {
    if (this.phase === 'pointOver' || this.phase === 'matchOver') return;
    let type: MatchEvent['type'] = reason;
    if (reason === 'homeScore') {
      this.homeScore += 1;
      type = 'homeScore';
    } else if (reason === 'awayScore' || (scoreSide === 'away' && ['interception', 'drop', 'stall', 'outOfBounds', 'blocked'].includes(reason))) {
      // This short half-field demo treats an away takeaway as a fast break score.
      if (reason !== 'awayScore') this.awayScore += 1;
      scoreSide = 'away';
      type = reason === 'interception' ? 'interception' : reason;
    }
    this.phase = 'pointOver';
    this.pointPauseTime = 0;
    this.disk.vx = 0;
    this.disk.vy = 0;
    this.disk.vz = 0;
    this.possession = scoreSide === 'home' ? 'away' : 'home';
    this.emit(type, message, { side: scoreSide, playerId, x: this.disk.x, y: this.disk.y, critical: true });
  }

  private finishMatch(): void {
    if (this.phase === 'matchOver') return;
    this.phase = 'matchOver';
    const won = this.homeScore > this.awayScore;
    const draw = this.homeScore === this.awayScore;
    const message = won
      ? `比赛结束：破风者 ${this.homeScore}:${this.awayScore} 获胜，进入复盘。`
      : draw
        ? `比赛结束：${this.homeScore}:${this.awayScore} 战平，进入复盘。`
        : `比赛结束：${this.homeScore}:${this.awayScore} 失利，进入复盘。`;
    const matchEndEvent = this.emit('matchEnd', message, {
      side: won ? 'home' : 'away',
      x: this.disk.x,
      y: this.disk.y,
      critical: true
    });
    this.result = {
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      won,
      draw,
      opponentId: this.config.awayTeam.id,
      fieldId: this.field.id,
      events: [...this.events],
      pointsFor: this.homeScore,
      pointsAgainst: this.awayScore
    };
    this.snapshotEvent(matchEndEvent);
  }

  private snapshot(): void {
    const previous = this.frames[this.frames.length - 1];
    const hasNewEvent = this.events.some((event) => !previous || event.time > previous.time);
    if (
      previous &&
      this.time - previous.time < 1 / 12 &&
      this.phase === previous.phase &&
      !hasNewEvent
    ) {
      return;
    }
    this.pushSnapshotFrame();
  }

  private snapshotEvent(event: MatchEvent): void {
    const previous = this.frames[this.frames.length - 1];
    if (previous && previous.eventId === event.id) return;
    this.pushSnapshotFrame(event);
  }

  private pushSnapshotFrame(forcedEvent?: MatchEvent): void {
    const lastEvent = forcedEvent ?? this.events[this.events.length - 1];
    const frame: MatchFrame = {
      time: this.time,
      phase: this.phase,
      possession: this.possession,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      players: Object.fromEntries(
        Object.values(this.players).map((p) => [
          p.id,
          {
            id: p.id,
            side: p.side,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            energy: p.energy,
            maxEnergy: p.maxEnergy,
            speedRating: p.speedRating,
            catchRating: p.catchRating,
            defenseRating: p.defenseRating,
            staminaRating: p.staminaRating,
            releaseRating: p.releaseRating,
            assignmentId: p.assignmentId,
            caught: p.caught
          }
        ])
      ),
      disk: { ...this.disk },
      eventId: lastEvent && lastEvent.time === this.time ? lastEvent.id : undefined
    };
    this.frames.push(frame);
  }

  private nameOf(id: string): string {
    return (
      this.config.homeTeam.players.find((p) => p.id === id)?.name ??
      this.config.awayTeam.players.find((p) => p.id === id)?.name ??
      id
    );
  }

  getResult(): MatchResult | undefined {
    if (!this.result) this.finishMatch();
    return this.result;
  }
}

export function runEngineToEnd(engine: MatchEngine, maxSeconds = 180): MatchResult | undefined {
  let steps = 0;
  while (engine.phase !== 'matchOver' && steps < maxSeconds * 30) {
    engine.step();
    steps += 1;
  }
  return engine.getResult();
}
