import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryView } from './HistoryView';
import { ProfileView } from './ProfileView';

const mockUseGame = vi.fn();

vi.mock('../contexts/GameContext', () => ({
  useGame: () => mockUseGame(),
}));

const participants = [
  {
    playerId: 'p1',
    displayName: 'Alice',
    seatIndex: 0,
    result: 'none' as const,
    finalHandCount: 4,
    finalHandScore: 32,
    voluntarilyLeft: true,
    isCurrentProfile: true,
  },
  {
    playerId: 'p2',
    displayName: 'Bob',
    seatIndex: 1,
    result: 'none' as const,
    finalHandCount: 2,
    finalHandScore: 10,
    voluntarilyLeft: false,
    isCurrentProfile: false,
  },
];

describe('history and profile views', () => {
  beforeEach(() => {
    mockUseGame.mockReset();
  });

  it('shows interrupted matches without inventing a settlement order', async () => {
    const user = userEvent.setup();
    const match = {
      id: '47cc9885-2892-48ea-9a90-beb264317f95',
      roomId: 'ROOM01',
      status: 'interrupted' as const,
      endReason: 'player_exit' as const,
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_090_000,
      durationMs: 90_000,
      participants,
    };
    mockUseGame.mockReturnValue({
      historyAvailable: true,
      profile: { id: 'profile-1', displayName: 'Alice' },
      loadMatchHistory: vi.fn().mockResolvedValue({
        success: true,
        page: { matches: [match], nextCursor: null },
      }),
      loadMatchDetails: vi.fn().mockResolvedValue({
        success: true,
        match: {
          ...match,
          events: [
            {
              sequence: 1,
              type: 'game_started',
              message: 'Game started.',
              createdAt: match.startedAt,
            },
          ],
        },
      }),
    });

    await act(async () => {
      render(<HistoryView onBack={vi.fn()} />);
      await Promise.resolve();
    });
    await act(async () => {
      await user.click(await screen.findByText('Interrupted'));
      await Promise.resolve();
    });

    expect(await screen.findByText('Settlement')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getByText('Game started.')).toBeInTheDocument();
  });

  it('keeps the recovery code hidden and confirms rotation', async () => {
    const user = userEvent.setup();
    const rotateRecoveryCode = vi.fn().mockResolvedValue({
      success: true,
      recoveryCode: `uno_${'b'.repeat(43)}`,
    });
    mockUseGame.mockReturnValue({
      historyAvailable: true,
      profile: { id: 'profile-1', displayName: 'Alice' },
      recoveryCode: `uno_${'a'.repeat(43)}`,
      importProfile: vi.fn(),
      rotateRecoveryCode,
      loadProfileStats: vi.fn().mockResolvedValue({
        success: true,
        stats: {
          startedGames: 4,
          completedGames: 2,
          wins: 1,
          losses: 1,
          draws: 1,
          voluntaryExits: 1,
          voluntaryExitRate: 0.25,
        },
      }),
    });

    await act(async () => {
      render(<ProfileView onBack={vi.fn()} />);
      await Promise.resolve();
    });

    expect(screen.getByText('************************')).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByLabelText('Show recovery code'));
    });
    expect(screen.getByText(`uno_${'a'.repeat(43)}`)).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Rotate code' }));
    });
    expect(rotateRecoveryCode).not.toHaveBeenCalled();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Confirm rotation' }));
      await Promise.resolve();
    });
    expect(rotateRecoveryCode).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Recovery code rotated/)).toBeInTheDocument();
  });
});
