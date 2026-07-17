import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameProvider, useGame } from './GameContext';

type HandlerMap = Record<string, (...args: any[]) => void>;

const handlers: HandlerMap = {};
const defaultProfileResponse = () => ({
  success: true,
  profile: {
    id: 'profile-1',
    displayName: null,
    persistent: true,
    createdAt: Date.now(),
  },
  recoveryCode: `uno_${'a'.repeat(43)}`,
  historyAvailable: true,
});
let initializeProfileResponder = (_payload: any) => defaultProfileResponse();

const mockSocket = {
  id: 'sock-live',
  on: (event: string, handler: (...args: any[]) => void) => {
    handlers[event] = handler;
  },
  emit: (event: string, payload: any, callback?: (...args: any[]) => void) => {
    if (event === 'initializeProfile' && callback) {
      callback(initializeProfileResponder(payload));
      return;
    }

    if (event === 'createRoom' && callback) {
      callback({
        success: true,
        room: { roomId: 'ROOM1', players: [], minPlayers: 2, maxPlayers: 4, canStart: false },
        playerId: 'player-1',
        sessionId: 'session-1',
      });
      return;
    }

    if (event === 'resumeSession' && callback) {
      callback({
        success: true,
        playerId: 'player-2',
        sessionId: payload.sessionId,
        room: {
          roomId: 'ROOM2',
          players: [{ id: 'player-2', name: 'Bob', isReady: true, isHost: true, connected: true }],
          minPlayers: 2,
          maxPlayers: 4,
          canStart: false,
        },
      });
    }
  },
  close: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}));

function Harness() {
  const { createRoom, room, playerId, globalError } = useGame();
  return (
    <div>
      <button onClick={() => createRoom('Alice')}>Create</button>
      <div data-testid="room-id">{room?.roomId ?? ''}</div>
      <div data-testid="player-id">{playerId ?? ''}</div>
      <div data-testid="global-error">{globalError?.message ?? ''}</div>
    </div>
  );
}

describe('GameContext', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach(key => delete handlers[key]);
    window.localStorage.clear();
    initializeProfileResponder = () => defaultProfileResponse();
  });

  it('creates a room, persists the session, and updates state', async () => {
    const user = userEvent.setup();
    render(
      <GameProvider>
        <Harness />
      </GameProvider>
    );

    act(() => {
      handlers.connect?.();
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create' }));
    });
    expect(screen.getByTestId('room-id').textContent).toBe('ROOM1');
    expect(screen.getByTestId('player-id').textContent).toBe('player-1');
    expect(window.localStorage.getItem('uno-session')).toContain('session-1');
    expect(window.localStorage.getItem('uno-profile')).toContain('uno_');
  });

  it('restores a stored session on reconnect', async () => {
    window.localStorage.setItem('uno-session', JSON.stringify({ playerId: 'player-2', sessionId: 'session-restore' }));

    render(
      <GameProvider>
        <Harness />
      </GameProvider>
    );

    act(() => {
      handlers.connect?.();
    });

    expect(await screen.findByTestId('room-id')).toHaveTextContent('ROOM2');
    expect(screen.getByTestId('player-id')).toHaveTextContent('player-2');
  });

  it('surfaces socket errors through global UI state', async () => {
    render(
      <GameProvider>
        <Harness />
      </GameProvider>
    );

    act(() => {
      handlers.connect?.();
      handlers.error?.({ code: 'INTERNAL_ERROR', message: 'Server encountered an unexpected error.' });
    });

    expect(await screen.findByTestId('global-error')).toHaveTextContent('Server encountered an unexpected error.');
  });

  it('replaces a definitively invalid saved recovery code with a new profile', async () => {
    const invalidCode = `uno_${'x'.repeat(43)}`;
    const freshCode = `uno_${'b'.repeat(43)}`;
    window.localStorage.setItem('uno-profile', JSON.stringify({ recoveryCode: invalidCode }));
    initializeProfileResponder = payload =>
      payload.recoveryCode
        ? {
            success: false,
            error: 'Recovery code not found',
            historyAvailable: true,
          }
        : {
            ...defaultProfileResponse(),
            profile: {
              ...defaultProfileResponse().profile,
              id: 'profile-fresh',
            },
            recoveryCode: freshCode,
          };

    render(
      <GameProvider>
        <Harness />
      </GameProvider>
    );

    act(() => {
      handlers.connect?.();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('uno-profile')).toContain(freshCode);
    });
    expect(window.localStorage.getItem('uno-profile')).not.toContain(invalidCode);
  });
});
