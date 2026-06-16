import { useState, useEffect } from 'react';

// ===== Configuration =====
const SEASON = 2026;
const API = 'https://statsapi.mlb.com/api/v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TEAM_ID = 120; // Nationals

// All 30 MLB teams with primary brand color (used for team name treatment).
const TEAMS = [
  { id: 109, name: 'Diamondbacks', abbr: 'ARI', leagueId: 104, color: '#A71930' },
  { id: 144, name: 'Braves',       abbr: 'ATL', leagueId: 104, color: '#CE1141' },
  { id: 110, name: 'Orioles',      abbr: 'BAL', leagueId: 103, color: '#DF4601' },
  { id: 111, name: 'Red Sox',      abbr: 'BOS', leagueId: 103, color: '#BD3039' },
  { id: 112, name: 'Cubs',         abbr: 'CHC', leagueId: 104, color: '#0E3386' },
  { id: 145, name: 'White Sox',    abbr: 'CWS', leagueId: 103, color: '#27251F' },
  { id: 113, name: 'Reds',         abbr: 'CIN', leagueId: 104, color: '#C6011F' },
  { id: 114, name: 'Guardians',    abbr: 'CLE', leagueId: 103, color: '#00385D' },
  { id: 115, name: 'Rockies',      abbr: 'COL', leagueId: 104, color: '#33006F' },
  { id: 116, name: 'Tigers',       abbr: 'DET', leagueId: 103, color: '#0C2340' },
  { id: 117, name: 'Astros',       abbr: 'HOU', leagueId: 103, color: '#002D62' },
  { id: 118, name: 'Royals',       abbr: 'KC',  leagueId: 103, color: '#004687' },
  { id: 108, name: 'Angels',       abbr: 'LAA', leagueId: 103, color: '#BA0021' },
  { id: 119, name: 'Dodgers',      abbr: 'LAD', leagueId: 104, color: '#005A9C' },
  { id: 146, name: 'Marlins',      abbr: 'MIA', leagueId: 104, color: '#00A3E0' },
  { id: 158, name: 'Brewers',      abbr: 'MIL', leagueId: 104, color: '#12284B' },
  { id: 142, name: 'Twins',        abbr: 'MIN', leagueId: 103, color: '#002B5C' },
  { id: 121, name: 'Mets',         abbr: 'NYM', leagueId: 104, color: '#002D72' },
  { id: 147, name: 'Yankees',      abbr: 'NYY', leagueId: 103, color: '#0C2340' },
  { id: 133, name: 'Athletics',    abbr: 'ATH', leagueId: 103, color: '#003831' },
  { id: 143, name: 'Phillies',     abbr: 'PHI', leagueId: 104, color: '#E81828' },
  { id: 134, name: 'Pirates',      abbr: 'PIT', leagueId: 104, color: '#FDB827' },
  { id: 135, name: 'Padres',       abbr: 'SD',  leagueId: 104, color: '#2F241D' },
  { id: 137, name: 'Giants',       abbr: 'SF',  leagueId: 104, color: '#FD5A1E' },
  { id: 136, name: 'Mariners',     abbr: 'SEA', leagueId: 103, color: '#0C2C56' },
  { id: 138, name: 'Cardinals',    abbr: 'STL', leagueId: 104, color: '#C41E3A' },
  { id: 139, name: 'Rays',         abbr: 'TB',  leagueId: 103, color: '#092C5C' },
  { id: 140, name: 'Rangers',      abbr: 'TEX', leagueId: 103, color: '#003278' },
  { id: 141, name: 'Blue Jays',    abbr: 'TOR', leagueId: 103, color: '#134A8E' },
  { id: 120, name: 'Nationals',    abbr: 'WSH', leagueId: 104, color: '#14225A' },
];
const TEAMS_SORTED = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name));

// ===== Cache (localStorage, 5-min TTL) =====
// localStorage is blocked in Claude's artifact sandbox; try/catch makes it a silent no-op there.
// Works as designed once deployed.
function getCachedData(teamId) {
  try {
    const raw = localStorage.getItem(`team-tracker:${teamId}`);
    if (!raw) return null;
    const { timestamp, data } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    return null;
  } catch { return null; }
}

function setCachedData(teamId, data) {
  try {
    localStorage.setItem(`team-tracker:${teamId}`, JSON.stringify({
      timestamp: Date.now(),
      data,
    }));
  } catch { /* silent */ }
}

