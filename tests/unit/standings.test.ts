import { describe, expect, it } from "vitest";
import { sortStandings } from "@/server/services/standings";
import type { PublicMatch, StandingBaseRow } from "@/types/domain";

const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const c = "00000000-0000-0000-0000-000000000003";

function row(teamId: string, points: number, goalDifference = 0, goalsFor = 0): StandingBaseRow {
  return {
    teamId,
    teamName: `Team ${teamId.slice(-1)}`,
    shortName: `T${teamId.slice(-1)}`,
    logoUrl: null,
    played: 1,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor,
    goalsAgainst: goalsFor - goalDifference,
    goalDifference,
    points
  };
}

function match(homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number): PublicMatch {
  return {
    id: "10000000-0000-0000-0000-000000000001",
    round: 1,
    kickoffAt: null,
    venue: null,
    status: "published",
    resultType: "normal",
    homeTeamId,
    awayTeamId,
    homeTeamName: "home",
    awayTeamName: "away",
    homeTeamShortName: "H",
    awayTeamShortName: "A",
    homeLogoUrl: null,
    awayLogoUrl: null,
    homeScore,
    awayScore,
    publishedByName: null,
    publishedAt: null,
    updatedByName: null,
    updatedAt: null
  };
}

describe("sortStandings", () => {
  it("uses head-to-head when exactly two teams are tied by points", () => {
    const sorted = sortStandings([row(a, 6, 1, 4), row(b, 6, 5, 8)], [match(a, b, 2, 1)]);

    expect(sorted[0]?.teamId).toBe(a);
  });

  it("does not build a mini-table for three or more tied teams", () => {
    const sorted = sortStandings([row(a, 6, 1, 5), row(b, 6, 4, 5), row(c, 6, 2, 5)], [match(a, b, 2, 0)]);

    expect(sorted.map((item) => item.teamId)).toEqual([b, c, a]);
  });

  it("uses manual rank as the last criterion", () => {
    const sorted = sortStandings([row(a, 3, 0, 1), row(b, 3, 0, 1)], [], { [b]: 1, [a]: 2 });

    expect(sorted[0]?.teamId).toBe(b);
  });
});
