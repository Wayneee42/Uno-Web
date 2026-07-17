import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clipboard,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { ProfileStats } from '@uno-web/shared';
import { useGame } from '../contexts/GameContext';

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ProfileView({ onBack }: { onBack: () => void }) {
  const {
    historyAvailable,
    importProfile,
    loadProfileStats,
    profile,
    recoveryCode,
    rotateRecoveryCode,
  } = useGame();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = async () => {
    const result = await loadProfileStats();
    if (result.success && result.stats) setStats(result.stats);
    else if (result.error) setError(result.error);
  };

  useEffect(() => {
    if (profile) void refreshStats();
  }, [loadProfileStats, profile]);

  const copyCode = async () => {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setMessage('Recovery code copied');
      setError(null);
    } catch {
      setError('Clipboard access failed');
    }
  };

  const rotate = async () => {
    setBusy(true);
    setError(null);
    const result = await rotateRecoveryCode();
    if (result.success) {
      setShowCode(true);
      setConfirmRotation(false);
      setMessage('Recovery code rotated. Other devices must import the new code.');
    } else {
      setError(result.error ?? 'Could not rotate recovery code');
    }
    setBusy(false);
  };

  const restore = async () => {
    if (!importCode.trim()) {
      setError('Enter a recovery code');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await importProfile(importCode);
    if (result.success) {
      setImportCode('');
      setMessage('Player profile restored');
      await refreshStats();
    } else {
      setError(result.error ?? 'Could not restore player profile');
    }
    setBusy(false);
  };

  const completed = stats?.completedGames ?? 0;
  const statItems: Array<[string, string | number]> = [
    ['Games', completed],
    ['Wins', stats?.wins ?? 0],
    ['Losses', stats?.losses ?? 0],
    ['Draws', stats?.draws ?? 0],
    ['Win rate', percentage(completed ? (stats?.wins ?? 0) / completed : 0)],
    ['Voluntary exit rate', percentage(stats?.voluntaryExitRate ?? 0)],
  ];

  return (
    <div className={'mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8'}>
      <header className={'mb-7 flex items-center gap-3 border-b border-white/10 pb-5'}>
        <button
          type={'button'}
          onClick={onBack}
          className={'icon-button'}
          aria-label={'Back to lobby'}
          title={'Back to lobby'}
        >
          <ArrowLeft className={'h-5 w-5'} />
        </button>
        <div>
          <h2 className={'flex items-center gap-2 text-xl font-bold text-white'}>
            <UserRound className={'h-5 w-5 text-blue-400'} /> Player profile
          </h2>
          <p className={'text-sm text-slate-500'}>{profile?.displayName ?? 'Anonymous player'}</p>
        </div>
      </header>

      {!historyAvailable && (
        <div className={'status-warning'}>
          This profile is not currently backed by persistent storage.
        </div>
      )}
      {message && (
        <div className={'status-success'}>
          <Check className={'h-4 w-4'} /> {message}
        </div>
      )}
      {error && <div className={'status-error'}>{error}</div>}

      <section className={'mb-9'}>
        <h3 className={'mb-3 text-sm font-semibold text-white'}>Personal statistics</h3>
        <div className={'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
          {statItems.map(([label, value]) => (
            <div
              key={label}
              className={'rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3'}
            >
              <p className={'text-xs text-slate-500'}>{label}</p>
              <p className={'mt-1 text-xl font-bold text-slate-100'}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={'mb-9 border-t border-white/10 pt-7'}>
        <h3 className={'flex items-center gap-2 text-sm font-semibold text-white'}>
          <ShieldCheck className={'h-4 w-4 text-emerald-400'} /> Recovery code
        </h3>
        <p className={'mt-2 text-sm leading-6 text-slate-400'}>
          Keep this code private. It restores match history on another browser or device.
        </p>
        <div className={'mt-4 flex min-w-0 items-center gap-2'}>
          <code
            className={
              'min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-slate-200'
            }
          >
            {showCode ? recoveryCode ?? 'Unavailable' : '************************'}
          </code>
          <button
            type={'button'}
            onClick={() => setShowCode(value => !value)}
            className={'icon-button'}
            aria-label={showCode ? 'Hide recovery code' : 'Show recovery code'}
            title={showCode ? 'Hide recovery code' : 'Show recovery code'}
          >
            {showCode ? <EyeOff className={'h-4 w-4'} /> : <Eye className={'h-4 w-4'} />}
          </button>
          <button
            type={'button'}
            onClick={() => void copyCode()}
            disabled={!recoveryCode}
            className={'icon-button disabled:opacity-40'}
            aria-label={'Copy recovery code'}
            title={'Copy recovery code'}
          >
            <Clipboard className={'h-4 w-4'} />
          </button>
        </div>

        {!confirmRotation ? (
          <button
            type={'button'}
            onClick={() => setConfirmRotation(true)}
            disabled={!historyAvailable}
            className={
              'mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-40'
            }
          >
            <RefreshCw className={'h-4 w-4'} /> Rotate code
          </button>
        ) : (
          <div className={'mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3'}>
            <p className={'text-sm text-amber-100'}>
              The old code and credentials saved on other devices will stop working.
            </p>
            <div className={'mt-3 flex gap-2'}>
              <button
                type={'button'}
                onClick={() => void rotate()}
                disabled={busy}
                className={
                  'rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50'
                }
              >
                Confirm rotation
              </button>
              <button
                type={'button'}
                onClick={() => setConfirmRotation(false)}
                className={
                  'rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200'
                }
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={'border-t border-white/10 pt-7'}>
        <h3 className={'flex items-center gap-2 text-sm font-semibold text-white'}>
          <KeyRound className={'h-4 w-4 text-blue-400'} /> Restore another profile
        </h3>
        <p className={'mt-2 text-sm text-slate-400'}>
          This browser will switch to the profile represented by the code.
        </p>
        <div className={'mt-4 flex flex-col gap-2 sm:flex-row'}>
          <input
            type={'password'}
            value={importCode}
            onChange={event => setImportCode(event.target.value)}
            placeholder={'uno_...'}
            autoComplete={'off'}
            spellCheck={false}
            className={
              'min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/20'
            }
          />
          <button
            type={'button'}
            onClick={() => void restore()}
            disabled={busy}
            className={
              'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-50'
            }
          >
            {busy ? (
              <LoaderCircle className={'h-4 w-4 animate-spin'} />
            ) : (
              <KeyRound className={'h-4 w-4'} />
            )}{' '}
            Restore
          </button>
        </div>
      </section>
    </div>
  );
}
