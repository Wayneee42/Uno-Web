import { describe, expect, it, vi } from 'vitest';
import type { Player } from '@uno-web/shared';
import { GameManager } from '../game/GameManager.js';
import { HistoryService } from './HistoryService.js';
import { InMemoryHistoryRepository } from './InMemoryHistoryRepository.js';
import type { ArchivedMatch } from './types.js';

function makePlayer(id: string, profileId: string, name: string): Player {
  return {
    id,
    profileId,
    sessionId: `session_${id.padEnd(20, 'x')}`,
    name,
    hand: [],
    status: 'waiting',
    hasCalledUno: false,
    socketId: `socket-${id}`,
    connected: true,
  };
}

describe('HistoryService', () => {
  it('persists completed and interrupted matches using the agreed statistics', async () => {
    const repository = new InMemoryHistoryRepository();
    const history = new HistoryService(repository);
    const first = await history.initializeProfile();
    const second = await history.initializeProfile();
    expect(first.profile?.persistent).toBe(true);
    expect(second.profile?.persistent).toBe(true);

    const manager = new GameManager();
    const players = [
      makePlayer('p1', first.profile!.id, 'Alice'),
      makePlayer('p2', second.profile!.id, 'Bob'),
    ];
    const completed = manager.createGame('ROOM01', players, 'p1');
    completed.phase = 'finished';
    completed.winnerId = 'p1';
    history.observeGame(completed);

    const interrupted = manager.createGame('ROOM02', players, 'p1');
    history.interruptGame(interrupted, 'player_exit', 'p1');
    await new Promise(resolve => setTimeout(resolve, 0));

    const stats = await history.getProfileStats(first.profile!.id);
    expect(stats.stats).toMatchObject({
      startedGames: 2,
      completedGames: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      voluntaryExits: 1,
      voluntaryExitRate: 0.5,
    });

    const page = await history.listMatches(first.profile!.id);
    expect(page.page.matches).toHaveLength(2);
    expect(page.page.matches.map(match => match.status).sort()).toEqual(['completed', 'interrupted']);
  });

  it('invalidates the previous recovery code after rotation', async () => {
    const history = new HistoryService(new InMemoryHistoryRepository());
    const created = await history.initializeProfile();
    const oldCode = created.recoveryCode!;
    const rotated = await history.rotateRecoveryCode(created.profile!.id);

    expect(rotated.success).toBe(true);
    expect((await history.initializeProfile(oldCode)).success).toBe(false);
    const restored = await history.initializeProfile(rotated.recoveryCode);
    expect(restored.profile?.id).toBe(created.profile?.id);
  });

  it('waits for a pending archive before serving immediate history reads', async () => {
    const repository = new InMemoryHistoryRepository();
    const history = new HistoryService(repository);
    const profile = await history.initializeProfile();
    const manager = new GameManager();
    const state = manager.createGame(
      'ROOM03',
      [makePlayer('p1', profile.profile!.id, 'Alice')],
      'p1'
    );
    state.phase = 'finished';
    state.winnerId = 'p1';

    let releaseSave = () => {};
    const saveGate = new Promise<void>(resolve => {
      releaseSave = resolve;
    });
    const saveMatch = repository.saveMatch.bind(repository);
    vi.spyOn(repository, 'saveMatch').mockImplementationOnce(async (match: ArchivedMatch) => {
      await saveGate;
      await saveMatch(match);
    });

    history.observeGame(state);
    const pagePromise = history.listMatches(profile.profile!.id);
    await Promise.resolve();
    releaseSave();

    const page = await pagePromise;
    expect(page.page.matches).toHaveLength(1);
    expect(page.page.matches[0].status).toBe('completed');
  });

  it('ignores a malformed pagination cursor without degrading history', async () => {
    const history = new HistoryService(new InMemoryHistoryRepository());
    const profile = await history.initializeProfile();
    const cursor = Buffer.from(
      JSON.stringify({ startedAt: Date.now(), id: 'not-a-uuid' })
    ).toString('base64url');

    const result = await history.listMatches(profile.profile!.id, 20, cursor);

    expect(result.page.matches).toEqual([]);
    expect(result.historyAvailable).toBe(true);
  });
});
