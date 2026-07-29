import type { PublicMatch, StandingBaseRow, StandingRow, UUID } from "@/types/domain";

type ManualRanks = Record<UUID, number | null | undefined>;
type SortableStandingRow = StandingBaseRow & { manualRank: number | null };

function compareCompetitive(a: SortableStandingRow, b: SortableStandingRow) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor
  );
}

function compareInitial(a: SortableStandingRow, b: SortableStandingRow) {
  return compareCompetitive(a, b) || a.teamName.localeCompare(b.teamName, "ru");
}

function headToHeadCompare(a: SortableStandingRow, b: SortableStandingRow, matches: PublicMatch[]) {
  const match = matches.find(
    (item) =>
      item.status === "published" &&
      ((item.homeTeamId === a.teamId && item.awayTeamId === b.teamId) ||
        (item.homeTeamId === b.teamId && item.awayTeamId === a.teamId))
  );

  if (!match || match.homeScore === null || match.awayScore === null) {
    return 0;
  }

  const aGoals = match.homeTeamId === a.teamId ? match.homeScore : match.awayScore;
  const bGoals = match.homeTeamId === b.teamId ? match.homeScore : match.awayScore;
  const aPoints = aGoals > bGoals ? 3 : aGoals === bGoals ? 1 : 0;
  const bPoints = bGoals > aGoals ? 3 : aGoals === bGoals ? 1 : 0;

  return bPoints - aPoints || bGoals - aGoals;
}

function samePointsGroup(rows: SortableStandingRow[], start: number) {
  const points = rows[start]?.points;
  let end = start;
  while (end < rows.length && rows[end]?.points === points) {
    end += 1;
  }
  return rows.slice(start, end);
}

export function sortStandings(
  rows: StandingBaseRow[],
  matches: PublicMatch[],
  manualRanks: ManualRanks = {}
): StandingRow[] {
  const withManualRank = rows.map((row) => ({
    ...row,
    manualRank: manualRanks[row.teamId] ?? null
  }));

  const preSorted = [...withManualRank].sort(compareInitial);
  const sorted: SortableStandingRow[] = [];
  let index = 0;

  while (index < preSorted.length) {
    const group = samePointsGroup(preSorted, index);
    group.sort((a, b) => {
      const headToHead = group.length === 2 ? headToHeadCompare(a, b, matches) : 0;
      if (headToHead !== 0) {
        return headToHead;
      }

      const common = compareCompetitive(a, b);
      if (common !== 0) {
        return common;
      }
      if (a.manualRank !== null && b.manualRank !== null) {
        return a.manualRank - b.manualRank;
      }
      if (a.manualRank !== null) {
        return -1;
      }
      if (b.manualRank !== null) {
        return 1;
      }
      return a.teamName.localeCompare(b.teamName, "ru");
    });

    sorted.push(...group);
    index += group.length;
  }

  return sorted.map((row, place) => ({ ...row, place: place + 1 }));
}

export function buildChessboard(matches: PublicMatch[], teams: { id: UUID; shortName: string }[]) {
  return teams.map((rowTeam) => ({
    teamId: rowTeam.id,
    shortName: rowTeam.shortName,
    cells: teams.map((columnTeam) => {
      if (rowTeam.id === columnTeam.id) {
        return { kind: "self" as const };
      }

      const match = matches.find(
        (item) =>
          (item.homeTeamId === rowTeam.id && item.awayTeamId === columnTeam.id) ||
          (item.homeTeamId === columnTeam.id && item.awayTeamId === rowTeam.id)
      );

      if (!match || match.homeScore === null || match.awayScore === null) {
        return { kind: "empty" as const, matchId: match?.id ?? null };
      }

      const ownScore = match.homeTeamId === rowTeam.id ? match.homeScore : match.awayScore;
      const opponentScore = match.homeTeamId === rowTeam.id ? match.awayScore : match.homeScore;
      return { kind: "score" as const, matchId: match.id, value: `${ownScore}:${opponentScore}` };
    })
  }));
}
