import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  ChevronRight,
  CircleMinus,
  Clock3,
  History,
  LoaderCircle,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import type { MatchDetails, MatchSummary } from '@uno-web/shared';
import { useGame } from '../contexts/GameContext';

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'Unknown duration';
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function reasonLabel(match: MatchSummary): string {
  if (match.status === 'completed') return 'Completed';
  if (match.status === 'draw') return 'Draw';
  const labels: Record<string, string> = {
    player_exit: 'Player exited',
    disconnect_timeout: 'Reconnect timed out',
    host_abort: 'Host ended game',
    server_shutdown: 'Server restarted',
    server_crash: 'Server stopped',
  };
  return match.endReason ? labels[match.endReason] ?? 'Interrupted' : 'Interrupted';
}

function resultInfo(match: MatchSummary) {
  const result = match.participants.find(participant => participant.isCurrentProfile)?.result;
  if (result === 'win') {
    return { label: 'Victory', classes: 'text-emerald-300 bg-emerald-500/10', icon: Trophy };
  }
  if (result === 'loss') {
    return { label: 'Defeat', classes: 'text-rose-300 bg-rose-500/10', icon: Ban };
  }
  if (result === 'draw') {
    return { label: 'Draw', classes: 'text-amber-300 bg-amber-500/10', icon: CircleMinus };
  }
  return { label: 'Interrupted', classes: 'text-slate-300 bg-white/5', icon: Clock3 };
}

