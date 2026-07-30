"use client";

import { BarChart3, CalendarDays, ChevronLeft, Plus, Shield, Trophy, UserRound, X } from "lucide-react";
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

type PublicGoalEvent = ResultGoalEvent & {
  id: string;
  matchId: string;
  sortOrder: number;
  scorerName: string;
  assistName: string | null;
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
  const [players, setPlayers] = useState<RemoteState<AdminPlayer[]>>(initialRemoteState);
  const [events, setEvents] = useState<RemoteState<PublicGoalEvent[]>>(initialRemoteState);
  const [standingsMode, setStandingsMode] = useState<"table" | "chessboard">("table");
  const [showPastMatches, setShowPastMatches] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedTeamIdForProfile, setSelectedTeamIdForProfile] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
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
      if ((tab === "calendar" || tab === "standings" || tab === "statistics") && !players.data && !players.loading) {
        await load(setPlayers, "/api/players", "players");
      }
      if ((tab === "calendar" || tab === "statistics") && !events.data && !events.loading) {
        await load(setEvents, "/api/events", "events");
      }
    },
    [
      apiFetch,
      bootstrap.data,
      chessboard.data,
      chessboard.loading,
      events.data,
      events.loading,
      matches.data,
      matches.loading,
      players.data,
      players.loading,
      standings.data,
      standings.loading,
      statistics.data,
      statistics.loading
    ]
  );

  useEffect(() => {
    if ((selectedMatchId || selectedTeamIdForProfile || selectedPlayerId) && bootstrap.data) {
      if (!matches.data && !matches.loading) {
        void loadTabData("calendar");
      }
      if (!players.data && !players.loading) {
        void apiFetch<Record<string, AdminPlayer[]>>("/api/players")
          .then((data) => setPlayers({ loading: false, data: data.players ?? [], error: null }))
          .catch((error) => setPlayers({ loading: false, data: null, error: error instanceof Error ? error.message : "Ошибка загрузки" }));
      }
      if (!events.data && !events.loading) {
        void apiFetch<Record<string, PublicGoalEvent[]>>("/api/events")
          .then((data) => setEvents({ loading: false, data: data.events ?? [], error: null }))
          .catch((error) => setEvents({ loading: false, data: null, error: error instanceof Error ? error.message : "Ошибка загрузки" }));
      }
    }
  }, [
    apiFetch,
    bootstrap.data,
    events.data,
    events.loading,
    loadTabData,
    matches.data,
    matches.loading,
    players.data,
    players.loading,
    selectedMatchId,
    selectedPlayerId,
    selectedTeamIdForProfile
  ]);

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
  const selectedMatch = selectedMatchId ? matches.data?.find((match) => match.id === selectedMatchId) ?? null : null;
  const selectedTeam = selectedTeamIdForProfile ? bootstrap.data.teams.find((team) => team.id === selectedTeamIdForProfile) ?? null : null;
  const selectedPlayer =
    selectedPlayerId && players.data ? players.data.find((player) => player.id === selectedPlayerId) ?? null : null;
  const closeDetail = () => {
    setSelectedMatchId(null);
    setSelectedTeamIdForProfile(null);
    setSelectedPlayerId(null);
  };
  const openMatch = (matchId: string) => {
    setSelectedTeamIdForProfile(null);
    setSelectedPlayerId(null);
    setSelectedMatchId(matchId);
  };
  const openTeam = (teamId: string) => {
    setSelectedMatchId(null);
    setSelectedPlayerId(null);
    setSelectedTeamIdForProfile(teamId);
  };
  const openPlayer = (playerId: string) => {
    setSelectedMatchId(null);
    setSelectedTeamIdForProfile(null);
    setSelectedPlayerId(playerId);
  };

  if (!needsOnboarding && (selectedMatch || selectedTeam || selectedPlayer)) {
    return (
      <main className="app-shell">
        <DetailHeader onBack={closeDetail} />
        {selectedMatch ? (
          <MatchDetailScreen
            match={selectedMatch}
            teams={bootstrap.data.teams}
            events={events.data ?? []}
            players={players.data ?? []}
            onTeamOpen={openTeam}
            onPlayerOpen={openPlayer}
          />
        ) : null}
        {selectedTeam ? (
          <TeamProfileScreen
            team={selectedTeam}
            matches={matches.data ?? []}
            players={players.data ?? []}
            statistics={statistics.data ?? []}
            events={events.data ?? []}
            onMatchOpen={openMatch}
            onPlayerOpen={openPlayer}
          />
        ) : null}
        {selectedPlayer ? (
          <PlayerProfileScreen
            player={selectedPlayer}
            teams={bootstrap.data.teams}
            matches={matches.data ?? []}
            statistics={statistics.data ?? []}
            events={events.data ?? []}
            onMatchOpen={openMatch}
            onTeamOpen={openTeam}
          />
        ) : null}
      </main>
    );
  }

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
            {activeTab === "calendar" ? (
              <CalendarView
                state={matches}
                favoriteTeamId={bootstrap.data.user.favoriteTeamId}
                showPastMatches={showPastMatches}
                onShowPastMatchesChange={setShowPastMatches}
                onMatchOpen={openMatch}
                onTeamOpen={openTeam}
              />
            ) : null}
            {activeTab === "standings" ? (
              <StandingsView
                state={standings}
                chessboardState={chessboard}
                favoriteTeamId={bootstrap.data.user.favoriteTeamId}
                mode={standingsMode}
                onModeChange={setStandingsMode}
                onTeamOpen={openTeam}
              />
            ) : null}
            {activeTab === "statistics" ? <StatisticsView state={statistics} onPlayerOpen={openPlayer} /> : null}
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

