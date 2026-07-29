"use client";

import { BarChart3, CalendarDays, Grid3X3, Shield, Trophy, UserRound } from "lucide-react";
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

const initialRemoteState = { loading: false, data: null, error: null };

function allowsDevTelegramMock() {
  return process.env.NEXT_PUBLIC_ALLOW_DEV_TELEGRAM_MOCK === "true";
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
  const [chessboard, setChessboard] = useState<RemoteState<unknown[]>>(initialRemoteState);
  const [statistics, setStatistics] = useState<RemoteState<PlayerStatistic[]>>(initialRemoteState);
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
      if (tab === "chessboard" && !chessboard.data && !chessboard.loading) {
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
    { key: "chessboard" as const, label: "Шахматка", icon: Grid3X3 },
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
            {activeTab === "standings" ? <StandingsView state={standings} favoriteTeamId={bootstrap.data.user.favoriteTeamId} /> : null}
            {activeTab === "chessboard" ? <ChessboardView state={chessboard} /> : null}
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
                teams={bootstrap.data.teams}
                message={adminMessage}
                onMessage={setAdminMessage}
                apiFetch={apiFetch}
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

function StandingsView({ state, favoriteTeamId }: { state: RemoteState<StandingRow[]>; favoriteTeamId: string | null }) {
  return (
    <StateBlock state={state} emptyText="Таблица появится после публикации матчей">
      {(rows) => (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Команда</th>
                <th>И</th>
                <th>РМ</th>
                <th>О</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.teamId} className={row.teamId === favoriteTeamId ? "favorite-row" : ""}>
                  <td>{row.place}</td>
                  <td>{row.shortName}</td>
                  <td>{row.played}</td>
                  <td>{row.goalDifference}</td>
                  <td>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StateBlock>
  );
}

function ChessboardView({ state }: { state: RemoteState<unknown[]> }) {
  return (
    <StateBlock state={state} emptyText="Шахматка появится после добавления команд">
      {(rows) => (
        <div className="chessboard">
          {rows.map((row) => {
            const typed = row as { teamId: string; shortName: string; cells: { kind: string; value?: string }[] };
            return (
              <div key={typed.teamId} className="chess-row">
                <strong>{typed.shortName}</strong>
                {typed.cells.map((cell, index) => (
                  <span key={`${typed.teamId}-${index}`} className={cell.kind}>
                    {cell.kind === "self" ? "•" : cell.value ?? ""}
                  </span>
                ))}
              </div>
            );
          })}
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
  teams: Team[];
  message: string | null;
  onMessage: (message: string | null) => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [teamName, setTeamName] = useState("");
  const [teamShortName, setTeamShortName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerTeamId, setPlayerTeamId] = useState(props.teams[0]?.id ?? "");

  async function createTeam() {
    await props.apiFetch("/api/admin/teams", {
      method: "POST",
      body: JSON.stringify({ name: teamName, shortName: teamShortName, city: null })
    });
    setTeamName("");
    setTeamShortName("");
    props.onMessage("Команда добавлена");
  }

  async function createPlayer() {
    await props.apiFetch("/api/admin/players", {
      method: "POST",
      body: JSON.stringify({ teamId: playerTeamId, fullName: playerName })
    });
    setPlayerName("");
    props.onMessage("Игрок сохранён");
  }

  return (
    <section className="admin">
      {props.message ? <div className="notice">{props.message}</div> : null}
      {props.permissions.manage_teams ? (
        <form action={createTeam}>
          <h2>Команды</h2>
          <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Полное название" />
          <input value={teamShortName} onChange={(event) => setTeamShortName(event.target.value)} placeholder="Короткое название" />
          <button className="primary" type="submit">
            Добавить
          </button>
        </form>
      ) : null}
      {props.permissions.manage_any_players || props.permissions.manage_own_team_players ? (
        <form action={createPlayer}>
          <h2>Заявка</h2>
          <select value={playerTeamId} onChange={(event) => setPlayerTeamId(event.target.value)}>
            {props.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Имя игрока" />
          <button className="primary" type="submit">
            Сохранить игрока
          </button>
        </form>
      ) : null}
      {props.permissions.publish_result ? <div className="notice">Публикация результатов доступна через API `/api/admin/results/publish`.</div> : null}
    </section>
  );
}
