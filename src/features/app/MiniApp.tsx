"use client";

import { BarChart3, CalendarDays, ChevronLeft, Plus, Shield, Trophy, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav, type TabKey } from "@/components/navigation/BottomNav";
import { Splash } from "@/components/splash/Splash";
import { TOURNAMENT_ACCENT_COLOR, TOURNAMENT_LOGO_URL } from "@/lib/branding";
import { formatMatchDateParts, formatShortDate } from "@/lib/date-time/format";
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

type AdminOperationStatus = {
  state: "loading" | "success" | "error";
  title: string;
  message: string;
} | null;

type PublicGoalEvent = ResultGoalEvent & {
  id: string;
  matchId: string;
  sortOrder: number;
  scorerName: string;
  assistName: string | null;
  minute?: number | null;
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

function toDateTimeLocalInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function TeamLogo({ logoUrl, name, className = "" }: { logoUrl: string | null; name: string; className?: string }) {
  if (logoUrl) {
    return <img className={`team-logo ${className}`} src={logoUrl} alt={name} />;
  }

  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`team-logo team-initial ${className}`} aria-label={name}>
      {letter}
    </span>
  );
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
      let response: Response;
      try {
        response = await fetch(path, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": initData,
            ...init?.headers
          }
        });
      } catch {
        throw new Error("Не удалось подключиться к серверу. Проверьте деплой Vercel и интернет-соединение в Telegram.");
      }
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
      const [data] = await Promise.all([
        apiFetch<BootstrapResponse>("/api/bootstrap", { method: "POST" }),
        new Promise((resolve) => window.setTimeout(resolve, 1300))
      ]);
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
      if (!statistics.data && !statistics.loading) {
        setStatistics({ loading: true, data: null, error: null });
        void apiFetch<Record<string, PlayerStatistic[]>>("/api/statistics")
          .then((data) => setStatistics({ loading: false, data: data.statistics ?? [], error: null }))
          .catch((error) => setStatistics({ loading: false, data: null, error: error instanceof Error ? error.message : "Ошибка загрузки" }));
      }
      if (selectedTeamIdForProfile && !standings.data && !standings.loading) {
        setStandings({ loading: true, data: null, error: null });
        void apiFetch<Record<string, StandingRow[]>>("/api/standings")
          .then((data) => setStandings({ loading: false, data: data.standings ?? [], error: null }))
          .catch((error) => setStandings({ loading: false, data: null, error: error instanceof Error ? error.message : "Ошибка загрузки" }));
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
    selectedTeamIdForProfile,
    standings.data,
    standings.loading,
    statistics.data,
    statistics.loading
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
      const data = await apiFetch<{ user: AppUser }>("/api/me/favorite-team", {
        method: "PATCH",
        body: JSON.stringify({ teamId })
      });
      setSelectedTeamId(data.user.favoriteTeamId);
      setBootstrap((state) =>
        state.data
          ? {
              ...state,
              data: {
                ...state.data,
                user: data.user,
                favoriteTeam: state.data.teams.find((team) => team.id === data.user.favoriteTeamId) ?? null
              }
            }
          : state
      );
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
        onRetry={loadBootstrap}
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
        logoUrl={TOURNAMENT_LOGO_URL}
        primaryColor={TOURNAMENT_ACCENT_COLOR}
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
            standings={standings.data ?? []}
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
            {favoriteTeam ? <TeamLogo className="favorite-logo" logoUrl={favoriteTeam.logoUrl} name={favoriteTeam.name} /> : null}
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
                teams={bootstrap.data.teams}
                message={adminMessage}
                onMessage={setAdminMessage}
                apiFetch={apiFetch}
                onDataChanged={() => {
                  setMatches(initialRemoteState);
                  setStandings(initialRemoteState);
                  setChessboard(initialRemoteState);
                  setStatistics(initialRemoteState);
                  setEvents(initialRemoteState);
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
    return (
      <div className="state loading-state">
        <span className="mini-spinner" aria-label="Загрузка" />
      </div>
    );
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
            <TeamLogo logoUrl={team.logoUrl} name={team.name} />
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
          const dateParts = formatMatchDateParts(match.kickoffAt);
          return (
            <article key={match.id} className={favorite ? "match-card favorite" : "match-card"}>
              <div
                className="match-card-main"
                role="button"
                tabIndex={0}
                onClick={() => onMatchOpen(match.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onMatchOpen(match.id);
                  }
                }}
              >
                <span className="match-date">
                  <strong>{dateParts.date}</strong>
                  {dateParts.time ? <small>{dateParts.time}</small> : null}
                </span>
                <div className="score-row">
                  <TeamSide name={match.homeTeamShortName} logoUrl={match.homeLogoUrl} onClick={() => onTeamOpen(match.homeTeamId)} />
                  <strong>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</strong>
                  <TeamSide name={match.awayTeamShortName} logoUrl={match.awayLogoUrl} onClick={() => onTeamOpen(match.awayTeamId)} />
                </div>
                <footer>
                  <span>{match.status === "published" ? "Матч завершён" : "Матч ожидается"}</span>
                  <ResultMeta match={match} />
                </footer>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultMeta({ match }: { match: PublicMatch }) {
  const resultAuthor = match.updatedByName ?? match.publishedByName;
  const resultDate = formatShortDate(match.updatedAt ?? match.publishedAt);
  if (match.status !== "published" || !resultAuthor || !resultDate) {
    return null;
  }

  return <small className="result-meta">Результат заполнил: {resultAuthor} · {resultDate}</small>;
}

function formatGoalsWithPenalties(stat: PlayerStatistic | undefined) {
  const goals = stat?.goals ?? 0;
  const penalties = stat?.penalties ?? 0;
  return penalties > 0 ? `${goals} (${penalties})` : String(goals);
}

function TeamSide({ name, logoUrl, onClick }: { name: string; logoUrl: string | null; onClick: () => void }) {
  return (
    <button type="button" className="team-side" onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}>
      <TeamLogo logoUrl={logoUrl} name={name} />
      <span>{name}</span>
    </button>
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
                <colgroup>
                  <col className="col-rank" />
                  <col className="col-team" />
                  <col className="col-small" />
                  <col className="col-small" />
                  <col className="col-small" />
                  <col className="col-small" />
                  <col className="col-goals" />
                  <col className="col-small" />
                  <col className="col-small" />
                </colgroup>
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
                          <TeamLogo logoUrl={row.logoUrl} name={row.teamName} />
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
                      <TeamLogo logoUrl={team.logoUrl} name={team.name} />
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
                      <TeamLogo logoUrl={row.logoUrl} name={row.name} />
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
        <section className="statistics-screen">
          <h1>Статистика</h1>
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
            {rows.map((row, index) => (
              <button type="button" className="stat-card" key={`${row.playerId}-${tab}`} onClick={() => onPlayerOpen(row.playerId)}>
                <span className="stat-rank">{index + 1}</span>
                <div>
                  <strong>{row.playerName}</strong>
                  <span>{row.teamName}</span>
                </div>
                <b>{tab === "goals" ? row.goals : tab === "assists" ? row.assists : tab === "points" ? row.goalPlusAssist : row.ownGoals}</b>
              </button>
            ))}
          </div>
        </section>
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
  const dateParts = formatMatchDateParts(match.kickoffAt);

  return (
    <section className="detail-screen">
        <div className="match-hero-card">
        <span className="detail-match-date">{dateParts.date}{dateParts.time ? ` · ${dateParts.time}` : ""}</span>
        <div className="detail-score">
          <button type="button" onClick={() => onTeamOpen(match.homeTeamId)}>
            <TeamLogo logoUrl={match.homeLogoUrl} name={match.homeTeamName} />
            <strong>{match.homeTeamShortName}</strong>
          </button>
          <b>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</b>
          <button type="button" onClick={() => onTeamOpen(match.awayTeamId)}>
            <TeamLogo logoUrl={match.awayLogoUrl} name={match.awayTeamName} />
            <strong>{match.awayTeamShortName}</strong>
          </button>
        </div>
        <p>{match.status === "published" ? "Матч завершён" : "Матч ожидается"}</p>
        <ResultMeta match={match} />
      </div>
      <section className="detail-card">
        <h2>События</h2>
        {matchEvents.length === 0 ? <p className="muted">Протокол пока не заполнен.</p> : null}
        {matchEvents.map((event) => {
          const team = event.teamId === homeTeam?.id ? homeTeam : awayTeam;
          return (
            <button type="button" className="event-line" key={event.id} onClick={() => onPlayerOpen(event.scorerPlayerId)}>
              <TeamLogo logoUrl={team?.logoUrl ?? null} name={team?.name ?? "Команда"} />
              <span>
                <strong>{event.scorerName}</strong>
                {event.assistName ? <small>{event.assistName}</small> : <small>{event.eventType === "penalty" ? "пенальти" : event.eventType === "own_goal" ? "автогол" : "без ассиста"}</small>}
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
  standings,
  events,
  onMatchOpen,
  onPlayerOpen
}: {
  team: Team;
  matches: PublicMatch[];
  players: AdminPlayer[];
  statistics: PlayerStatistic[];
  standings: StandingRow[];
  events: PublicGoalEvent[];
  onMatchOpen: (matchId: string) => void;
  onPlayerOpen: (playerId: string) => void;
}) {
  const teamMatches = matches.filter((match) => match.homeTeamId === team.id || match.awayTeamId === team.id);
  const finishedMatches = teamMatches.filter((match) => match.status === "published");
  const upcomingMatches = teamMatches.filter((match) => match.status !== "published");
  const roster = players.filter((player) => player.teamId === team.id).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  const standing = standings.find((row) => row.teamId === team.id);
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
        <TeamLogo logoUrl={team.logoUrl} name={team.name} />
        <div>
          <h1>{team.name}</h1>
          <span>{team.city ?? "Команда турнира"}</span>
          {standing ? <strong className="team-place-badge">{standing.place} место</strong> : null}
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
        <div className="roster-table" role="table" aria-label="Заявка команды">
          <div className="roster-table-head" role="row">
            <span>Игрок</span>
            <span>Г</span>
            <span>П</span>
          </div>
          {roster.map((player) => {
            const stat = statistics.find((item) => item.playerId === player.id);
            return (
              <button type="button" key={player.id} className="roster-table-row" onClick={() => onPlayerOpen(player.id)}>
                <span>{player.fullName}</span>
                <small>{formatGoalsWithPenalties(stat)}</small>
                <small>{stat?.assists ?? 0}</small>
              </button>
            );
          })}
        </div>
        <p className="roster-legend">Г — голы, П — голевые передачи</p>
      </section>
      <section className="detail-card">
        <h2>Завершённые матчи</h2>
        <DetailMatchList matches={finishedMatches} onMatchOpen={onMatchOpen} emptyText="Завершённых матчей пока нет." />
      </section>
      <section className="detail-card">
        <h2>Ближайшие матчи</h2>
        <DetailMatchList matches={upcomingMatches} onMatchOpen={onMatchOpen} emptyText="Ближайших матчей пока нет." />
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
        <TeamLogo logoUrl={team?.logoUrl ?? null} name={team?.name ?? "Команда"} />
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
        <PlayerGoalMatchList matches={scoredMatches} events={scoredEvents} onMatchOpen={onMatchOpen} />
      </section>
    </section>
  );
}

function PlayerGoalMatchList({
  matches,
  events,
  onMatchOpen
}: {
  matches: PublicMatch[];
  events: PublicGoalEvent[];
  onMatchOpen: (matchId: string) => void;
}) {
  if (matches.length === 0) {
    return <p className="muted">Матчей с голами пока нет.</p>;
  }

  return (
    <div className="player-goal-match-list">
      {matches.map((match) => {
        const matchEvents = events.filter((event) => event.matchId === match.id);
        const dateParts = formatMatchDateParts(match.kickoffAt);
        const minutes = matchEvents
          .map((event) => event.minute)
          .filter((minute): minute is number => typeof minute === "number")
          .map((minute) => `${minute}'`);

        return (
          <button type="button" key={match.id} className="player-goal-match-card" onClick={() => onMatchOpen(match.id)}>
            <span className="player-goal-date">{dateParts.date}{dateParts.time ? ` · ${dateParts.time}` : ""}</span>
            <div className="player-goal-score">
              <div>
                <TeamLogo logoUrl={match.homeLogoUrl} name={match.homeTeamName} />
                <span>{match.homeTeamShortName}</span>
              </div>
              <strong>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</strong>
              <div>
                <TeamLogo logoUrl={match.awayLogoUrl} name={match.awayTeamName} />
                <span>{match.awayTeamShortName}</span>
              </div>
            </div>
            <small>Голы: {matchEvents.length}{minutes.length > 0 ? ` · ${minutes.join(", ")}` : ""}</small>
          </button>
        );
      })}
    </div>
  );
}

function MatchSummaryCard({ match, onMatchOpen }: { match: PublicMatch; onMatchOpen: (matchId: string) => void }) {
  const dateParts = formatMatchDateParts(match.kickoffAt);
  return (
    <button type="button" className="profile-match-card" onClick={() => onMatchOpen(match.id)}>
      <span className="profile-match-date">{dateParts.date}{dateParts.time ? ` · ${dateParts.time}` : ""}</span>
      <div className="profile-match-score">
        <div>
          <TeamLogo logoUrl={match.homeLogoUrl} name={match.homeTeamName} />
          <span>{match.homeTeamShortName}</span>
        </div>
        <strong>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</strong>
        <div>
          <TeamLogo logoUrl={match.awayLogoUrl} name={match.awayTeamName} />
          <span>{match.awayTeamShortName}</span>
        </div>
      </div>
    </button>
  );
}

function DetailMatchList({
  matches,
  onMatchOpen,
  emptyText = "Матчей пока нет."
}: {
  matches: PublicMatch[];
  onMatchOpen: (matchId: string) => void;
  emptyText?: string;
}) {
  if (matches.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }

  return (
    <div className="detail-match-list">
      {matches.map((match) => <MatchSummaryCard key={match.id} match={match} onMatchOpen={onMatchOpen} />)}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  className = ""
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className={`modal-sheet ${className}`}>
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
  onSave: () => Promise<void> | void;
}) {
  const [isFavoritePickerOpen, setIsFavoritePickerOpen] = useState(false);
  const currentTeam = props.teams.find((team) => team.id === props.selectedTeamId) ?? null;

  return (
    <section className="profile">
      <img src={TOURNAMENT_LOGO_URL} alt="Логотип турнира" />
      <h2>
        {props.user.firstName} {props.user.lastName}
      </h2>
      <button className="favorite-team-card" type="button" onClick={() => setIsFavoritePickerOpen(true)}>
        <span>Любимая команда</span>
        <div>
          <TeamLogo logoUrl={currentTeam?.logoUrl ?? null} name={currentTeam?.name ?? "Команда"} />
          <strong>{currentTeam?.name ?? "Не выбрана"}</strong>
        </div>
      </button>
      {isFavoritePickerOpen ? (
        <Modal title="Любимая команда" className="favorite-picker-modal" onClose={() => setIsFavoritePickerOpen(false)}>
          <div className="team-picker team-picker-grid favorite-picker-list">
            {props.teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={props.selectedTeamId === team.id ? "active" : ""}
                onClick={() => props.onSelect(team.id)}
              >
                <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                <span>{team.shortName}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="ghost bordered" type="button" onClick={() => setIsFavoritePickerOpen(false)}>
              Отмена
            </button>
            <button
              className="primary"
              disabled={props.saving}
              type="button"
              onClick={async () => {
                await props.onSave();
                setIsFavoritePickerOpen(false);
              }}
            >
              Сохранить
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function AdminView(props: {
  permissions: Record<string, boolean>;
  teams: Team[];
  message: string | null;
  onMessage: (message: string | null) => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onDataChanged: () => void;
}) {
  const { apiFetch, onMessage, permissions, teams } = props;
  const [teamName, setTeamName] = useState("");
  const [teamShortName, setTeamShortName] = useState("");
  const [playerLastName, setPlayerLastName] = useState("");
  const [playerFirstName, setPlayerFirstName] = useState("");
  const [playerTeamId, setPlayerTeamId] = useState(props.teams[0]?.id ?? "");
  const [kickoffAt, setKickoffAt] = useState("");
  const [homeTeamId, setHomeTeamId] = useState(props.teams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(props.teams[1]?.id ?? "");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [adminMatches, setAdminMatches] = useState<PublicMatch[]>([]);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [resultMatchId, setResultMatchId] = useState("");
  const [resultType, setResultType] = useState<"normal" | "technical_home" | "technical_away" | "technical_both">("normal");
  const [goalEvents, setGoalEvents] = useState<ResultGoalEvent[]>([]);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isPlayerTeamPickerOpen, setIsPlayerTeamPickerOpen] = useState(false);
  const [isGoalTeamPickerOpen, setIsGoalTeamPickerOpen] = useState(false);
  const [editingResultMatchId, setEditingResultMatchId] = useState<string | null>(null);
  const [eventTeamId, setEventTeamId] = useState<string>("");
  const [eventType, setEventType] = useState<ResultGoalEvent["eventType"]>("goal");
  const [eventScorerId, setEventScorerId] = useState("");
  const [eventAssistId, setEventAssistId] = useState<string>("");
  const [operationStatus, setOperationStatus] = useState<AdminOperationStatus>(null);

  const canManageSchedule = Boolean(permissions.manage_schedule);
  const canPublishResult = Boolean(permissions.publish_result);
  const canReplaceResult = Boolean(permissions.replace_result);
  const canManageAnyPlayers = Boolean(permissions.manage_any_players);
  const playerTeams = useMemo(() => (canManageAnyPlayers ? teams : []), [canManageAnyPlayers, teams]);
  const selectedResultMatch = adminMatches.find((match) => match.id === resultMatchId) ?? null;
  const resultTeams = selectedResultMatch
    ? teams.filter((team) => team.id === selectedResultMatch.homeTeamId || team.id === selectedResultMatch.awayTeamId)
    : [];
  const selectedPlayerTeam = playerTeams.find((team) => team.id === playerTeamId) ?? null;
  const selectedTeamPlayers = selectedPlayerTeam ? playersForTeam(selectedPlayerTeam.id).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")) : [];
  const selectedEventTeam = resultTeams.find((team) => team.id === eventTeamId) ?? null;

  const loadAdminData = useCallback(async () => {
    setAdminLoading(true);
    try {
      const requests: Promise<unknown>[] = [];
      if (canManageSchedule || canPublishResult || canReplaceResult) {
        requests.push(apiFetch<{ matches: PublicMatch[] }>("/api/matches"));
      } else {
        requests.push(Promise.resolve({ matches: [] }));
      }

      if (canManageAnyPlayers || canPublishResult || canReplaceResult) {
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
    if (!teamName.trim() || !teamShortName.trim()) {
      setOperationStatus({
        state: "error",
        title: "Команда не сохранена",
        message: "Заполните полное и короткое название команды."
      });
      return;
    }

    setOperationStatus({
      state: "loading",
      title: "Добавляем команду",
      message: "Отправляем данные на сервер..."
    });

    try {
      await apiFetch("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify({ name: teamName, shortName: teamShortName, city: null })
      });
      setTeamName("");
      setTeamShortName("");
      props.onDataChanged();
      setOperationStatus({
        state: "success",
        title: "Команда добавлена",
        message: "Данные успешно сохранены."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось добавить команду";
      setOperationStatus({
        state: "error",
        title: "Команда не добавлена",
        message
      });
    }
  }

  async function createPlayer() {
    const fullName = [playerLastName.trim(), playerFirstName.trim()].filter(Boolean).join(" ");
    if (!playerTeamId || !playerLastName.trim() || !playerFirstName.trim()) {
      setOperationStatus({
        state: "error",
        title: "Игрок не добавлен",
        message: "Выберите команду, введите фамилию и имя игрока."
      });
      return;
    }

    setOperationStatus({
      state: "loading",
      title: "Добавляем игрока",
      message: "Отправляем данные на сервер..."
    });

    try {
      await apiFetch("/api/admin/players", {
        method: "POST",
        body: JSON.stringify({ teamId: playerTeamId, fullName })
      });
      setPlayerLastName("");
      setPlayerFirstName("");
      setIsPlayerModalOpen(false);
      setIsPlayerTeamPickerOpen(false);
      await loadAdminData();
      setOperationStatus({
        state: "success",
        title: "Игрок добавлен",
        message: "Данные успешно сохранены."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось добавить игрока";
      setOperationStatus({
        state: "error",
        title: "Игрок не добавлен",
        message
      });
    }
  }

  async function openResultEditor(matchId: string) {
    const match = adminMatches.find((item) => item.id === matchId);
    setResultMatchId(matchId);
    setEditingResultMatchId(matchId);
    setResultType(match?.resultType ?? "normal");
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
      setOperationStatus({
        state: "error",
        title: "Матч не сохранён",
        message: "Выберите две разные команды."
      });
      return;
    }

    const action = editingMatchId ? "обновление матча" : "создание матча";
    setOperationStatus({
      state: "loading",
      title: editingMatchId ? "Сохраняем матч" : "Создаём матч",
      message: "Отправляем данные на сервер..."
    });

    try {
      await apiFetch("/api/admin/matches", {
        method: "POST",
        body: JSON.stringify({
          id: editingMatchId ?? undefined,
          round: 1,
          kickoffAt: kickoffAt ? new Date(kickoffAt).toISOString() : null,
          venue: null,
          homeTeamId,
          awayTeamId
        })
      });
      setIsMatchModalOpen(false);
      setEditingMatchId(null);
      props.onDataChanged();
      await loadAdminData();
      setOperationStatus({
        state: "success",
        title: editingMatchId ? "Матч сохранён" : "Матч создан",
        message: "Данные успешно сохранены."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось добавить матч";
      setOperationStatus({
        state: "error",
        title: `Не удалось выполнить ${action}`,
        message
      });
    }
  }

  function openMatchModal(match?: PublicMatch) {
    setEditingMatchId(match?.id ?? null);
    setKickoffAt(toDateTimeLocalInput(match?.kickoffAt ?? null));
    setHomeTeamId(match?.homeTeamId ?? props.teams[0]?.id ?? "");
    setAwayTeamId(match?.awayTeamId ?? props.teams[1]?.id ?? "");
    setIsMatchModalOpen(true);
  }

  function openGoalEventModal(teamId: string) {
    const scorerPlayerId = firstPlayerId(teamId);
    if (!scorerPlayerId) {
      setOperationStatus({
        state: "error",
        title: "Событие не добавлено",
        message: "Для выбранной команды нет игроков в заявке."
      });
      return;
    }
    setEventTeamId(teamId);
    setEventType("goal");
    setEventScorerId(scorerPlayerId);
    setEventAssistId("");
    setIsGoalTeamPickerOpen(false);
  }

  function addPreparedGoalEvent() {
    if (!eventTeamId || !eventScorerId) {
      setOperationStatus({
        state: "error",
        title: "Событие не добавлено",
        message: "Выберите игрока."
      });
      return;
    }
    setGoalEvents((current) => [
      ...current,
      {
        teamId: eventTeamId,
        scorerPlayerId: eventScorerId,
        assistPlayerId: eventType === "goal" ? eventAssistId || null : null,
        eventType
      }
    ]);
    setEventTeamId("");
    setIsGoalTeamPickerOpen(false);
  }

  function previewScore() {
    if (!selectedResultMatch || resultType !== "normal") {
      if (resultType === "technical_home") return "3:0";
      if (resultType === "technical_away") return "0:3";
      if (resultType === "technical_both") return "0:0";
      return "- : -";
    }

    let home = 0;
    let away = 0;
    for (const event of goalEvents) {
      if (event.eventType === "own_goal") {
        if (event.teamId === selectedResultMatch.homeTeamId) away += 1;
        if (event.teamId === selectedResultMatch.awayTeamId) home += 1;
      } else {
        if (event.teamId === selectedResultMatch.homeTeamId) home += 1;
        if (event.teamId === selectedResultMatch.awayTeamId) away += 1;
      }
    }
    return `${home}:${away}`;
  }

  async function submitResult() {
    if (!selectedResultMatch) {
      setOperationStatus({
        state: "error",
        title: "Результат не сохранён",
        message: "Выберите матч."
      });
      return;
    }
    if (selectedResultMatch.status === "published" && !props.permissions.replace_result) {
      setOperationStatus({
        state: "error",
        title: "Результат не сохранён",
        message: "Нет прав на изменение опубликованного результата."
      });
      return;
    }

    try {
      setOperationStatus({
        state: "loading",
        title: selectedResultMatch.status === "published" ? "Сохраняем результат" : "Отправляем результат",
        message: "Обновляем протокол матча..."
      });
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
      props.onDataChanged();
      await loadAdminData();
      setOperationStatus({
        state: "success",
        title: selectedResultMatch.status === "published" ? "Результат сохранён" : "Результат отправлен",
        message: "Данные успешно сохранены."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить результат";
      setOperationStatus({
        state: "error",
        title: "Не удалось сохранить результат",
        message
      });
    }
  }

  return (
    <section className="admin">
      {!canManageSchedule && !canPublishResult && !canReplaceResult && !canManageAnyPlayers && !props.permissions.manage_teams ? (
        <div className="notice">Для вашей роли пока нет доступных действий в админке.</div>
      ) : null}
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
      {props.permissions.manage_any_players ? (
        <section className="admin-action-card">
          <h2>Заявка</h2>
          <button className="primary" type="button" onClick={() => setIsPlayerModalOpen(true)}>
            <Plus size={18} />
            Добавить игрока
          </button>
        </section>
      ) : null}
      {props.permissions.manage_schedule ? (
        <section className="admin-action-card">
          <h2>Матч</h2>
          <p>Выберите дату и две команды в отдельном окне.</p>
          <button className="primary" type="button" onClick={() => openMatchModal()}>
            <Plus size={18} />
            Создать матч
          </button>
        </section>
      ) : null}
      {props.permissions.publish_result || props.permissions.replace_result ? (
        <section className="admin-action-card">
          <h2>Результат</h2>
          {adminLoading ? <div className="notice">Загрузка матчей и заявок...</div> : null}
          {!adminLoading && adminMatches.length === 0 ? <div className="notice">Матчи пока не созданы.</div> : null}
          <div className="admin-match-list">
            {adminMatches.map((match) => (
              <article key={match.id} className="admin-result-card">
                <div className="admin-result-score">
                  <div>
                    <TeamLogo logoUrl={match.homeLogoUrl} name={match.homeTeamName} />
                    <span>{match.homeTeamShortName}</span>
                  </div>
                  <strong>{match.homeScore === null ? "- : -" : `${match.homeScore}:${match.awayScore}`}</strong>
                  <div>
                    <TeamLogo logoUrl={match.awayLogoUrl} name={match.awayTeamName} />
                    <span>{match.awayTeamShortName}</span>
                  </div>
                </div>
                <small>{formatMatchDateParts(match.kickoffAt).date}</small>
                <button type="button" onClick={() => void openResultEditor(match.id)}>
                  Редактировать результат
                </button>
                {canManageSchedule ? (
                  <button type="button" className="ghost bordered" onClick={() => openMatchModal(match)}>
                    Редактировать матч
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {isPlayerModalOpen ? (
        <Modal
          title="Добавить игрока"
          onClose={() => {
            setIsPlayerModalOpen(false);
            setIsPlayerTeamPickerOpen(false);
          }}
        >
          <form
            className="native-admin-card"
            onSubmit={(event) => {
              event.preventDefault();
              void createPlayer();
            }}
          >
            <button className="selected-team-control" type="button" onClick={() => setIsPlayerTeamPickerOpen((value) => !value)}>
              <TeamLogo logoUrl={selectedPlayerTeam?.logoUrl ?? null} name={selectedPlayerTeam?.name ?? "Команда"} />
              <span>
                <small>Выбрать команду</small>
                <strong>{selectedPlayerTeam?.shortName ?? "Не выбрана"}</strong>
              </span>
            </button>
            {isPlayerTeamPickerOpen ? (
              <div className="team-picker team-picker-grid">
                {playerTeams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    className={playerTeamId === team.id ? "active" : ""}
                    onClick={() => {
                      setPlayerTeamId(team.id);
                      setIsPlayerTeamPickerOpen(false);
                    }}
                  >
                    <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                    <span>{team.shortName}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="modal-roster-preview">
              <strong>{selectedPlayerTeam ? `Игроки команды ${selectedPlayerTeam.shortName}` : "Игроки команды"}</strong>
              {selectedTeamPlayers.length > 0 ? (
                <div>
                  {selectedTeamPlayers.map((player) => (
                    <span key={player.id}>{player.fullName}</span>
                  ))}
                </div>
              ) : (
                <small>В заявке пока нет игроков.</small>
              )}
            </div>
            <div className="admin-grid-two">
              <input value={playerLastName} onChange={(event) => setPlayerLastName(event.target.value)} placeholder="Фамилия" />
              <input value={playerFirstName} onChange={(event) => setPlayerFirstName(event.target.value)} placeholder="Имя" />
            </div>
            <div className="modal-actions">
              <button
                className="ghost bordered"
                type="button"
                onClick={() => {
                  setIsPlayerModalOpen(false);
                  setIsPlayerTeamPickerOpen(false);
                }}
              >
                Отмена
              </button>
              <button className="primary" type="submit">
                Добавить
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {isMatchModalOpen ? (
        <Modal
          title={editingMatchId ? "Редактировать матч" : "Создать матч"}
          onClose={() => {
            setIsMatchModalOpen(false);
            setEditingMatchId(null);
          }}
        >
          <form
            className="native-admin-card"
            onSubmit={(event) => {
              event.preventDefault();
              void createMatch();
            }}
          >
            <label>
              Дата и время
              <input value={kickoffAt} onChange={(event) => setKickoffAt(event.target.value)} type="datetime-local" />
            </label>
            <div className="match-team-panels">
              <section>
                <h3>Хозяева</h3>
                <div className="team-picker team-picker-grid compact-team-grid">
                  {props.teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      className={homeTeamId === team.id ? "active" : ""}
                      disabled={awayTeamId === team.id}
                      onClick={() => setHomeTeamId(team.id)}
                    >
                      <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                      <span>{team.shortName}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3>Гости</h3>
                <div className="team-picker team-picker-grid compact-team-grid">
                  {props.teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      className={awayTeamId === team.id ? "active" : ""}
                      disabled={homeTeamId === team.id}
                      onClick={() => setAwayTeamId(team.id)}
                    >
                      <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                      <span>{team.shortName}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <div className="modal-actions">
              <button
                className="ghost bordered"
                type="button"
                onClick={() => {
                  setIsMatchModalOpen(false);
                  setEditingMatchId(null);
                }}
              >
                Отмена
              </button>
              <button className="primary" type="submit">
                {editingMatchId ? "Сохранить" : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {editingResultMatchId && selectedResultMatch ? (
        <Modal title="Результат матча" className="result-modal" onClose={() => setEditingResultMatchId(null)}>
          <form
            className="result-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitResult();
            }}
          >
            <div className="modal-match-title">
              <span>{formatMatchDateParts(selectedResultMatch.kickoffAt).date}</span>
              <div className="admin-result-score modal-score">
                <div>
                  <TeamLogo logoUrl={selectedResultMatch.homeLogoUrl} name={selectedResultMatch.homeTeamName} />
                  <span>{selectedResultMatch.homeTeamShortName}</span>
                </div>
                <strong>{previewScore()}</strong>
                <div>
                  <TeamLogo logoUrl={selectedResultMatch.awayLogoUrl} name={selectedResultMatch.awayTeamName} />
                  <span>{selectedResultMatch.awayTeamShortName}</span>
                </div>
              </div>
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
                      <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                      <strong>{team.shortName}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => openGoalEventModal(team.id)}
                    >
                      <Plus size={18} />
                    </button>
                  </section>
                ))}
              </div>
              <div className="goal-events">
                {goalEvents.map((event, index) => {
                  const teamPlayers = playersForTeam(event.teamId);
                  const scorer = teamPlayers.find((player) => player.id === event.scorerPlayerId);
                  const assistant = teamPlayers.find((player) => player.id === event.assistPlayerId);
                  const team = resultTeams.find((item) => item.id === event.teamId);
                  return (
                    <div key={index} className="goal-event-preview">
                      <TeamLogo logoUrl={team?.logoUrl ?? null} name={team?.name ?? "Команда"} />
                      <div>
                        <strong>{event.eventType === "penalty" ? "Пенальти" : event.eventType === "own_goal" ? "Автогол" : "Гол"} · {scorer?.fullName ?? "Игрок"}</strong>
                        <span>{assistant ? assistant.fullName : "без ассиста"}</span>
                      </div>
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
      {eventTeamId ? (
        <Modal
          title="Добавить событие"
          onClose={() => {
            setEventTeamId("");
            setIsGoalTeamPickerOpen(false);
          }}
        >
          <form
            className="native-admin-card"
            onSubmit={(event) => {
              event.preventDefault();
              addPreparedGoalEvent();
            }}
          >
            <button className="selected-team-control" type="button" onClick={() => setIsGoalTeamPickerOpen((value) => !value)}>
              <TeamLogo logoUrl={selectedEventTeam?.logoUrl ?? null} name={selectedEventTeam?.name ?? "Команда"} />
              <span>
                <small>Команда события</small>
                <strong>{selectedEventTeam?.shortName ?? "Выбрать команду"}</strong>
              </span>
            </button>
            {isGoalTeamPickerOpen ? (
              <div className="team-picker team-picker-grid">
                {resultTeams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    className={eventTeamId === team.id ? "active" : ""}
                    onClick={() => {
                      const scorerPlayerId = firstPlayerId(team.id);
                      if (!scorerPlayerId) {
                        setOperationStatus({
                          state: "error",
                          title: "Команда не выбрана",
                          message: "Для выбранной команды нет игроков в заявке."
                        });
                        return;
                      }
                      setEventTeamId(team.id);
                      setEventScorerId(scorerPlayerId);
                      setEventAssistId("");
                      setIsGoalTeamPickerOpen(false);
                    }}
                  >
                    <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                    <span>{team.shortName}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <select value={eventType} onChange={(event) => setEventType(event.target.value as ResultGoalEvent["eventType"])}>
              <option value="goal">Гол</option>
              <option value="penalty">Пенальти</option>
              <option value="own_goal">Автогол</option>
            </select>
            <label>
              Кто забил
              <select value={eventScorerId} onChange={(event) => setEventScorerId(event.target.value)}>
                {playersForTeam(eventTeamId).map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.fullName}
                  </option>
                ))}
              </select>
            </label>
            {eventType === "goal" ? (
              <label>
                Ассистент
                <select value={eventAssistId} onChange={(event) => setEventAssistId(event.target.value)}>
                  <option value="">Без паса</option>
                  {playersForTeam(eventTeamId)
                    .filter((player) => player.id !== eventScorerId)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.fullName}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <div className="modal-actions">
              <button
                className="ghost bordered"
                type="button"
                onClick={() => {
                  setEventTeamId("");
                  setIsGoalTeamPickerOpen(false);
                }}
              >
                Отмена
              </button>
              <button className="primary" type="submit">
                Добавить событие
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {operationStatus ? <AdminOperationModal status={operationStatus} onClose={() => setOperationStatus(null)} /> : null}
    </section>
  );
}

function AdminOperationModal({ status, onClose }: { status: Exclude<AdminOperationStatus, null>; onClose: () => void }) {
  return (
    <div className="operation-backdrop" role="alertdialog" aria-modal="true" aria-label={status.title}>
      <section className={`operation-modal ${status.state}`}>
        {status.state === "loading" ? <span className="mini-spinner" aria-label="Загрузка" /> : null}
        <h2>{status.title}</h2>
        <p>{status.message}</p>
        {status.state !== "loading" ? (
          <button className="primary" type="button" onClick={onClose}>
            Понятно
          </button>
        ) : null}
      </section>
    </div>
  );
}