function CalendarView({
  state,
  favoriteTeamId,
  showPastMatches,
  onShowPastMatchesChange,
  onMatchOpen,
  onTeamOpen
}: {
  state: RemoteState<PublicMatch[]>;
  favoriteTeamId: string | null;
  showPastMatches: boolean;
  onShowPastMatchesChange: (value: boolean) => void;
  onMatchOpen: (matchId: string) => void;
  onTeamOpen: (teamId: string) => void;
}) {
  return (
    <StateBlock state={state} emptyText="Расписание пока не добавлено">
      {(matches) => (
        <div className="calendar-screen">
          <div className="calendar-head">
            <div>
              <span>Календарь турнира</span>
              <h1>Матчи</h1>
            </div>
            <label className="past-toggle">
              <input type="checkbox" checked={showPastMatches} onChange={(event) => onShowPastMatchesChange(event.target.checked)} />
              <span>Прошедшие</span>
            </label>
          </div>
          <MatchGroup
            title="Завершённые матчи"
            matches={showPastMatches ? matches.filter((match) => match.status === "published") : []}
            favoriteTeamId={favoriteTeamId}
            onMatchOpen={onMatchOpen}
            onTeamOpen={onTeamOpen}
          />
          <MatchGroup
            title="Ближайшие матчи"
            matches={matches.filter((match) => match.status !== "published")}
            favoriteTeamId={favoriteTeamId}
            onMatchOpen={onMatchOpen}
            onTeamOpen={onTeamOpen}
          />
        </div>
      )}
    </StateBlock>
  );
}