// ===== Helpers =====
const pad2 = (n) => String(n).padStart(2, '0');
const fmtISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const DAYS = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'];
const fmtGameDate = (isoStr) => {
  const d = new Date(isoStr);
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
};

const parseIP = (ipStr) => {
  if (ipStr === undefined || ipStr === null) return 0;
  const [whole, frac] = String(ipStr).split('.');
  return (parseInt(whole, 10) || 0) + (frac ? (parseInt(frac, 10) || 0) / 3 : 0);
};

const lastNameOf = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName;
};

const fmtAvg = (val) => {
  if (val === undefined || val === null || val === '') return '—';
  const s = String(val);
  return s.startsWith('0.') ? s.slice(1) : s;
};

// ===== Mock data (sandbox fallback) =====
const MOCK_DATA = {
  loading: false,
  error: null,
  isMock: true,
  record: { wins: 37, losses: 35, l10W: 6, l10L: 4 },
  recent: [
    {
      gamePk: 1, gameDate: '2026-06-12T23:05:00Z',
      teams: {
        home: { team: { id: DEFAULT_TEAM_ID, abbreviation: 'WSH' }, score: 4 },
        away: { team: { id: 99, abbreviation: 'SEA' }, score: 7 },
      },
      status: { abstractGameState: 'Final' },
      notable: 'Wood 1-4, 1 HR, 1 RBI. Abrams 2-4, 1 RBI.',
    },
    {
      gamePk: 2, gameDate: '2026-06-13T23:05:00Z',
      teams: {
        home: { team: { id: DEFAULT_TEAM_ID, abbreviation: 'WSH' }, score: 8 },
        away: { team: { id: 99, abbreviation: 'SEA' }, score: 3 },
      },
      status: { abstractGameState: 'Final' },
      notable: 'Wood 2-4, 1 HR, 3 RBI. García 3-4, 2 RBI. Gore 7.0 IP, 1 R.',
    },
    {
      gamePk: 3, gameDate: '2026-06-14T17:05:00Z',
      teams: {
        home: { team: { id: DEFAULT_TEAM_ID, abbreviation: 'WSH' }, score: 2 },
        away: { team: { id: 99, abbreviation: 'SEA' }, score: 5 },
      },
      status: { abstractGameState: 'Final' },
      notable: null,
    },
  ],
  upcoming: [
    {
      gamePk: 4, gameDate: '2026-06-15T23:05:00Z',
      teams: {
        home: { team: { id: 88, abbreviation: 'BAL' }, score: 1 },
        away: { team: { id: DEFAULT_TEAM_ID, abbreviation: 'WSH' }, score: 0 },
      },
      status: { abstractGameState: 'Live' },
      linescore: { currentInning: 3, isTopInning: false },
    },
    {
      gamePk: 5, gameDate: '2026-06-16T23:05:00Z',
      teams: {
        home: { team: { id: 88, abbreviation: 'BAL' } },
        away: { team: { id: DEFAULT_TEAM_ID, abbreviation: 'WSH' } },
      },
      status: { abstractGameState: 'Preview' },
    },
    {
      gamePk: 6, gameDate: '2026-06-17T23:05:00Z',
      teams: {
        home: { team: { id: DEFAULT_TEAM_ID, abbreviation: 'WSH' } },
        away: { team: { id: 77, abbreviation: 'NYM' } },
      },
      status: { abstractGameState: 'Preview' },
    },
  ],
  seasonHitters: [
    { name: 'CJ Abrams',    ab: 270, h: 78, r: 41, hr: 9,  rbi: 32, sb: 18, avg: '.289', obp: '.342' },
    { name: 'James Wood',   ab: 261, h: 74, r: 39, hr: 14, rbi: 41, sb: 7,  avg: '.284', obp: '.371' },
    { name: 'Luis García',  ab: 258, h: 71, r: 33, hr: 11, rbi: 38, sb: 5,  avg: '.275', obp: '.318' },
    { name: 'Jacob Young',  ab: 245, h: 64, r: 36, hr: 3,  rbi: 22, sb: 21, avg: '.261', obp: '.319' },
  ],
  seasonPitchers: [
    { name: 'Mackenzie Gore',  ipStr: '92.1', ip: 92.33, gs: 15, w: 6, k: 109, era: '3.45', sv: 0 },
    { name: 'Jake Irvin',      ipStr: '88.0', ip: 88.00, gs: 14, w: 5, k: 76,  era: '4.02', sv: 0 },
    { name: 'Trevor Williams', ipStr: '74.2', ip: 74.67, gs: 13, w: 4, k: 58,  era: '3.91', sv: 0 },
  ],
  seasonSaves: { name: 'Kyle Finnegan', ipStr: '28.1', ip: 28.33, gs: 0, w: 2, k: 31, era: '2.86', sv: 17 },
  last30Hitters: [
    { name: 'James Wood',   ab: 108, h: 36, r: 19, hr: 7, rbi: 21, sb: 3, avg: '.333', obp: '.412' },
    { name: 'CJ Abrams',    ab: 112, h: 34, r: 18, hr: 4, rbi: 14, sb: 8, avg: '.304', obp: '.358' },
    { name: 'Keibert Ruiz', ab: 98,  h: 29, r: 11, hr: 3, rbi: 15, sb: 0, avg: '.296', obp: '.337' },
    { name: 'Jacob Young',  ab: 101, h: 28, r: 16, hr: 1, rbi: 9,  sb: 9, avg: '.277', obp: '.330' },
  ],
  last30Pitchers: [
    { name: 'Mackenzie Gore',  ipStr: '38.0', ip: 38.00, gs: 6, w: 3, k: 45, era: '2.84', sv: 0 },
    { name: 'Jake Irvin',      ipStr: '36.1', ip: 36.33, gs: 6, w: 2, k: 32, era: '3.71', sv: 0 },
    { name: 'Trevor Williams', ipStr: '31.2', ip: 31.67, gs: 5, w: 2, k: 24, era: '3.41', sv: 0 },
  ],
  last30Saves: { name: 'Kyle Finnegan', ipStr: '12.0', ip: 12.00, gs: 0, w: 1, k: 14, era: '2.25', sv: 8 },
};

