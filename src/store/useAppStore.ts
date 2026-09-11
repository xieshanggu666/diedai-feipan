import { create } from 'zustand';
import {
  DEMO_FIELDS,
  DEMO_TEAMS,
  FIELD_HOME_ID,
  HOME_TEAM
} from '../data/gameData';
import type { FieldSpec, GamePlan, ReplayData, SeasonState } from '../types';
import { formationForIndex, makeDefaultPlan } from '../game/plans';

const SAVE_KEY = 'aerial-timeout-save-v1';

export type Screen =
  | 'menu'
  | 'season'
  | 'roster'
  | 'fields'
  | 'plan'
  | 'match'
  | 'replay'
  | 'fieldEditor'
  | 'seasonComplete';

interface SaveShape {
  version: number;
  teamName: string;
  season: SeasonState;
  unlockedPlayerIds: string[];
  unlockedFieldIds: string[];
  customFields: FieldSpec[];
  selectedFieldId: string;
  starterIds: string[];
  plans: Record<string, GamePlan>;
  muted: boolean;
}

export interface AppState extends SaveShape {
  screen: Screen;
  currentMatchday: number;
  lastReplay?: ReplayData;
  setScreen: (screen: Screen) => void;
  startNewSeason: () => void;
  recordResult: (replay: ReplayData) => void;
  togglePlayerUnlock: (id: string) => void;
  toggleFieldUnlock: (id: string) => void;
  selectField: (id: string) => void;
  setStarters: (ids: string[]) => void;
  savePlan: (fieldId: string, plan: GamePlan) => void;
  saveCustomField: (field: FieldSpec) => void;
  deleteCustomField: (id: string) => void;
  setMuted: (muted: boolean) => void;
  setReplay: (replay?: ReplayData) => void;
  resetAll: () => void;
}

function createSeason(): SeasonState {
  return {
    matchday: 1,
    totalMatchdays: DEMO_TEAMS.length,
    points: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    complete: false,
    fixtures: DEMO_TEAMS.map((opponent, index) => ({
      matchday: index + 1,
      opponentId: opponent.id,
      fieldId: DEMO_FIELDS[Math.min(index, DEMO_FIELDS.length - 1)].id,
      played: false,
      points: 0
    }))
  };
}

const defaultStarters = HOME_TEAM.players.slice(0, 5).map((p) => p.id);

function defaultSave(): SaveShape {
  return {
    version: 1,
    teamName: HOME_TEAM.name,
    season: createSeason(),
    unlockedPlayerIds: defaultStarters,
    unlockedFieldIds: [FIELD_HOME_ID],
    customFields: [],
    selectedFieldId: FIELD_HOME_ID,
    starterIds: defaultStarters,
    plans: { [FIELD_HOME_ID]: makeDefaultPlan(HOME_TEAM.players, DEMO_FIELDS[0]) },
    muted: false
  };
}

function loadSave(): SaveShape {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveShape>;
    const base = defaultSave();
    return {
      ...base,
      ...parsed,
      season: parsed.season ?? base.season,
      unlockedPlayerIds: parsed.unlockedPlayerIds ?? base.unlockedPlayerIds,
      unlockedFieldIds: parsed.unlockedFieldIds ?? base.unlockedFieldIds,
      customFields: parsed.customFields ?? [],
      starterIds: parsed.starterIds?.length === 5 ? parsed.starterIds : base.starterIds,
      plans: { ...base.plans, ...(parsed.plans ?? {}) }
    };
  } catch {
    return defaultSave();
  }
}