function MatchGroup({
  title,
  matches,
  favoriteTeamId,
  onMatchOpen,
  onTeamOpen
}: {
  title: string;
  matches: PublicMatch[];
  favoriteTeamId: string | null;
  onMatchOpen: (matchId: string) => void;
  onTeamOpen: (teamId: string) => void;
}) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <section className="match-group">
      <h2>{title}</h2>
      <div className="match-list">
        {matches.map((match) => {
          const favorite = match.homeTeamId === favoriteTeamId || match.awayTeamId === favoriteTeamId;
          return (
            <article key={match.id} className={favorite ? "match-card favorite" : "match-card"}>
              <button type="button" className="match-card-main" onClick={() => onMatchOpen(match.id)}>
                <span className="match-date">{formatMoscowDateTime(match.kickoffAt)}</span>
                <div className="score-row">
                  <TeamSide name={match.homeTeamShortName} logoUrl={match.homeLogoUrl} />
                  <strong>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</strong>
                  <TeamSide name={match.awayTeamShortName} logoUrl={match.awayLogoUrl} />
                </div>
                <footer>Тур {match.round} · {match.venue ?? "Стадион уточняется"}</footer>
              </button>
              <div className="match-team-actions">
                <button type="button" onClick={() => onTeamOpen(match.homeTeamId)}>{match.homeTeamShortName}</button>
                <button type="button" onClick={() => onTeamOpen(match.awayTeamId)}>{match.awayTeamShortName}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
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
  onModeChange,
  onTeamOpen
}: {
  state: RemoteState<StandingRow[]>;
  chessboardState: RemoteState<ChessboardPayload>;
  favoriteTeamId: string | null;
  mode: "table" | "chessboard";
  onModeChange: (mode: "table" | "chessboard") => void;
  onTeamOpen: (teamId: string) => void;
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
                        <button type="button" className="table-team" onClick={() => onTeamOpen(row.teamId)}>
                          <img src={row.logoUrl ?? "/fallback-team-logo.svg"} alt={row.teamName} />
                          <span>{row.shortName}</span>
                        </button>
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
        <ChessboardView state={chessboardState} favoriteTeamId={favoriteTeamId} onTeamOpen={onTeamOpen} />
      )}
    </section>
  );
}

function ChessboardView({
  state,
  favoriteTeamId,
  onTeamOpen
}: {
  state: RemoteState<ChessboardPayload>;
  favoriteTeamId: string | null;
  onTeamOpen: (teamId: string) => void;
}) {
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
                    <button type="button" onClick={() => onTeamOpen(team.teamId)}>
                      <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
                      <span>{team.shortName}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={row.teamId} className={row.teamId === favoriteTeamId ? "favorite-row" : ""}>
                  <td className="chess-team-sticky">
                    <button type="button" className="table-team" onClick={() => onTeamOpen(row.teamId)}>
                      <img src={row.logoUrl ?? "/fallback-team-logo.svg"} alt={row.name} />
                      <span>{row.shortName}</span>
                    </button>
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

function StatisticsView({ state, onPlayerOpen }: { state: RemoteState<PlayerStatistic[]>; onPlayerOpen: (playerId: string) => void }) {
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
              <button type="button" className="stat-card" key={`${row.playerId}-${tab}`} onClick={() => onPlayerOpen(row.playerId)}>
                <div>
                  <strong>{row.playerName}</strong>
                  <span>{row.teamName}</span>
                </div>
                <b>{tab === "goals" ? row.goals : tab === "assists" ? row.assists : tab === "points" ? row.goalPlusAssist : row.ownGoals}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </StateBlock>
  );
}

function DetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="detail-header">
      <button type="button" onClick={onBack} aria-label="Назад">
        <ChevronLeft size={22} />
      </button>
      <span>Назад</span>
    </header>
  );
}

