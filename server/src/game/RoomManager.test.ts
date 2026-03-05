import { describe, expect, it } from 'vitest';
import { RoomManager } from './RoomManager';

describe('RoomManager', () => {
  it('creates and manages rooms', () => {
    const manager = new RoomManager();
    const { room } = manager.createRoom('Alice', 'p1');
    expect(room.roomId).toHaveLength(6);

    const join2 = manager.joinRoom(room.roomId, 'Bob', 'p2');
    const join3 = manager.joinRoom(room.roomId, 'Cara', 'p3');

    expect(join2.success).toBe(true);
    expect(join3.success).toBe(true);

    manager.setReady('p1', true);
    manager.setReady('p2', true);
    manager.setReady('p3', true);

    expect(manager.canStartGame('p1')).toBe(true);
  });
});