function MatchDetail({ match, onBack }: { match: MatchDetails; onBack: () => void }) {
  const result = resultInfo(match);
  const ResultIcon = result.icon;
  const hasSettlementOrder = match.status === 'completed';
  const participants = match.participants.slice().sort((a, b) => {
    if (!hasSettlementOrder) return a.seatIndex - b.seatIndex;
    if (a.result === 'win') return -1;
    if (b.result === 'win') return 1;
    return (a.finalHandScore ?? 0) - (b.finalHandScore ?? 0);
  });

  return (
    <div className={'mx-auto min-h-screen w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8'}>
      <button
        type={'button'}
        onClick={onBack}
        className={'icon-button'}
        aria-label={'Back to match history'}
        title={'Back to match history'}
      >
        <ArrowLeft className={'h-5 w-5'} />
      </button>
      <header
        className={
          'my-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6'
        }
      >
        <div>
          <p className={'text-xs font-semibold uppercase text-slate-500'}>Room {match.roomId}</p>
          <h2 className={'mt-1 text-2xl font-bold text-white'}>Match details</h2>
          <p className={'mt-2 text-sm text-slate-400'}>
            {formatDate(match.startedAt)} · {formatDuration(match.durationMs)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${result.classes}`}
        >
          <ResultIcon className={'h-4 w-4'} /> {result.label}
        </span>
      </header>

      <section className={'mb-10'}>
        <div className={'mb-3 flex items-center justify-between gap-3'}>
          <h3 className={'font-semibold text-white'}>Settlement</h3>
          <span className={'text-xs text-slate-500'}>{reasonLabel(match)}</span>
        </div>
        <div className={'overflow-hidden rounded-lg border border-white/10'}>
          {participants.map((participant, index) => (
            <div
              key={participant.playerId}
              className={
                'grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-white/5 bg-black/15 px-4 py-3 last:border-0'
              }
            >
              <span className={'text-center text-sm font-semibold text-slate-500'}>
                {hasSettlementOrder ? index + 1 : '-'}
              </span>
              <div className={'min-w-0'}>
                <p className={'truncate font-medium text-slate-100'}>
                  {participant.displayName}
                  {participant.isCurrentProfile ? ' (You)' : ''}
                </p>
                <p className={'text-xs text-slate-500'}>
                  {participant.voluntarilyLeft ? 'Exited voluntarily' : participant.result}
                </p>
              </div>
              <div className={'text-right'}>
                <p className={'text-sm font-semibold text-slate-200'}>
                  {participant.finalHandScore ?? 0} pts
                </p>
                <p className={'text-xs text-slate-500'}>
                  {participant.finalHandCount ?? 0} cards
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className={'mb-4 font-semibold text-white'}>Public events</h3>
        {match.events.length === 0 ? (
          <p
            className={
              'rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400'
            }
          >
            No public events were recorded.
          </p>
        ) : (
          <ol className={'border-l border-white/10 pl-5'}>
            {match.events.map(event => (
              <li key={event.sequence} className={'relative pb-5 last:pb-0'}>
                <span className={'absolute -left-[1.45rem] top-1.5 h-2 w-2 rounded-full bg-blue-400'} />
                <p className={'text-sm text-slate-200'}>{event.message}</p>
                <time className={'mt-1 block text-xs text-slate-600'}>
                  {formatDate(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function HistoryView({ onBack }: { onBack: () => void }) {
  const { historyAvailable, loadMatchDetails, loadMatchHistory, profile } = useGame();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = async (nextCursor?: string) => {
    setLoading(true);
    setError(null);
    const result = await loadMatchHistory(nextCursor);
    if (result.success && result.page) {
      setMatches(previous =>
        nextCursor ? [...previous, ...result.page!.matches] : result.page!.matches
      );
      setCursor(result.page.nextCursor);
    } else {
      setError(result.error ?? 'Could not load match history');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPage();
  }, []);

  const openMatch = async (matchId: string) => {
    setLoading(true);
    const result = await loadMatchDetails(matchId);
    if (result.success && result.match) setSelected(result.match);
    else setError(result.error ?? 'Could not load match details');
    setLoading(false);
  };

  if (selected) {
    return <MatchDetail match={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className={'mx-auto min-h-screen w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8'}>
      <header className={'mb-6 flex items-center gap-3 border-b border-white/10 pb-5'}>
        <button
          type={'button'}
          onClick={onBack}
          className={'icon-button'}
          aria-label={'Back to lobby'}
          title={'Back to lobby'}
        >
          <ArrowLeft className={'h-5 w-5'} />
        </button>
        <div className={'min-w-0 flex-1'}>
          <h2 className={'flex items-center gap-2 text-xl font-bold text-white'}>
            <History className={'h-5 w-5 text-blue-400'} /> Match history
          </h2>
          <p className={'truncate text-sm text-slate-500'}>
            {profile?.displayName ?? 'Anonymous player'}
          </p>
        </div>
        <button
          type={'button'}
          onClick={() => void loadPage()}
          className={'icon-button'}
          aria-label={'Refresh match history'}
          title={'Refresh match history'}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {!historyAvailable && (
        <div className={'status-warning'}>
          Persistent history is unavailable. Recent records may only survive until the server
          restarts.
        </div>
      )}
      {error && <div className={'status-error'}>{error}</div>}

      {loading && matches.length === 0 ? (
        <div className={'flex min-h-48 items-center justify-center text-slate-400'}>
          <LoaderCircle className={'mr-2 h-5 w-5 animate-spin'} /> Loading history
        </div>
      ) : matches.length === 0 ? (
        <div className={'rounded-lg border border-dashed border-white/10 px-5 py-14 text-center'}>
          <History className={'mx-auto mb-3 h-7 w-7 text-slate-600'} />
          <p className={'font-medium text-slate-300'}>No finished matches yet</p>
          <p className={'mt-1 text-sm text-slate-500'}>
            Completed, drawn, and interrupted matches appear here.
          </p>
        </div>
      ) : (
        <div className={'space-y-2'}>
          {matches.map(match => {
            const result = resultInfo(match);
            const ResultIcon = result.icon;
            const opponents = match.participants
              .filter(item => !item.isCurrentProfile)
              .map(item => item.displayName)
              .join(', ');
            return (
              <button
                type={'button'}
                key={match.id}
                onClick={() => void openMatch(match.id)}
                className={
                  'grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06]'
                }
              >
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${result.classes}`}
                >
                  <ResultIcon className={'h-4 w-4'} />
                </span>
                <span className={'min-w-0'}>
                  <span className={'font-semibold text-slate-100'}>{result.label}</span>
                  <span className={'ml-2 text-xs text-slate-500'}>
                    {formatDate(match.startedAt)}
                  </span>
                  <span className={'block truncate text-sm text-slate-400'}>
                    {opponents || 'No opponents'} · {formatDuration(match.durationMs)}
                  </span>
                </span>
                <ChevronRight className={'h-4 w-4 text-slate-600'} />
              </button>
            );
          })}
        </div>
      )}

      {cursor && (
        <button
          type={'button'}
          onClick={() => void loadPage(cursor)}
          disabled={loading}
          className={
            'mt-5 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 disabled:opacity-50'
          }
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