function MatchDetailScreen({
  match,
  teams,
  events,
  onTeamOpen,
  onPlayerOpen
}: {
  match: PublicMatch;
  teams: Team[];
  events: PublicGoalEvent[];
  players: AdminPlayer[];
  onTeamOpen: (teamId: string) => void;
  onPlayerOpen: (playerId: string) => void;
}) {
  const matchEvents = events.filter((event) => event.matchId === match.id);
  const homeTeam = teams.find((team) => team.id === match.homeTeamId);
  const awayTeam = teams.find((team) => team.id === match.awayTeamId);

  return (
    <section className="detail-screen">
      <div className="match-hero-card">
        <span>{formatMoscowDateTime(match.kickoffAt)}</span>
        <div className="detail-score">
          <button type="button" onClick={() => onTeamOpen(match.homeTeamId)}>
            <img src={match.homeLogoUrl ?? "/fallback-team-logo.svg"} alt={match.homeTeamName} />
            <strong>{match.homeTeamShortName}</strong>
          </button>
          <b>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</b>
          <button type="button" onClick={() => onTeamOpen(match.awayTeamId)}>
            <img src={match.awayLogoUrl ?? "/fallback-team-logo.svg"} alt={match.awayTeamName} />
            <strong>{match.awayTeamShortName}</strong>
          </button>
        </div>
        <p>Тур {match.round} · {match.venue ?? "Стадион уточняется"}</p>
      </div>
      <section className="detail-card">
        <h2>События</h2>
        {matchEvents.length === 0 ? <p className="muted">Протокол пока не заполнен.</p> : null}
        {matchEvents.map((event) => {
          const team = event.teamId === homeTeam?.id ? homeTeam : awayTeam;
          return (
            <button type="button" className="event-line" key={event.id} onClick={() => onPlayerOpen(event.scorerPlayerId)}>
              <img src={team?.logoUrl ?? "/fallback-team-logo.svg"} alt={team?.name ?? "Команда"} />
              <span>
                <strong>{event.scorerName}</strong>
                {event.assistName ? <small>пас: {event.assistName}</small> : <small>{event.eventType === "penalty" ? "пенальти" : event.eventType === "own_goal" ? "автогол" : "без ассиста"}</small>}
              </span>
            </button>
          );
        })}
      </section>
    </section>
  );
}