function persist(state: AppState): void {
  const save: SaveShape = {
    version: state.version,
    teamName: state.teamName,
    season: state.season,
    unlockedPlayerIds: state.unlockedPlayerIds,
    unlockedFieldIds: state.unlockedFieldIds,
    customFields: state.customFields,
    selectedFieldId: state.selectedFieldId,
    starterIds: state.starterIds,
    plans: state.plans,
    muted: state.muted
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function applyUnlocks(season: SeasonState, unlockedPlayerIds: string[], unlockedFieldIds: string[]): { players: string[]; fields: string[] } {
  const players = new Set(unlockedPlayerIds);
  const fields = new Set(unlockedFieldIds);
  for (const player of HOME_TEAM.players) {
    if (season.points >= player.unlockPoints) players.add(player.id);
  }
  for (const field of DEMO_FIELDS) {
    if (season.points >= field.unlockPoints) fields.add(field.id);
  }
  return { players: [...players], fields: [...fields] };
}

const initial = loadSave();

export const useAppStore = create<AppState>((set, get) => ({
  ...initial,
  screen: 'menu',
  currentMatchday: initial.season.matchday,

  setScreen: (screen) => set({ screen }),

  startNewSeason: () => {
    const fresh = defaultSave();
    set({
      ...fresh,
      customFields: get().customFields,
      unlockedFieldIds: get().unlockedFieldIds,
      plans: get().plans,
      lastReplay: undefined,
      screen: 'season',
      currentMatchday: 1
    });
    persist(get());
  },

  recordResult: (replay) => {
    const state = get();
    const fixtures = state.season.fixtures.map((fixture) => {
      if (fixture.matchday !== state.currentMatchday || fixture.played) return fixture;
      const win = replay.result.won;
      const draw = replay.result.homeScore === replay.result.awayScore;
      return {
        ...fixture,
        played: true,
        scoreFor: replay.result.homeScore,
        scoreAgainst: replay.result.awayScore,
        points: win ? 3 : draw ? 1 : 0
      };
    });
    const match = fixtures.find((f) => f.matchday === state.currentMatchday);
    const earned = match?.points ?? 0;
    const season: SeasonState = {
      ...state.season,
      points: state.season.points + earned,
      scoreFor: state.season.scoreFor + replay.result.homeScore,
      scoreAgainst: state.season.scoreAgainst + replay.result.awayScore,
      matchday: Math.min(state.currentMatchday + 1, state.season.totalMatchdays),
      complete: fixtures.every((f) => f.played),
      fixtures
    };
    const unlocked = applyUnlocks(season, state.unlockedPlayerIds, state.unlockedFieldIds);
    set({
      season,
      unlockedPlayerIds: unlocked.players,
      unlockedFieldIds: unlocked.fields,
      currentMatchday: season.matchday,
      lastReplay: replay,
      screen: 'replay'
    });
    persist(get());
  },

  togglePlayerUnlock: (id) => {
    const player = HOME_TEAM.players.find((p) => p.id === id);
    if (!player) return;
    const unlocked = new Set(get().unlockedPlayerIds);
    if (unlocked.has(id)) unlocked.delete(id);
    else {
      if (get().season.points < player.unlockPoints) return;
      unlocked.add(id);
    }
    let starters = get().starterIds;
    if (!unlocked.has(id)) starters = starters.filter((s) => s !== id);
    if (starters.length < 5) {
      const next = HOME_TEAM.players.find((p) => unlocked.has(p.id) && !starters.includes(p.id));
      if (next) starters = [...starters, next.id];
    }
    set({ unlockedPlayerIds: [...unlocked], starterIds: starters.slice(0, 5) });
    persist(get());
  },

  toggleFieldUnlock: (id) => {
    const field = DEMO_FIELDS.find((p) => p.id === id) ?? get().customFields.find((p) => p.id === id);
    if (!field) return;
    if (field.builtIn && get().season.points < field.unlockPoints) return;
    const unlocked = new Set(get().unlockedFieldIds);
    if (unlocked.has(id)) unlocked.delete(id);
    else unlocked.add(id);
    const ids = [...unlocked];
    set({
      unlockedFieldIds: ids,
      selectedFieldId: ids.includes(get().selectedFieldId) ? get().selectedFieldId : FIELD_HOME_ID
    });
    persist(get());
  },

  selectField: (id) => {
    if (!get().unlockedFieldIds.includes(id) && !get().customFields.some((f) => f.id === id)) return;
    set({ selectedFieldId: id });
    persist(get());
  },

  setStarters: (ids) => {
    if (ids.length !== 5) return;
    set({ starterIds: ids });
    persist(get());
  },

  savePlan: (fieldId, plan) => {
    if (get().plans[fieldId] === plan) return;
    set({ plans: { ...get().plans, [fieldId]: plan } });
    persist(get());
  },

  saveCustomField: (field) => {
    const fields = [...get().customFields.filter((f) => f.id !== field.id), field];
    const unlocked = [...new Set([...get().unlockedFieldIds, field.id])];
    set({ customFields: fields, unlockedFieldIds: unlocked, selectedFieldId: field.id });
    persist(get());
  },

  deleteCustomField: (id) => {
    set({
      customFields: get().customFields.filter((f) => f.id !== id),
      unlockedFieldIds: get().unlockedFieldIds.filter((f) => f !== id),
      selectedFieldId: get().selectedFieldId === id ? FIELD_HOME_ID : get().selectedFieldId
    });
    persist(get());
  },

  setMuted: (muted) => {
    if (get().muted === muted) return;
    set({ muted });
    persist(get());
  },

  setReplay: (replay) => set({ lastReplay: replay }),

  resetAll: () => {
    localStorage.removeItem(SAVE_KEY);
    set({ ...defaultSave(), screen: 'menu', currentMatchday: 1, lastReplay: undefined });
  }
}));

export interface PlayableFixture {
  fixture: SeasonState['fixtures'][number];
  matchday: number;
}

export function getPlayableFixture(season: SeasonState): PlayableFixture | undefined {
  if (season.complete) return undefined;
  const fixture = season.fixtures.find((item) => !item.played);
  if (!fixture) return undefined;
  return { fixture, matchday: fixture.matchday };
}

export function currentPlanFor(field: FieldSpec, starterIds: string[], existing?: GamePlan): GamePlan {
  const starters = HOME_TEAM.players.filter((p) => starterIds.includes(p.id));
  if (existing) {
    const routes = Object.fromEntries(
      starters.map((p, index) => {
        const route = existing.routes[p.id];
        if (route) return [p.id, { playerId: p.id, points: route.points.map((point) => ({ ...point })) }];
        const start = formationForIndex(index, field);
        return [p.id, { playerId: p.id, points: [{ x: start.x, y: start.y, pace: 'jog' as const }] }];
      })
    );
    const ids = new Set(starters.map((p) => p.id));
    return { routes, cues: existing.cues.filter((c) => ids.has(c.fromId) && ids.has(c.toId)) };
  }
  return makeDefaultPlan(starters, field);
}
