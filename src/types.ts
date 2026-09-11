export interface Vec2 {
  x: number;
  y: number;
}

export type Pace = 'jog' | 'run' | 'sprint';

export interface Waypoint extends Vec2 {
  pace: Pace;
}

export interface PlayerRoute {
  playerId: string;
  /** Point 0 is the player's set position; later points are drawn by the coach. */
  points: Waypoint[];
}

export interface PassCue {
  id: string;
  fromId: string;
  toId: string;
  /** Throw when the passer reaches this route waypoint. 0 means the initial set spot. */
  atWaypoint: number;
  /** Delay in seconds after reaching the waypoint. */
  delay: number;
  lead: number;
}

export interface TacticsPlan {
  routes: Record<string, PlayerRoute>;
  cues: PassCue[];
}

export type GamePlan = TacticsPlan;

export type ObstacleKind = 'stand' | 'tree' | 'net' | 'crate';

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  kind: ObstacleKind;
  label: string;
}

export interface WindZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  /** Logical units / second^2 at full zone strength. */
  strength: number;
}

export interface WindVector {
  angle: number;
  strength: number;
}

export interface FieldSpec {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  endzoneDepth: number;
  obstacles: Obstacle[];
  windZones: WindZone[];
  globalWind: WindVector;
  unlockPoints: number;
  builtIn: boolean;
}

export type PlayerRole = 'handler' | 'cutter' | 'hybrid';

export interface PlayerAttributes {
  id: string;
  name: string;
  role: PlayerRole;
  speed: number;
  stamina: number;
  catching: number;
  defense: number;
  release: number;
  unlockPoints: number;
  color: number;
  bio: string;
}

export interface Team {
  id: string;
  name: string;
  abbr: string;
  color: number;
  secondary: number;
  rating: number;
  style: string;
  players: PlayerAttributes[];
}

export type MatchPhase = 'preSnap' | 'route' | 'disk' | 'pointOver' | 'matchOver';
export type Side = 'home' | 'away';
export type PointEndReason =
  | 'homeScore'
  | 'awayScore'
  | 'drop'
  | 'interception'
  | 'outOfBounds'
  | 'stall'
  | 'blocked';

export interface MatchPlayerState {
  id: string;
  side: Side;
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  maxEnergy: number;
  speedRating: number;
  catchRating: number;
  defenseRating: number;
  staminaRating: number;
  releaseRating: number;
  assignmentId?: string;
  caught?: boolean;
  sprintDistance: number;
}

export interface DiskState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  holderId?: string;
  lastThrowerId?: string;
  targetId?: string;
}

export type MatchEventType =
  | 'snap'
  | 'throw'
  | 'homeScore'
  | 'awayScore'
  | 'drop'
  | 'interception'
  | 'catch'
  | 'stall'
  | 'outOfBounds'
  | 'blocked'
  | 'wind'
  | 'energy'
  | 'pauseEdit'
  | 'matchEnd'
  | 'info';

export interface MatchEvent {
  id: number;
  time: number;
  type: MatchEventType;
  message: string;
  side?: Side;
  playerId?: string;
  x?: number;
  y?: number;
  critical?: boolean;
}

export interface MatchFrame {
  time: number;
  phase: MatchPhase;
  possession: Side;
  homeScore: number;
  awayScore: number;
  players: Record<string, Omit<MatchPlayerState, 'sprintDistance'>>;
  disk: DiskState;
  eventId?: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  won: boolean;
  draw: boolean;
  opponentId: string;
  fieldId: string;
  events: MatchEvent[];
  pointsFor: number;
  pointsAgainst: number;
}

export interface ReplayData {
  id: string;
  createdAt: string;
  opponentId: string;
  fieldId: string;
  result: MatchResult;
  frames: MatchFrame[];
  homeTeam: Team;
  awayTeam: Team;
  field: FieldSpec;
  seed: number;
  /** The tactics actually used in this match, including mid-match pause edits. */
  plan: GamePlan;
  /** The five starters who played this match. */
  starterIds: string[];
}

/** A failure event picked in the replay, carried into the plan editor. */
export interface ReplayFocus {
  eventId: number;
  time: number;
  type: MatchEventType;
  message: string;
  playerId?: string;
  x?: number;
  y?: number;
}

export interface PersistedSave {
  version: number;
  teamName: string;
  season: SeasonState;
  unlockedPlayerIds: string[];
  unlockedFieldIds: string[];
  customFields: FieldSpec[];
  selectedFieldId: string;
  plans: Record<string, GamePlan>;
  muted: boolean;
}

export interface Fixture {
  matchday: number;
  opponentId: string;
  fieldId: string;
  played: boolean;
  scoreFor?: number;
  scoreAgainst?: number;
  points: number;
}

export interface SeasonState {
  matchday: number;
  totalMatchdays: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  fixtures: Fixture[];
  complete: boolean;
}

export interface RouteValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
