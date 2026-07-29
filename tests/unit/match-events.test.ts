import { describe, expect, it } from "vitest";
import { computeMatchScore, computePlayerStatistics, normalizePlayerName, type GoalEventInput } from "@/server/services/match-events";

const home = "00000000-0000-0000-0000-000000000001";
const away = "00000000-0000-0000-0000-000000000002";
const p1 = "10000000-0000-0000-0000-000000000001";
const p2 = "10000000-0000-0000-0000-000000000002";
const p3 = "10000000-0000-0000-0000-000000000003";

describe("match events", () => {
  it("normalizes player names", () => {
    expect(normalizePlayerName("  Ivan   Petrov  ")).toBe("Ivan Petrov");
  });

  it("computes normal, no-assist, penalty and own-goal score", () => {
    const events: GoalEventInput[] = [
      { teamId: home, scorerPlayerId: p1, assistPlayerId: p2, eventType: "goal" },
      { teamId: home, scorerPlayerId: p1, assistPlayerId: null, eventType: "goal" },
      { teamId: away, scorerPlayerId: p3, assistPlayerId: null, eventType: "penalty" },
      { teamId: away, scorerPlayerId: p3, assistPlayerId: null, eventType: "own_goal" }
    ];

    expect(computeMatchScore(events, home, away)).toEqual({ homeScore: 3, awayScore: 1 });
  });

  it("keeps goals, assists, goal plus assist, penalties and own goals", () => {
    const stats = computePlayerStatistics([
      { teamId: home, scorerPlayerId: p1, assistPlayerId: p2, eventType: "goal" },
      { teamId: home, scorerPlayerId: p1, assistPlayerId: null, eventType: "penalty" },
      { teamId: away, scorerPlayerId: p3, assistPlayerId: null, eventType: "own_goal" }
    ]);

    expect(stats.find((item) => item.playerId === p1)).toMatchObject({ goals: 2, penalties: 1, nonPenaltyGoals: 1, goalPlusAssist: 2 });
    expect(stats.find((item) => item.playerId === p2)).toMatchObject({ assists: 1, goalPlusAssist: 1 });
    expect(stats.find((item) => item.playerId === p3)).toMatchObject({ ownGoals: 1, goals: 0 });
  });
});