// ===== Data loading =====
async function loadAll(team) {
  const today = new Date();
  const scheduleStart = new Date(today); scheduleStart.setDate(today.getDate() - 21);
  const scheduleEnd = new Date(today); scheduleEnd.setDate(today.getDate() + 21);
  const thirty = new Date(today); thirty.setDate(today.getDate() - 30);

  const TEAM_ID = team.id;
  const LEAGUE_ID = team.leagueId;

  const urls = {
    standings: `${API}/standings?leagueId=${LEAGUE_ID}&season=${SEASON}&standingsTypes=regularSeason&hydrate=team`,
    schedule:  `${API}/schedule?sportId=1&teamId=${TEAM_ID}&startDate=${fmtISO(scheduleStart)}&endDate=${fmtISO(scheduleEnd)}&hydrate=linescore,team`,
    seasonHit: `${API}/stats?stats=season&group=hitting&season=${SEASON}&teamId=${TEAM_ID}&playerPool=ALL&sportId=1&limit=100&gameType=R`,
    seasonPit: `${API}/stats?stats=season&group=pitching&season=${SEASON}&teamId=${TEAM_ID}&playerPool=ALL&sportId=1&limit=100&gameType=R`,
    last30Hit: `${API}/stats?stats=byDateRange&group=hitting&season=${SEASON}&startDate=${fmtISO(thirty)}&endDate=${fmtISO(today)}&teamId=${TEAM_ID}&playerPool=ALL&sportId=1&limit=100&gameType=R`,
    last30Pit: `${API}/stats?stats=byDateRange&group=pitching&season=${SEASON}&startDate=${fmtISO(thirty)}&endDate=${fmtISO(today)}&teamId=${TEAM_ID}&playerPool=ALL&sportId=1&limit=100&gameType=R`,
  };

  const fetchJSON = (u) => fetch(u).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${u}`);
    return r.json();
  });

  const [standings, schedule, seasonHit, seasonPit, last30Hit, last30Pit] = await Promise.all([
    fetchJSON(urls.standings),
    fetchJSON(urls.schedule),
    fetchJSON(urls.seasonHit),
    fetchJSON(urls.seasonPit),
    fetchJSON(urls.last30Hit),
    fetchJSON(urls.last30Pit),
  ]);

  let teamRecord = null;
  for (const div of standings.records || []) {
    const found = (div.teamRecords || []).find((t) => t.team?.id === TEAM_ID);
    if (found) { teamRecord = found; break; }
  }
  const wins = teamRecord?.wins ?? 0;
  const losses = teamRecord?.losses ?? 0;
  const l10 = (teamRecord?.records?.splitRecords || []).find((r) => r.type === 'lastTen');
  const l10W = l10?.wins ?? 0;
  const l10L = l10?.losses ?? 0;

  const allGames = (schedule.dates || []).flatMap((d) => d.games || []);
  allGames.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

  const finished = allGames.filter((g) => g.status?.abstractGameState === 'Final');
  const live = allGames.filter((g) => g.status?.abstractGameState === 'Live');
  const scheduled = allGames.filter((g) => g.status?.abstractGameState === 'Preview');

  const recent = finished.slice(-3);
  const upcoming = [...live, ...scheduled].slice(0, 3);

  const boxscores = await Promise.all(
    recent.map((g) =>
      fetch(`${API}/game/${g.gamePk}/boxscore`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );
  const recentWithNotable = recent.map((g, i) => ({
    ...g,
    notable: extractNotable(boxscores[i], TEAM_ID),
  }));

  return {
    loading: false,
    error: null,
    record: { wins, losses, l10W, l10L },
    recent: recentWithNotable,
    upcoming,
    seasonHitters: topHitters(seasonHit, 4),
    seasonPitchers: topPitchers(seasonPit, 3),
    seasonSaves: topSavesLeader(seasonPit),
    last30Hitters: topHitters(last30Hit, 4),
    last30Pitchers: topPitchers(last30Pit, 3),
    last30Saves: topSavesLeader(last30Pit),
  };
}

// Best hitter (≥1 H, most RBI) and qualifying starter from a boxscore.
function extractNotable(boxscore, teamId) {
  if (!boxscore?.teams) return null;
  const isHome = boxscore.teams.home?.team?.id === teamId;
  const side = isHome ? 'home' : 'away';
  const team = boxscore.teams[side];
  if (!team?.players) return null;

  const playerMap = team.players;
  const playersArr = Object.values(playerMap);

  const hitters = playersArr
    .map((p) => ({
      name: p.person?.fullName,
      ab: p.stats?.batting?.atBats ?? 0,
      h: p.stats?.batting?.hits ?? 0,
      hr: p.stats?.batting?.homeRuns ?? 0,
      rbi: p.stats?.batting?.rbi ?? 0,
    }))
    .filter((p) => p.hr >= 1 || p.h >= 2)
    .sort((a, b) => b.rbi - a.rbi || b.hr - a.hr || b.h - a.h);
  const topHitters = hitters.slice(0, 2);

  // Starter = first pitcher in pitchers[] array; must qualify on IP/runs.
  let topPitcher = null;
  const starterId = team.pitchers?.[0];
  const starter = starterId ? playerMap[`ID${starterId}`] : null;
  const sp = starter?.stats?.pitching;
  if (sp) {
    const ip = parseIP(sp.inningsPitched);
    const r = sp.runs ?? 99;
    if (ip >= 7 || (ip >= 5 && r <= 2)) {
      topPitcher = {
        name: starter.person?.fullName,
        ipStr: sp.inningsPitched,
        r,
      };
    }
  }

  const parts = [];
  for (const h of topHitters) {
    const bits = [`${h.h}-${h.ab}`];
    if (h.hr >= 1) bits.push(`${h.hr} HR`);
    if (h.rbi >= 1) bits.push(`${h.rbi} RBI`);
    parts.push(`${lastNameOf(h.name)} ${bits.join(', ')}`);
  }
  if (topPitcher) {
    parts.push(`${lastNameOf(topPitcher.name)} ${topPitcher.ipStr} IP, ${topPitcher.r} R`);
  }
  return parts.length ? parts.join('. ') + '.' : null;
}

function splitsOf(stats) {
  return stats?.stats?.[0]?.splits || [];
}

function topHitters(stats, n) {
  return splitsOf(stats)
    .map((s) => ({
      name: s.player?.fullName,
      ab: s.stat?.atBats ?? 0,
      h: s.stat?.hits ?? 0,
      r: s.stat?.runs ?? 0,
      hr: s.stat?.homeRuns ?? 0,
      rbi: s.stat?.rbi ?? 0,
      sb: s.stat?.stolenBases ?? 0,
      avg: s.stat?.avg ?? '.000',
      obp: s.stat?.obp ?? '.000',
    }))
    .filter((p) => p.ab > 0)
    .sort((a, b) => b.h - a.h)
    .slice(0, n);
}

function topPitchers(stats, n) {
  return splitsOf(stats)
    .map((s) => ({
      name: s.player?.fullName,
      ipStr: s.stat?.inningsPitched ?? '0.0',
      ip: parseIP(s.stat?.inningsPitched),
      gs: s.stat?.gamesStarted ?? 0,
      w: s.stat?.wins ?? 0,
      k: s.stat?.strikeOuts ?? 0,
      era: s.stat?.era ?? '0.00',
      sv: s.stat?.saves ?? 0,
    }))
    .filter((p) => p.ip > 0)
    .sort((a, b) => b.ip - a.ip)
    .slice(0, n);
}

function topSavesLeader(stats) {
  const ranked = splitsOf(stats)
    .map((s) => ({
      name: s.player?.fullName,
      ipStr: s.stat?.inningsPitched ?? '0.0',
      ip: parseIP(s.stat?.inningsPitched),
      gs: s.stat?.gamesStarted ?? 0,
      w: s.stat?.wins ?? 0,
      k: s.stat?.strikeOuts ?? 0,
      era: s.stat?.era ?? '0.00',
      sv: s.stat?.saves ?? 0,
    }))
    .filter((p) => p.sv > 0)
    .sort((a, b) => b.sv - a.sv);
  return ranked[0] || null;
}

// ===== Components =====
function App() {
  const [teamId, setTeamId] = useState(DEFAULT_TEAM_ID);
  const [state, setState] = useState({ loading: true });
  const team = TEAMS.find((t) => t.id === teamId) || TEAMS.find((t) => t.id === DEFAULT_TEAM_ID);

  useEffect(() => {
    const cached = getCachedData(teamId);
    if (cached) {
      setState(cached);
      return;
    }

    setState({ loading: true });
    loadAll(team)
      .then((data) => {
        setCachedData(teamId, data);
        setState(data);
      })
      .catch((err) => {
        console.warn('Live fetch failed, falling back to mock data:', err);
        setState({ ...MOCK_DATA });
      });
  }, [teamId]);

  return (
    <div className="tracker" style={{ '--team-color': team.color }}>
      <style>{styles}</style>
      <header className="appbar">
        <div className="appbar-title">
          <h1>My Team Tracker <span className="ball" aria-hidden="true">⚾</span></h1>
          <p className="attribution">by Jay Nargundkar</p>
        </div>
        <TeamSelector value={teamId} onChange={setTeamId} />
      </header>
      {state.loading ? (
        <div className="status">Loading…</div>
      ) : state.error ? (
        <div className="status error">Couldn't load data: {state.error}</div>
      ) : (
        <Dashboard team={team} {...state} />
      )}
      <footer className="foot">
        <span>Data: MLB Stats API</span>
      </footer>
    </div>
  );
}

function TeamSelector({ value, onChange }) {
  return (
    <div className="team-selector">
      <select
        aria-label="Select team"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="ts-select"
      >
        {TEAMS_SORTED.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

function Dashboard({ team, isMock, record, recent, upcoming, seasonHitters, seasonPitchers, seasonSaves, last30Hitters, last30Pitchers, last30Saves }) {
  return (
    <main>
      {isMock && (
        <div className="mock-banner">
          Showing mock data — live MLB API blocked by Claude's artifact sandbox. Real data will load once deployed.
        </div>
      )}
      <TeamHeader team={team} record={record} />
      <Section label="Recent Games">
        <RecentList games={recent} teamId={team.id} />
      </Section>
      <Section label="Current / Upcoming">
        <UpcomingList games={upcoming} teamId={team.id} />
      </Section>
      <Section label="Last 30 Days">
        <HittersTable players={last30Hitters} />
        <PitchersTable players={last30Pitchers} savesLeader={last30Saves} />
      </Section>
      <Section label="Season Leaders">
        <HittersTable players={seasonHitters} />
        <PitchersTable players={seasonPitchers} savesLeader={seasonSaves} />
      </Section>
    </main>
  );
}

function TeamHeader({ team, record }) {
  return (
    <div className="team-header">
      <div className="team-name">{team.name}</div>
      <div className="team-record">
        <span className="rec-main">{record.wins}-{record.losses}</span>
        <span className="rec-l10">({record.l10W}-{record.l10L} L10)</span>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <section className="section">
      <h2 className="eyebrow">{label}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

function RecentList({ games, teamId }) {
  if (!games?.length) return <p className="empty">No recent games.</p>;
  return (
    <ul className="games">
      {games.map((g) => <GameRow key={g.gamePk} game={g} kind="recent" teamId={teamId} />)}
    </ul>
  );
}

function UpcomingList({ games, teamId }) {
  if (!games?.length) return <p className="empty">Nothing on the slate.</p>;
  return (
    <ul className="games">
      {games.map((g) => <GameRow key={g.gamePk} game={g} kind="upcoming" teamId={teamId} />)}
    </ul>
  );
}

function GameRow({ game, kind, teamId }) {
  const isHome = game.teams?.home?.team?.id === teamId;
  const us = isHome ? game.teams.home : game.teams.away;
  const them = isHome ? game.teams.away : game.teams.home;
  const oppAbbr = them?.team?.abbreviation || '???';
  const venue = isHome ? 'vs.' : 'at';
  const date = fmtGameDate(game.gameDate);
  const abs = game.status?.abstractGameState;

  if (kind === 'recent' || abs === 'Final') {
    const ourScore = us?.score ?? 0;
    const theirScore = them?.score ?? 0;
    const result = ourScore > theirScore ? 'W' : ourScore < theirScore ? 'L' : 'T';
    return (
      <li className={`game game-${result.toLowerCase()}`}>
        <div className="game-line">
          <span className="game-date">{date}:</span>
          <span className="game-result">{result}, {ourScore}-{theirScore}</span>
          <span className="game-opp">{venue} {oppAbbr}</span>
        </div>
        {game.notable && <div className="notable">{game.notable}</div>}
      </li>
    );
  }

  if (abs === 'Live') {
    const ls = game.linescore;
    const ourScore = us?.score ?? ls?.teams?.[isHome ? 'home' : 'away']?.runs ?? 0;
    const theirScore = them?.score ?? ls?.teams?.[isHome ? 'away' : 'home']?.runs ?? 0;
    const inn = ls?.currentInning ?? '?';
    const half = ls?.isTopInning ? 'Top' : 'Bot';
    return (
      <li className="game game-live">
        <div className="game-line">
          <span className="game-date">{date}:</span>
          <span className="game-result">{ourScore}-{theirScore} {half} {inn}</span>
          <span className="game-opp">{venue} {oppAbbr}</span>
          <span className="live-dot" aria-label="live" />
        </div>
      </li>
    );
  }

  return (
    <li className="game game-scheduled">
      <div className="game-line">
        <span className="game-date">{date}:</span>
        <span className="game-opp">{venue} {oppAbbr}</span>
      </div>
    </li>
  );
}

function HittersTable({ players }) {
  return (
    <div className="leaders-block">
      <h3 className="sub">Hitters</h3>
      {!players?.length ? (
        <p className="empty">No data.</p>
      ) : (
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>
                <th className="name">Player</th>
                <th>H/AB</th>
                <th>R</th>
                <th>HR</th>
                <th>RBI</th>
                <th>SB</th>
                <th>AVG</th>
                <th>OBP</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.name}>
                  <td className="name">{lastNameOf(p.name)}</td>
                  <td>{p.h}/{p.ab}</td>
                  <td>{p.r}</td>
                  <td>{p.hr}</td>
                  <td>{p.rbi}</td>
                  <td>{p.sb}</td>
                  <td>{fmtAvg(p.avg)}</td>
                  <td>{fmtAvg(p.obp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PitchersTable({ players, savesLeader }) {
  const rows = [...(players || [])];
  if (savesLeader && !rows.find((r) => r.name === savesLeader.name)) {
    rows.push(savesLeader);
  }
  return (
    <div className="leaders-block">
      <h3 className="sub">Pitchers</h3>
      {!rows.length ? (
        <p className="empty">No data.</p>
      ) : (
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>
                <th className="name">Player</th>
                <th>IP</th>
                <th>GS</th>
                <th>W</th>
                <th>K</th>
                <th>ERA</th>
                <th>SV</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.name}>
                  <td className="name">{lastNameOf(p.name)}</td>
                  <td>{p.ipStr}</td>
                  <td>{p.gs}</td>
                  <td>{p.w}</td>
                  <td>{p.k}</td>
                  <td>{p.era}</td>
                  <td>{p.sv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== Styles =====
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

* { box-sizing: border-box; }

.tracker {
  --bg: #FAFAF7;
  --ink: #0F1419;
  --muted: #6B6F75;
  --rule: #1A1A1A;
  --hairline: #D6D6D0;
  --team-color: #14225A;
  --win: #1F7A4F;
  --loss: #AB0003;
  --live: #E0552A;
  --card: #FFFFFF;

  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--ink);
  background: var(--bg);
  max-width: 480px;
  margin: 0 auto;
  padding: 0 18px 28px;
  min-height: 100vh;
  font-size: 15px;
  line-height: 1.4;
}

.appbar {
  padding: 14px 0 10px;
  border-bottom: 1px solid var(--hairline);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.appbar-title { display: flex; flex-direction: column; gap: 2px; }
.appbar h1 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.appbar .ball { color: var(--ink); margin-left: 4px; }
.attribution {
  margin: 0;
  font-size: 11px;
  font-style: italic;
  color: var(--muted);
  letter-spacing: 0.01em;
}

.team-selector { display: flex; align-items: center; }
.ts-select {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 5px 26px 5px 10px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background-color: var(--card);
  color: var(--ink);
  cursor: pointer;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%236B6F75' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px 6px;
}
.ts-select:focus { outline: 2px solid var(--team-color); outline-offset: 1px; }

.status { padding: 32px 0; color: var(--muted); text-align: center; }
.status.error { color: var(--loss); }

.team-header {
  padding: 18px 0 14px;
  border-bottom: 2px solid var(--rule);
}
.team-name {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--team-color);
}
.team-record {
  margin-top: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 17px;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.rec-main { font-weight: 600; color: var(--ink); }
.rec-l10 { color: var(--muted); font-size: 14px; }

.section {
  padding: 14px 0;
  border-bottom: 1px solid var(--hairline);
}
.section:last-of-type { border-bottom: none; padding-bottom: 4px; }
.eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.games { list-style: none; margin: 0; padding: 0; }
.game {
  position: relative;
  padding: 6px 0 6px 12px;
  border-left: 3px solid var(--hairline);
  margin-bottom: 5px;
}
.game:last-child { margin-bottom: 0; }
.game-w { border-left-color: var(--win); }
.game-l { border-left-color: var(--loss); }
.game-live { border-left-color: var(--live); }
.game-scheduled { border-left-color: var(--hairline); }

.game-line {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: baseline;
}
.game-date { color: var(--muted); }
.game-result { font-weight: 600; }
.game-opp { color: var(--ink); }
.notable {
  margin-top: 3px;
  font-size: 13px;
  color: var(--muted);
  font-style: italic;
  line-height: 1.4;
}

.live-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--live);
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
}

.leaders-block { margin-bottom: 12px; }
.leaders-block:last-child { margin-bottom: 0; }
.sub {
  margin: 0 0 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.table-wrap { overflow-x: auto; margin: 0 -2px; }
.stats {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
}
.stats th, .stats td {
  padding: 5px 4px;
  text-align: right;
  white-space: nowrap;
}
.stats th {
  font-weight: 500;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--hairline);
}
.stats td { border-bottom: 1px solid #F0F0EB; }
.stats tr:last-child td { border-bottom: none; }
.stats .name {
  text-align: left;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  padding-right: 8px;
}
.stats th.name { font-weight: 500; }

.empty { color: var(--muted); font-size: 13px; margin: 0; }

.mock-banner {
  margin: 12px 0 0;
  padding: 9px 12px;
  background: #FEF6E4;
  border: 1px solid #E8D49A;
  border-left: 3px solid #C8941F;
  font-size: 12px;
  color: #5C4400;
  line-height: 1.45;
  border-radius: 2px;
}

.foot {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline);
  font-size: 11px;
  color: var(--muted);
  text-align: center;
  letter-spacing: 0.04em;
}
`;

export default App;
