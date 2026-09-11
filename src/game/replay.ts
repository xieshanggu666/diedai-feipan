import type { GamePlan, MatchEvent, MatchEventType, ReplayData, ReplayFocus } from '../types';

/** Event types that count as turnovers worth reviewing in the plan editor. */
export const FAILURE_EVENT_TYPES: readonly MatchEventType[] = ['drop', 'interception', 'stall', 'blocked', 'outOfBounds'];

export function isFailureEvent(event: Pick<MatchEvent, 'type'>): boolean {
  return FAILURE_EVENT_TYPES.includes(event.type);
}

/** Everything the plan editor needs to reopen the exact situation of a finished match. */
export interface ReplayPlanContext {
  fieldId: string;
  plan: GamePlan;
  starterIds: string[];
  focus: ReplayFocus;
}

export function planContextFromReplay(replay: ReplayData, event: MatchEvent): ReplayPlanContext {
  return {
    fieldId: replay.fieldId,
    plan: replay.plan,
    starterIds: replay.starterIds,
    focus: {
      eventId: event.id,
      time: event.time,
      type: event.type,
      message: event.message,
      playerId: event.playerId,
      x: event.x,
      y: event.y
    }
  };
}