function TeamProfileScreen({
  team,
  matches,
  players,
  statistics,
  events,
  onMatchOpen,
  onPlayerOpen
}: {
  team: Team;
  matches: PublicMatch[];
  players: AdminPlayer[];
  statistics: PlayerStatistic[];
  events: PublicGoalEvent[];
  onMatchOpen: (matchId: string) => void;
  onPlayerOpen: (playerId: string) => void;
}) {
  const teamMatches = matches.filter((match) => match.homeTeamId === team.id || match.awayTeamId === team.id);
  const roster = players.filter((player) => player.teamId === team.id);
  const goals = events.filter((event) => event.teamId === team.id && event.eventType !== "own_goal").length;
  const ownGoals = events.filter((event) => event.teamId === team.id && event.eventType === "own_goal").length;
  const against = teamMatches.reduce((sum, match) => {
    if (match.homeScore === null || match.awayScore === null) {
      return sum;
    }
    return sum + (match.homeTeamId === team.id ? match.awayScore : match.homeScore);
  }, 0);

  return (
    <section className="detail-screen">
      <div className="team-profile-hero">
        <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
        <div>
          <h1>{team.name}</h1>
          <span>{team.city ?? "Команда турнира"}</span>
        </div>
      </div>
      <div className="profile-metrics">
        <span><b>{teamMatches.length}</b>матчей</span>
        <span><b>{goals}</b>забито</span>
        <span><b>{against}</b>пропущено</span>
        <span><b>{ownGoals}</b>автоголов</span>
      </div>
      <section className="detail-card">
        <h2>Заявка</h2>
        <div className="roster-list">
          {roster.map((player) => {
            const stat = statistics.find((item) => item.playerId === player.id);
            return (
              <button type="button" key={player.id} onClick={() => onPlayerOpen(player.id)}>
                <span>{player.fullName}</span>
                <small>{stat?.goals ?? 0} гол · {stat?.assists ?? 0} пас</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="detail-card">
        <h2>Матчи</h2>
        <DetailMatchList matches={teamMatches} onMatchOpen={onMatchOpen} />
      </section>
    </section>
  );
}

function PlayerProfileScreen({
  player,
  teams,
  matches,
  statistics,
  events,
  onMatchOpen,
  onTeamOpen
}: {
  player: AdminPlayer;
  teams: Team[];
  matches: PublicMatch[];
  statistics: PlayerStatistic[];
  events: PublicGoalEvent[];
  onMatchOpen: (matchId: string) => void;
  onTeamOpen: (teamId: string) => void;
}) {
  const team = teams.find((item) => item.id === player.teamId);
  const stat = statistics.find((item) => item.playerId === player.id);
  const scoredEvents = events.filter((event) => event.scorerPlayerId === player.id && event.eventType !== "own_goal");
  const scoredMatchIds = new Set(scoredEvents.map((event) => event.matchId));
  const scoredMatches = matches.filter((match) => scoredMatchIds.has(match.id));

  return (
    <section className="detail-screen">
      <div className="team-profile-hero">
        <img src={team?.logoUrl ?? "/fallback-team-logo.svg"} alt={team?.name ?? "Команда"} />
        <div>
          <h1>{player.fullName}</h1>
          <button type="button" className="link-button" onClick={() => team && onTeamOpen(team.id)}>{team?.name ?? "Команда"}</button>
        </div>
      </div>
      <div className="profile-metrics">
        <span><b>{stat?.goals ?? 0}</b>голов</span>
        <span><b>{stat?.assists ?? 0}</b>ассистов</span>
        <span><b>{stat?.goalPlusAssist ?? 0}</b>гол+пас</span>
        <span><b>{stat?.ownGoals ?? 0}</b>автоголов</span>
      </div>
      <section className="detail-card">
        <h2>Матчи с голами</h2>
        <DetailMatchList matches={scoredMatches} onMatchOpen={onMatchOpen} />
      </section>
    </section>
  );
}

function DetailMatchList({ matches, onMatchOpen }: { matches: PublicMatch[]; onMatchOpen: (matchId: string) => void }) {
  if (matches.length === 0) {
    return <p className="muted">Матчей пока нет.</p>;
  }

  return (
    <div className="detail-match-list">
      {matches.map((match) => (
        <button type="button" key={match.id} onClick={() => onMatchOpen(match.id)}>
          <span>{formatMoscowDateTime(match.kickoffAt)}</span>
          <strong>{match.homeTeamShortName} {match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`} {match.awayTeamShortName}</strong>
        </button>
      ))}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal-sheet">
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
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
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [editingResultMatchId, setEditingResultMatchId] = useState<string | null>(null);

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
    try {
      await apiFetch("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify({ name: teamName, shortName: teamShortName, city: null })
      });
      setTeamName("");
      setTeamShortName("");
      onMessage("Команда добавлена");
      props.onDataChanged();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Не удалось добавить команду");
    }
  }

  async function createPlayer() {
    if (!playerTeamId || !playerName.trim()) {
      onMessage("Выберите команду и введите имя игрока");
      return;
    }

    try {
      await apiFetch("/api/admin/players", {
        method: "POST",
        body: JSON.stringify({ teamId: playerTeamId, fullName: playerName })
      });
      setPlayerName("");
      setIsPlayerModalOpen(false);
      onMessage("Игрок сохранён");
      await loadAdminData();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Не удалось добавить игрока");
    }
  }

  async function openResultEditor(matchId: string) {
    setResultMatchId(matchId);
    setEditingResultMatchId(matchId);
    setResultType("normal");
    setGoalEvents([]);
    try {
      const data = await apiFetch<{ events: PublicGoalEvent[] }>("/api/events");
      setGoalEvents(
        data.events
          .filter((event) => event.matchId === matchId)
          .map((event) => ({
            teamId: event.teamId,
            scorerPlayerId: event.scorerPlayerId,
            assistPlayerId: event.assistPlayerId,
            eventType: event.eventType
          }))
      );
    } catch {
      setGoalEvents([]);
    }
  }

  async function createMatch() {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      onMessage("Выберите две разные команды");
      return;
    }

    try {
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
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Не удалось добавить матч");
    }
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

    try {
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
      setEditingResultMatchId(null);
      onMessage(selectedResultMatch.status === "published" ? "Результат обновлён" : "Результат опубликован");
      props.onDataChanged();
      await loadAdminData();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Не удалось отправить результат");
    }
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
        <section className="admin-action-card">
          <h2>Заявка</h2>
          <p>Добавляйте игроков в заявку команды одним действием.</p>
          <button className="primary" type="button" onClick={() => setIsPlayerModalOpen(true)}>
            <Plus size={18} />
            Добавить игрока
          </button>
          <div className="compact-list">
            {players
              .filter((player) => playerTeams.some((team) => team.id === player.teamId))
              .slice(0, 8)
              .map((player) => (
                <span key={player.id} className={player.isActive ? "" : "inactive"}>
                  {player.fullName}
                </span>
              ))}
          </div>
        </section>
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
        <section className="admin-action-card">
          <h2>Результат</h2>
          {adminLoading ? <div className="notice">Загрузка матчей и заявок...</div> : null}
          <div className="admin-match-list">
            {adminMatches.map((match) => (
              <article key={match.id}>
                <div>
                  <span>Тур {match.round}</span>
                  <strong>{match.homeTeamShortName} {match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`} {match.awayTeamShortName}</strong>
                </div>
                <button type="button" onClick={() => void openResultEditor(match.id)}>
                  Редактировать результат
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {isPlayerModalOpen ? (
        <Modal title="Добавить игрока" onClose={() => setIsPlayerModalOpen(false)}>
          <form
            className="native-admin-card"
            onSubmit={(event) => {
              event.preventDefault();
              void createPlayer();
            }}
          >
            <div className="team-picker">
              {playerTeams.map((team) => (
                <button key={team.id} type="button" className={playerTeamId === team.id ? "active" : ""} onClick={() => setPlayerTeamId(team.id)}>
                  <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
                  <span>{team.shortName}</span>
                </button>
              ))}
            </div>
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Фамилия и имя" />
            <div className="modal-actions">
              <button className="ghost bordered" type="button" onClick={() => setIsPlayerModalOpen(false)}>
                Отмена
              </button>
              <button className="primary" type="submit">
                Добавить
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {editingResultMatchId && selectedResultMatch ? (
        <Modal title="Результат матча" onClose={() => setEditingResultMatchId(null)}>
          <form
            className="result-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitResult();
            }}
          >
            <div className="modal-match-title">
              <span>Тур {selectedResultMatch.round}</span>
              <strong>{selectedResultMatch.homeTeamShortName} {selectedResultMatch.homeScore === null ? "- : -" : `${selectedResultMatch.homeScore}:${selectedResultMatch.awayScore}`} {selectedResultMatch.awayTeamShortName}</strong>
            </div>
          <select value={resultType} onChange={(event) => setResultType(event.target.value as typeof resultType)}>
            <option value="normal">Обычный результат</option>
            <option value="technical_home">ТП хозяевам 3:0</option>
            <option value="technical_away">ТП гостям 0:3</option>
            <option value="technical_both">Обоюдное ТП 0:0</option>
          </select>
          {resultType === "normal" ? (
            <>
              <div className="result-team-actions">
                {resultTeams.map((team) => (
                  <section key={team.id}>
                    <div>
                      <img src={team.logoUrl ?? "/fallback-team-logo.svg"} alt={team.name} />
                      <strong>{team.shortName}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const scorerPlayerId = firstPlayerId(team.id);
                        if (!scorerPlayerId) {
                          onMessage("Для выбранной команды нет игроков в заявке");
                          return;
                        }
                        setGoalEvents((current) => [...current, { teamId: team.id, scorerPlayerId, assistPlayerId: null, eventType: "goal" }]);
                      }}
                    >
                      <Plus size={18} />
                    </button>
                  </section>
                ))}
              </div>
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
            </>
          ) : null}
          <button className="primary" type="submit">
            Отправить результат
          </button>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
