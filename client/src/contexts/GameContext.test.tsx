import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameProvider, useGame } from './GameContext';

type HandlerMap = Record<string, (...args: any[]) => void>;

const handlers: HandlerMap = {};

const mockSocket = {
  id: 'sock-1',
  on: (event: string, handler: (...args: any[]) => void) => {
    handlers[event] = handler;
  },
  emit: (event: string, payload: any, callback?: (...args: any[]) => void) => {
    if (event === 'createRoom' && callback) {
      callback({ roomId: 'ROOM1', players: [], minPlayers: 3, maxPlayers: 4, canStart: false });
    }
  },
  close: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}));

function Harness() {
  const { createRoom, room } = useGame();
  return (
    <div>
      <button onClick={() => createRoom('Alice')}>Create</button>
      <div data-testid="room-id">{room?.roomId ?? ''}</div>
    </div>
  );
}

describe('GameContext', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach(key => delete handlers[key]);
  });

  it('creates a room and updates state', async () => {
    const user = userEvent.setup();
    render(
      <GameProvider>
        <Harness />
      </GameProvider>
    );

    handlers.connect?.();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByTestId('room-id').textContent).toBe('ROOM1');
  });
});
