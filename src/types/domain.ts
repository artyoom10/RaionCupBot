export type UUID = string;

export type UserRole = "super_admin" | "moderator";

export type MatchStatus = "scheduled" | "published";

export type MatchResultType = "normal" | "technical_home" | "technical_away" | "technical_both";

export type GoalEventType = "goal" | "penalty" | "own_goal";

export type AppUser = {
  id: UUID;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  favoriteTeamId: UUID | null;
  onboardingCompletedAt: string | null;
};

export type Team = {
  id: UUID;
  name: string;
  shortName: string;
  city: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  displayOrder: number;
  isActive: boolean;
};

export type RoleAssignment = {
  role: UserRole;
  teamId: UUID | null;
};

export type Player = {
  id: UUID;
  teamId: UUID;
  fullName: string;
  isActive: boolean;
};

export type PublicMatch = {
  id: UUID;
  round: number;
  kickoffAt: string | null;
  venue: string | null;
  status: MatchStatus;
  resultType: MatchResultType;
  homeTeamId: UUID;
  awayTeamId: UUID;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string;
  awayTeamShortName: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  homeScore: number | null;
  awayScore: number | null;
  publishedByName: string | null;
  publishedAt: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

export type StandingBaseRow = {
  teamId: UUID;
  teamName: string;
  shortName: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type StandingRow = StandingBaseRow & {
  place: number;
  manualRank: number | null;
};

export type PlayerStatistic = {
  playerId: UUID;
  playerName: string;
  teamId: UUID;
  teamName: string;
  goals: number;
  penalties: number;
  nonPenaltyGoals: number;
  assists: number;
  goalPlusAssist: number;
  ownGoals: number;
};

export type TelegramUserPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type VerifiedTelegramInitData = {
  authDate: number;
  user: TelegramUserPayload;
};

export type Permission =
  | "view_admin_tab"
  | "manage_any_players"
  | "manage_schedule"
  | "publish_result"
  | "replace_result"
  | "manage_teams"
  | "view_audit_log";
