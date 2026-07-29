"use client";

import { BarChart3, CalendarDays, Shield, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav, type TabKey } from "@/components/navigation/BottomNav";
import { Splash } from "@/components/splash/Splash";
import { TOURNAMENT_ACCENT_COLOR, TOURNAMENT_LOGO_URL } from "@/lib/branding";
import { formatMoscowDateTime } from "@/lib/date-time/format";
import { getTelegramWebApp } from "@/lib/telegram/web-app";
import type { AppUser, PlayerStatistic, PublicMatch, RoleAssignment, StandingRow, Team } from "@/types/domain";

type BootstrapResponse = {
  user: AppUser;
  roles: RoleAssignment[];
  permissions: Record<string, boolean>;
  favoriteTeam: Team | null;
  teams: Team[];
  settings: {
    tournamentName: string;
    appShortName: string;
    timezone: string;
  };
};

type RemoteState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

type ChessboardPayload = {
  columns: { teamId: string; name: string; shortName: string; logoUrl: string | null }[];
  rows: {
    teamId: string;
    name: string;
    shortName: string;
    logoUrl: string | null;
    cells: { kind: "self" | "empty" | "score"; matchId?: string | null; value?: string }[];
  }[];
};

type AdminPlayer = {
  id: string;
  teamId: string;
  fullName: string;
  isActive: boolean;
};

type ResultGoalEvent = {
  teamId: string;
  scorerPlayerId: string;
  assistPlayerId: string | null;
  eventType: "goal" | "penalty" | "own_goal";
};

const initialRemoteState = { loading: false, data: null, error: null };

function allowsDevTelegramMock() {
  return process.env.NEXT_PUBLIC_ALLOW_DEV_TELEGRAM_MOCK === "true";
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const values = new Uint32Array(4);
  globalThis.crypto?.getRandomValues(values);
  return `client-${Array.from(values).join("-")}`;
}

