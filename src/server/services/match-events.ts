import type { GoalEventType, UUID } from "@/types/domain";

export type GoalEventInput = {
  teamId: UUID;
  scorerPlayerId: UUID;
  assistPlayerId: UUID | null;
  eventType: GoalEventType;
};

export type PlayerStatAccumulator = {
  playerId: UUID;
  goals: number;
  penalties: number;
  nonPenaltyGoals: number;
  assists: number;
  goalPlusAssist: number;
  ownGoals: number;
};

export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function computeMatchScore(
  events: GoalEventInput[],
  homeTeamId: UUID,
  awayTeamId: UUID
): { homeScore: number; awayScore: number } {
  let homeScore = 0;
  let awayScore = 0;

  for (const event of events) {
    if (event.eventType === "own_goal") {
      if (event.teamId === homeTeamId) {
        awayScore += 1;
      } else if (event.teamId === awayTeamId) {
        homeScore += 1;
      }
      continue;
    }

    if (event.teamId === homeTeamId) {
      homeScore += 1;
    } else if (event.teamId === awayTeamId) {
      awayScore += 1;
    }
  }

  return { homeScore, awayScore };
}

export function computePlayerStatistics(events: GoalEventInput[]) {
  const byPlayer = new Map<UUID, PlayerStatAccumulator>();

  function stat(playerId: UUID) {
    const current = byPlayer.get(playerId);
    if (current) {
      return current;
    }
    const created: PlayerStatAccumulator = {
      playerId,
      goals: 0,
      penalties: 0,
      nonPenaltyGoals: 0,
      assists: 0,
      goalPlusAssist: 0,
      ownGoals: 0
    };
    byPlayer.set(playerId, created);
    return created;
  }

  for (const event of events) {
    const scorer = stat(event.scorerPlayerId);
    if (event.eventType === "own_goal") {
      scorer.ownGoals += 1;
      continue;
    }

    scorer.goals += 1;
    scorer.goalPlusAssist += 1;
    if (event.eventType === "penalty") {
      scorer.penalties += 1;
    } else {
      scorer.nonPenaltyGoals += 1;
    }

    if (event.assistPlayerId && event.eventType !== "penalty") {
      const assistant = stat(event.assistPlayerId);
      assistant.assists += 1;
      assistant.goalPlusAssist += 1;
    }
  }

  return Array.from(byPlayer.values());
}