export function MiniApp() {
  const [initData, setInitData] = useState("");
  const [telegramName, setTelegramName] = useState<string | null>(null);
  const [outsideTelegram, setOutsideTelegram] = useState<boolean | null>(null);
  const [telegramDebug, setTelegramDebug] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<RemoteState<BootstrapResponse>>({ ...initialRemoteState, loading: true });
  const [activeTab, setActiveTab] = useState<TabKey>("calendar");
  const [matches, setMatches] = useState<RemoteState<PublicMatch[]>>(initialRemoteState);
  const [standings, setStandings] = useState<RemoteState<StandingRow[]>>(initialRemoteState);
  const [chessboard, setChessboard] = useState<RemoteState<ChessboardPayload>>(initialRemoteState);
  const [statistics, setStatistics] = useState<RemoteState<PlayerStatistic[]>>(initialRemoteState);
  const [standingsMode, setStandingsMode] = useState<"table" | "chessboard">("table");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 50;

    const timer = window.setInterval(() => {
      attempts += 1;
      const webApp = getTelegramWebApp();
      const tgInitData = webApp?.initData ?? "";

      if (tgInitData) {
        webApp?.ready();
        webApp?.expand();
        setInitData(tgInitData);
        setTelegramName(webApp?.initDataUnsafe?.user?.first_name ?? null);
        setOutsideTelegram(false);
        setTelegramDebug(null);
        window.clearInterval(timer);
        return;
      }

      if (allowsDevTelegramMock()) {
        setOutsideTelegram(false);
        setTelegramDebug(null);
        window.clearInterval(timer);
        return;
      }

      if (attempts >= maxAttempts) {
        setOutsideTelegram(true);
        setTelegramDebug(
          webApp
            ? "Telegram WebApp найден, но initData пустой. Обычно это значит, что URL открыт не как Web App кнопка текущего бота."
            : "Telegram WebApp bridge не найден. Проверьте, что Vercel задеплоил последнюю версию и приложение открыто из Mini App."
        );
        window.clearInterval(timer);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, []);

  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
          ...init?.headers
        }
      });
      const json = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Ошибка запроса");
      }
      return json;
    },
    [initData]
  );

  const loadBootstrap = useCallback(async () => {
    if (outsideTelegram !== false || (!initData && !allowsDevTelegramMock())) {
      return;
    }
    setBootstrap((state) => ({ ...state, loading: true, error: null }));
    try {
      const data = await apiFetch<BootstrapResponse>("/api/bootstrap", { method: "POST" });
      setBootstrap({ data, loading: false, error: null });
      setSelectedTeamId(data.user.favoriteTeamId);
    } catch (error) {
      setBootstrap({ data: null, loading: false, error: error instanceof Error ? error.message : "Ошибка загрузки" });
    }
  }, [apiFetch, initData, outsideTelegram]);

  useEffect(() => {
    if (!outsideTelegram) {
      void loadBootstrap();
    }
  }, [loadBootstrap, outsideTelegram]);

  const loadTabData = useCallback(
    async (tab: TabKey) => {
      if (!bootstrap.data) {
        return;
      }

      async function load<T>(setter: (value: RemoteState<T>) => void, path: string, key: string) {
        setter({ loading: true, data: null, error: null });
        try {
          const data = await apiFetch<Record<string, T>>(path);
          setter({ loading: false, data: data[key] ?? null, error: null });
        } catch (error) {
          setter({ loading: false, data: null, error: error instanceof Error ? error.message : "Ошибка загрузки" });
        }
      }

      if (tab === "calendar" && !matches.data && !matches.loading) {
        await load(setMatches, "/api/matches", "matches");
      }
      if (tab === "standings" && !standings.data && !standings.loading) {
        await load(setStandings, "/api/standings", "standings");
      }
      if (tab === "standings" && !chessboard.data && !chessboard.loading) {
        await load(setChessboard, "/api/chessboard", "chessboard");
      }
      if (tab === "statistics" && !statistics.data && !statistics.loading) {
        await load(setStatistics, "/api/statistics", "statistics");
      }
    },
    [apiFetch, bootstrap.data, chessboard.data, chessboard.loading, matches.data, matches.loading, standings.data, standings.loading, statistics.data, statistics.loading]
  );

  useEffect(() => {
    void loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const favoriteTeam = useMemo(
    () => bootstrap.data?.teams.find((team) => team.id === selectedTeamId) ?? null,
    [bootstrap.data?.teams, selectedTeamId]
  );

  async function saveFavorite(teamId: string | null) {
    setSavingFavorite(true);
    try {
      await apiFetch("/api/me/favorite-team", {
        method: "PATCH",
        body: JSON.stringify({ teamId })
      });
      await loadBootstrap();
      setActiveTab("calendar");
    } finally {
      setSavingFavorite(false);
    }
  }

  if (outsideTelegram === null) {
    return (
      <Splash
        loading
        error={null}
        userName={telegramName ?? "гость"}
        appName="Raion Cup"
        logoUrl={TOURNAMENT_LOGO_URL}
        primaryColor={TOURNAMENT_ACCENT_COLOR}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (outsideTelegram) {
    return (
      <main className="outside-telegram">
        <img src={TOURNAMENT_LOGO_URL} alt="Raion Cup" />
        <h1>Откройте приложение через Telegram</h1>
        <p>Mini App проверяет подписанные данные Telegram и не работает как публичный сайт.</p>
        {telegramDebug ? <p className="diagnostic">{telegramDebug}</p> : null}
      </main>
    );
  }

  if (bootstrap.loading || bootstrap.error || !bootstrap.data) {
    return (
      <Splash
        loading={bootstrap.loading}
        error={bootstrap.error}
        userName={telegramName ?? bootstrap.data?.user.firstName ?? "гость"}
        appName={bootstrap.data?.settings.appShortName ?? "Raion Cup"}
        logoUrl={bootstrap.data?.favoriteTeam?.logoUrl ?? TOURNAMENT_LOGO_URL}
        primaryColor={bootstrap.data?.favoriteTeam?.primaryColor ?? TOURNAMENT_ACCENT_COLOR}
        onRetry={loadBootstrap}
      />
    );
  }

  const needsOnboarding = !bootstrap.data.user.onboardingCompletedAt;
  const tabs = [
    { key: "calendar" as const, label: "Календарь", icon: CalendarDays },
    { key: "standings" as const, label: "Таблица", icon: Trophy },
    { key: "statistics" as const, label: "Статистика", icon: BarChart3 },
    { key: "profile" as const, label: "Профиль", icon: UserRound },
    ...(bootstrap.data.permissions.view_admin_tab ? [{ key: "admin" as const, label: "Админ", icon: Shield }] : [])
  ];

  return (
    <main className="app-shell">
      {needsOnboarding ? (
        <Onboarding
          teams={bootstrap.data.teams}
          selectedTeamId={selectedTeamId}
          saving={savingFavorite}
          onSelect={setSelectedTeamId}
          onConfirm={() => saveFavorite(selectedTeamId)}
          onSkip={() => saveFavorite(null)}
        />
      ) : (
        <>
          <header className="topbar">
            <div className="topbar-brand">
              <img src={TOURNAMENT_LOGO_URL} alt="Логотип турнира" />
              <div>
                <span>{bootstrap.data.settings.tournamentName}</span>
                <strong>{favoriteTeam ? favoriteTeam.shortName : "Raion Cup"}</strong>
              </div>
            </div>
            {favoriteTeam ? <img className="favorite-logo" src={favoriteTeam.logoUrl ?? "/fallback-team-logo.svg"} alt={favoriteTeam.name} /> : null}
          </header>

          <section className="content">
            {activeTab === "calendar" ? <CalendarView state={matches} favoriteTeamId={bootstrap.data.user.favoriteTeamId} /> : null}
            {activeTab === "standings" ? (
              <StandingsView
                state={standings}
                chessboardState={chessboard}
                favoriteTeamId={bootstrap.data.user.favoriteTeamId}
                mode={standingsMode}
                onModeChange={setStandingsMode}
              />
            ) : null}
            {activeTab === "statistics" ? <StatisticsView state={statistics} /> : null}
            {activeTab === "profile" ? (
              <ProfileView
                user={bootstrap.data.user}
                teams={bootstrap.data.teams}
                selectedTeamId={selectedTeamId}
                saving={savingFavorite}
                onSelect={setSelectedTeamId}
                onSave={() => saveFavorite(selectedTeamId)}
              />
            ) : null}
            {activeTab === "admin" ? (
              <AdminView
                permissions={bootstrap.data.permissions}
                roles={bootstrap.data.roles}
                teams={bootstrap.data.teams}
                message={adminMessage}
                onMessage={setAdminMessage}
                apiFetch={apiFetch}
                onDataChanged={() => {
                  setMatches(initialRemoteState);
                  setStandings(initialRemoteState);
                  setChessboard(initialRemoteState);
                  setStatistics(initialRemoteState);
                }}
              />
            ) : null}
          </section>

          <BottomNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </>
      )}
    </main>
  );
}

function StateBlock<T>({ state, emptyText, children }: { state: RemoteState<T>; emptyText: string; children: (data: T) => React.ReactNode }) {
  if (state.loading) {
    return <div className="state">Загрузка...</div>;
  }
  if (state.error) {
    return <div className="state state-error">{state.error}</div>;
  }
  if (!state.data || (Array.isArray(state.data) && state.data.length === 0)) {
    return <div className="state">{emptyText}</div>;
  }
  return children(state.data);
}

function Onboarding(props: {
  teams: Team[];
  selectedTeamId: string | null;
  saving: boolean;
  onSelect: (teamId: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  return (
    <section className="onboarding">
      <img className="onboarding-avatar" src={TOURNAMENT_LOGO_URL} alt="Raion Cup" />
      <h1>Выберите любимую команду</h1>
      <div className="team-grid">
        {props.teams.map((team) => (
          <button key={team.id} className={team.id === props.selectedTeamId ? "team-card selected" : "team-card"} onClick={() => props.onSelect(team.id)}>
            <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
            <strong>{team.shortName}</strong>
            <span>{team.city ?? team.name}</span>
          </button>
        ))}
      </div>
      <div className="sticky-actions">
        <button className="primary" disabled={!props.selectedTeamId || props.saving} onClick={props.onConfirm}>
          Подтвердить
        </button>
        <button className="ghost" disabled={props.saving} onClick={props.onSkip}>
          Пропустить
        </button>
      </div>
    </section>
  );
}

function CalendarView({ state, favoriteTeamId }: { state: RemoteState<PublicMatch[]>; favoriteTeamId: string | null }) {
  return (
    <StateBlock state={state} emptyText="Расписание пока не добавлено">
      {(matches) => (
        <div className="match-list">
          {matches.map((match) => {
            const favorite = match.homeTeamId === favoriteTeamId || match.awayTeamId === favoriteTeamId;
            return (
              <article key={match.id} className={favorite ? "match-card favorite" : "match-card"}>
                <div className="match-meta">
                  <span>Тур {match.round}</span>
                  <span>{formatMoscowDateTime(match.kickoffAt)}</span>
                </div>
                <div className="score-row">
                  <TeamSide name={match.homeTeamShortName} logoUrl={match.homeLogoUrl} />
                  <strong>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</strong>
                  <TeamSide name={match.awayTeamShortName} logoUrl={match.awayLogoUrl} />
                </div>
                <footer>{match.venue ?? "Стадион уточняется"}</footer>
              </article>
            );
          })}
        </div>
      )}
    </StateBlock>
  );
}

function TeamSide({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="team-side">
      <img src={logoUrl ?? "/fallback-team-logo.svg"} alt={name} />
      <span>{name}</span>
    </div>
  );
}

function StandingsView({
  state,
  chessboardState,
  favoriteTeamId,
  mode,
  onModeChange
}: {
  state: RemoteState<StandingRow[]>;
  chessboardState: RemoteState<ChessboardPayload>;
  favoriteTeamId: string | null;
  mode: "table" | "chessboard";
  onModeChange: (mode: "table" | "chessboard") => void;
}) {
  return (
    <section className="standings-section">
      <div className="section-switch" role="tablist" aria-label="Раздел таблицы">
        <button className={mode === "table" ? "active" : ""} onClick={() => onModeChange("table")} type="button">
          Таблица
        </button>
        <button className={mode === "chessboard" ? "active" : ""} onClick={() => onModeChange("chessboard")} type="button">
          Шахматка
        </button>
      </div>

      {mode === "table" ? (
        <StateBlock state={state} emptyText="Таблица появится после публикации матчей">
          {(rows) => (
            <div className="table-wrap standings-table-wrap">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th className="rank-column">#</th>
                    <th className="team-column">Команда</th>
                    <th>И</th>
                    <th>В</th>
                    <th>Н</th>
                    <th>П</th>
                    <th>МЗ-МП</th>
                    <th>РМ</th>
                    <th>О</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.teamId} className={row.teamId === favoriteTeamId ? "favorite-row" : ""}>
                      <td className="rank-column">{row.place}</td>
                      <td className="team-column">
                        <div className="table-team">
                          <img src={row.logoUrl ?? "/fallback-team-logo.svg"} alt={row.teamName} />
                          <span>{row.shortName}</span>
                        </div>
                      </td>
                      <td>{row.played}</td>
                      <td>{row.wins}</td>
                      <td>{row.draws}</td>
                      <td>{row.losses}</td>
                      <td>{row.goalsFor}-{row.goalsAgainst}</td>
                      <td className={row.goalDifference > 0 ? "positive-stat" : row.goalDifference < 0 ? "negative-stat" : ""}>{row.goalDifference}</td>
                      <td className="points-column">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StateBlock>
      ) : (
        <ChessboardView state={chessboardState} favoriteTeamId={favoriteTeamId} />
      )}
    </section>
  );
}

function ChessboardView({ state, favoriteTeamId }: { state: RemoteState<ChessboardPayload>; favoriteTeamId: string | null }) {
  return (
    <StateBlock state={state} emptyText="Шахматка появится после добавления команд">
      {(payload) => (
        <div className="chessboard-wrap">
          <table className="chess-table">
            <thead>
              <tr>
                <th className="chess-team-sticky">Команда</th>
                {payload.columns.map((team) => (
                  <th key={team.teamId} className={team.teamId === favoriteTeamId ? "favorite-column" : ""}>
                    <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
                    <span>{team.shortName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={row.teamId} className={row.teamId === favoriteTeamId ? "favorite-row" : ""}>
                  <td className="chess-team-sticky">
                    <div className="table-team">
                      <img src={row.logoUrl ?? "/fallback-team-logo.svg"} alt={row.name} />
                      <span>{row.shortName}</span>
                    </div>
                  </td>
                  {row.cells.map((cell, index) => {
                    const column = payload.columns[index];
                    const favoriteCell = row.teamId === favoriteTeamId || column?.teamId === favoriteTeamId;
                    return (
                      <td key={`${row.teamId}-${column?.teamId ?? index}`} className={`${cell.kind} ${favoriteCell ? "favorite-cell" : ""}`}>
                        {cell.kind === "self" ? "" : cell.value ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StateBlock>
  );
}

function StatisticsView({ state }: { state: RemoteState<PlayerStatistic[]> }) {
  const [tab, setTab] = useState<"goals" | "assists" | "points" | "ownGoals">("goals");
  const sorted = [...(state.data ?? [])].sort((a, b) => {
    const key = tab === "goals" ? "goals" : tab === "assists" ? "assists" : tab === "points" ? "goalPlusAssist" : "ownGoals";
    return b[key] - a[key] || a.playerName.localeCompare(b.playerName, "ru");
  });

  return (
    <StateBlock state={{ ...state, data: sorted }} emptyText="Статистика появится после протоколов матчей">
      {(rows) => (
        <>
          <div className="segments">
            {[
              ["goals", "Голы"],
              ["assists", "Пасы"],
              ["points", "Гол+пас"],
              ["ownGoals", "Автоголы"]
            ].map(([key, label]) => (
              <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key as typeof tab)}>
                {label}
              </button>
            ))}
          </div>
          <div className="stat-list">
            {rows.map((row) => (
              <article key={`${row.playerId}-${tab}`}>
                <div>
                  <strong>{row.playerName}</strong>
                  <span>{row.teamName}</span>
                </div>
                <b>{tab === "goals" ? row.goals : tab === "assists" ? row.assists : tab === "points" ? row.goalPlusAssist : row.ownGoals}</b>
              </article>
            ))}
          </div>
        </>
      )}
    </StateBlock>
  );
}

function ProfileView(props: {
  user: AppUser;
  teams: Team[];
  selectedTeamId: string | null;
  saving: boolean;
  onSelect: (teamId: string | null) => void;
  onSave: () => void;
}) {
  return (
    <section className="profile">
      <img src={TOURNAMENT_LOGO_URL} alt="Логотип турнира" />
      <h2>
        {props.user.firstName} {props.user.lastName}
      </h2>
      <label>
        Любимая команда
        <select value={props.selectedTeamId ?? ""} onChange={(event) => props.onSelect(event.target.value || null)}>
          <option value="">Не выбрана</option>
          {props.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <button className="primary" disabled={props.saving} onClick={props.onSave}>
        Сохранить
      </button>
    </section>
  );
}

function AdminView(props: {
  permissions: Record<string, boolean>;
  roles: RoleAssignment[];
  teams: Team[];
  message: string | null;
  onMessage: (message: string | null) => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onDataChanged: () => void;
}) {
  const { apiFetch, onMessage, permissions, roles, teams } = props;
  const [teamName, setTeamName] = useState("");
  const [teamShortName, setTeamShortName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerTeamId, setPlayerTeamId] = useState(props.teams[0]?.id ?? "");
  const [round, setRound] = useState("1");
  const [kickoffAt, setKickoffAt] = useState("");
  const [venue, setVenue] = useState("");
  const [homeTeamId, setHomeTeamId] = useState(props.teams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(props.teams[1]?.id ?? "");
  const [adminMatches, setAdminMatches] = useState<PublicMatch[]>([]);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [resultMatchId, setResultMatchId] = useState("");
  const [resultType, setResultType] = useState<"normal" | "technical_home" | "technical_away" | "technical_both">("normal");
  const [goalEvents, setGoalEvents] = useState<ResultGoalEvent[]>([]);

  const canManageSchedule = Boolean(permissions.manage_schedule);
  const canPublishResult = Boolean(permissions.publish_result);
  const canReplaceResult = Boolean(permissions.replace_result);
  const canManageAnyPlayers = Boolean(permissions.manage_any_players);
  const canManageOwnTeamPlayers = Boolean(permissions.manage_own_team_players);
  const teamAdminIds = useMemo(() => roles.filter((role) => role.role === "team_admin" && role.teamId).map((role) => role.teamId as string), [roles]);
  const playerTeams = useMemo(
    () => (canManageAnyPlayers ? teams : teams.filter((team) => teamAdminIds.includes(team.id))),
    [canManageAnyPlayers, teams, teamAdminIds]
  );
  const selectedResultMatch = adminMatches.find((match) => match.id === resultMatchId) ?? null;
  const resultTeams = selectedResultMatch
    ? teams.filter((team) => team.id === selectedResultMatch.homeTeamId || team.id === selectedResultMatch.awayTeamId)
    : [];

  const loadAdminData = useCallback(async () => {
    setAdminLoading(true);
    try {
      const requests: Promise<unknown>[] = [];
      if (canManageSchedule || canPublishResult || canReplaceResult) {
        requests.push(apiFetch<{ matches: PublicMatch[] }>("/api/matches"));
      } else {
        requests.push(Promise.resolve({ matches: [] }));
      }

      if (canManageAnyPlayers || canManageOwnTeamPlayers || canPublishResult || canReplaceResult) {
        requests.push(apiFetch<{ players: AdminPlayer[] }>("/api/admin/players"));
      } else {
        requests.push(Promise.resolve({ players: [] }));
      }

      const [matchesResponse, playersResponse] = await Promise.all(requests);
      const nextMatches = (matchesResponse as { matches: PublicMatch[] }).matches;
      setAdminMatches(nextMatches);
      setPlayers((playersResponse as { players: AdminPlayer[] }).players);
      setResultMatchId((current) => current || nextMatches.find((match) => match.status !== "published")?.id || nextMatches[0]?.id || "");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Не удалось загрузить админские данные");
    } finally {
      setAdminLoading(false);
    }
  }, [
    canManageAnyPlayers,
    canManageOwnTeamPlayers,
    canManageSchedule,
    canPublishResult,
    canReplaceResult,
    apiFetch,
    onMessage
  ]);

  useEffect(() => {
    if (!playerTeams.some((team) => team.id === playerTeamId)) {
      setPlayerTeamId(playerTeams[0]?.id ?? "");
    }
  }, [playerTeamId, playerTeams]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  function playersForTeam(teamId: string) {
    return players.filter((player) => player.teamId === teamId && player.isActive);
  }

  function firstPlayerId(teamId: string) {
    return playersForTeam(teamId)[0]?.id ?? "";
  }

  async function createTeam() {
    await apiFetch("/api/admin/teams", {
      method: "POST",
      body: JSON.stringify({ name: teamName, shortName: teamShortName, city: null })
    });
    setTeamName("");
    setTeamShortName("");
    onMessage("Команда добавлена");
    props.onDataChanged();
  }

  async function createPlayer() {
    if (!playerTeamId || !playerName.trim()) {
      onMessage("Выберите команду и введите имя игрока");
      return;
    }

    await apiFetch("/api/admin/players", {
      method: "POST",
      body: JSON.stringify({ teamId: playerTeamId, fullName: playerName })
    });
    setPlayerName("");
    onMessage("Игрок сохранён");
    await loadAdminData();
  }

  async function createMatch() {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      onMessage("Выберите две разные команды");
      return;
    }

    await apiFetch("/api/admin/matches", {
      method: "POST",
      body: JSON.stringify({
        round: Number(round),
        kickoffAt: kickoffAt ? new Date(kickoffAt).toISOString() : null,
        venue: venue.trim() || null,
        homeTeamId,
        awayTeamId
      })
    });
    setVenue("");
    onMessage("Матч добавлен");
    props.onDataChanged();
    await loadAdminData();
  }

  function addGoalEvent() {
    const teamId = selectedResultMatch?.homeTeamId ?? resultTeams[0]?.id ?? "";
    const scorerPlayerId = firstPlayerId(teamId);
    if (!teamId || !scorerPlayerId) {
      onMessage("Для выбранной команды нет игроков в заявке");
      return;
    }
    setGoalEvents((current) => [...current, { teamId, scorerPlayerId, assistPlayerId: null, eventType: "goal" }]);
  }

  function updateGoalEvent(index: number, patch: Partial<ResultGoalEvent>) {
    setGoalEvents((current) =>
      current.map((event, eventIndex) => {
        if (eventIndex !== index) {
          return event;
        }
        const next = { ...event, ...patch };
        if (patch.teamId) {
          next.scorerPlayerId = firstPlayerId(patch.teamId);
          next.assistPlayerId = null;
        }
        if (patch.eventType === "penalty" || patch.eventType === "own_goal") {
          next.assistPlayerId = null;
        }
        return next;
      })
    );
  }

  async function submitResult() {
    if (!selectedResultMatch) {
      onMessage("Выберите матч");
      return;
    }
    if (selectedResultMatch.status === "published" && !props.permissions.replace_result) {
      onMessage("Опубликованный результат может менять только главный администратор");
      return;
    }

    const endpoint = selectedResultMatch.status === "published" ? "/api/admin/results/replace" : "/api/admin/results/publish";
    await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        matchId: selectedResultMatch.id,
        resultType,
        goalEvents:
          resultType === "normal"
            ? goalEvents.map((event) => ({
                ...event,
                assistPlayerId: event.assistPlayerId || null
              }))
            : [],
        idempotencyKey: createIdempotencyKey()
      })
    });

    setGoalEvents([]);
    onMessage(selectedResultMatch.status === "published" ? "Результат обновлён" : "Результат опубликован");
    props.onDataChanged();
    await loadAdminData();
  }

  return (
    <section className="admin">
      {props.message ? <div className="notice">{props.message}</div> : null}
      {props.permissions.manage_teams ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createTeam();
          }}
        >
          <h2>Команды</h2>
          <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Полное название" />
          <input value={teamShortName} onChange={(event) => setTeamShortName(event.target.value)} placeholder="Короткое название" />
          <button className="primary" type="submit">
            Добавить
          </button>
        </form>
      ) : null}
      {props.permissions.manage_any_players || props.permissions.manage_own_team_players ? (
        <form
          className="native-admin-card"
          onSubmit={(event) => {
            event.preventDefault();
            void createPlayer();
          }}
        >
          <h2>Заявка</h2>
          {playerTeams.length > 1 ? (
            <div className="team-picker">
              {playerTeams.map((team) => (
                <button key={team.id} type="button" className={playerTeamId === team.id ? "active" : ""} onClick={() => setPlayerTeamId(team.id)}>
                  <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
                  <span>{team.shortName}</span>
                </button>
              ))}
            </div>
          ) : null}
          <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Фамилия и имя игрока" />
          <button className="primary" type="submit">
            Добавить игрока
          </button>
          <div className="compact-list">
            {players
              .filter((player) => player.teamId === playerTeamId)
              .slice(0, 8)
              .map((player) => (
                <span key={player.id} className={player.isActive ? "" : "inactive"}>
                  {player.fullName}
                </span>
              ))}
          </div>
        </form>
      ) : null}
      {props.permissions.manage_schedule ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createMatch();
          }}
        >
          <h2>Матч</h2>
          <div className="admin-grid-two">
            <label>
              Тур
              <input value={round} onChange={(event) => setRound(event.target.value)} type="number" min="1" />
            </label>
            <label>
              Дата
              <input value={kickoffAt} onChange={(event) => setKickoffAt(event.target.value)} type="datetime-local" />
            </label>
          </div>
          <div className="admin-grid-two">
            <label>
              Хозяева
              <select value={homeTeamId} onChange={(event) => setHomeTeamId(event.target.value)}>
                {props.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Гости
              <select value={awayTeamId} onChange={(event) => setAwayTeamId(event.target.value)}>
                {props.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Стадион или площадка" />
          <button className="primary" type="submit">
            Создать матч
          </button>
        </form>
      ) : null}
      {props.permissions.publish_result || props.permissions.replace_result ? (
        <form
          className="result-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitResult();
          }}
        >
          <h2>Результат</h2>
          {adminLoading ? <div className="notice">Загрузка матчей и заявок...</div> : null}
          <select
            value={resultMatchId}
            onChange={(event) => {
              setResultMatchId(event.target.value);
              setGoalEvents([]);
            }}
          >
            <option value="">Выберите матч</option>
            {adminMatches.map((match) => (
              <option key={match.id} value={match.id}>
                Тур {match.round}: {match.homeTeamShortName} - {match.awayTeamShortName}
                {match.status === "published" ? " · опубликован" : ""}
              </option>
            ))}
          </select>
          <select value={resultType} onChange={(event) => setResultType(event.target.value as typeof resultType)}>
            <option value="normal">Обычный результат</option>
            <option value="technical_home">ТП хозяевам 3:0</option>
            <option value="technical_away">ТП гостям 0:3</option>
            <option value="technical_both">Обоюдное ТП 0:0</option>
          </select>
          {resultType === "normal" ? (
            <>
              <div className="goal-events">
                {goalEvents.map((event, index) => {
                  const teamPlayers = playersForTeam(event.teamId);
                  return (
                    <div key={index} className="goal-event-row">
                      <select value={event.eventType} onChange={(changeEvent) => updateGoalEvent(index, { eventType: changeEvent.target.value as ResultGoalEvent["eventType"] })}>
                        <option value="goal">Гол</option>
                        <option value="penalty">Пенальти</option>
                        <option value="own_goal">Автогол</option>
                      </select>
                      <select value={event.teamId} onChange={(changeEvent) => updateGoalEvent(index, { teamId: changeEvent.target.value })}>
                        {resultTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.shortName}
                          </option>
                        ))}
                      </select>
                      <select value={event.scorerPlayerId} onChange={(changeEvent) => updateGoalEvent(index, { scorerPlayerId: changeEvent.target.value })}>
                        {teamPlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.fullName}
                          </option>
                        ))}
                      </select>
                      <select
                        value={event.assistPlayerId ?? ""}
                        disabled={event.eventType !== "goal"}
                        onChange={(changeEvent) => updateGoalEvent(index, { assistPlayerId: changeEvent.target.value || null })}
                      >
                        <option value="">Без паса</option>
                        {teamPlayers
                          .filter((player) => player.id !== event.scorerPlayerId)
                          .map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.fullName}
                            </option>
                          ))}
                      </select>
                      <button type="button" className="iconless-danger" onClick={() => setGoalEvents((current) => current.filter((_, eventIndex) => eventIndex !== index))}>
                        Удалить
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="ghost bordered" onClick={addGoalEvent}>
                Добавить гол
              </button>
            </>
          ) : null}
          <button className="primary" type="submit">
            {selectedResultMatch?.status === "published" ? "Обновить результат" : "Опубликовать результат"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
