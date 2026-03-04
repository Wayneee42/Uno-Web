import { useState } from 'react';
 import { useGame } from '../contexts/GameContext';

 export default function Lobby() {
   const { isConnected, room, createRoom, joinRoom, setReady, startGame, playerId } = useGame();
   const [playerName, setPlayerName] = useState('');
   const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const handleCreateRoom = async () => {
     if (!playerName.trim()) {
       setError('Please enter your name');
       return;
     }
     setError('');
     await createRoom(playerName.trim());
   };

   const handleJoinRoom = async () => {
    if (!playerName.trim() || !roomId.trim()) {
       setError('Please enter your name and room ID');
       return;
     }
     setError('');
     const result = await joinRoom(roomId.trim().toUpperCase(), playerName.trim());
     if (!result.success) {
       setError(result.error || 'Failed to join room');
     }
   };

  const handleReady = () => {
    setReady(true);
  };

  const handleStartGame = async () => {
    const result = await startGame();
    if (!result.success) {
      setError(result.error || 'Failed to start game');
    }
  };

  const isPlayerReady = room?.players.find(p => p.id === playerId)?.isReady;
  const isHost = room?.players.find(p => p.id === playerId)?.isHost;
  const allReady = room?.players.every(p => p.isReady);
  const canStart = room?.canStart && allReady;

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-white">Connecting to server...</div>
      </div>
    );
  }

  if (room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-slate-800 rounded-lg p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Room: {room.roomId}</h2>
          <p className="text-slate-400 mb-6">
            Players ({room.players.length}/{room.maxPlayers})
          </p>

          <div className="space-y-3 mb-6">
            {room.players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-slate-700 rounded-lg p-3"
              >
                <span className="text-white font-medium">
                  {player.name}
                  {player.isHost && ' (Host)'}
                </span>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    player.isReady ? 'bg-green-600 text-white' : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {player.isReady ? 'Ready' : 'Waiting'}
                </span>
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-500/20 text-red-400 rounded p-3 mb-4">{error}</div>
          )}

          <div className="space-y-3">
            {!isPlayerReady ? (
              <button
                onClick={handleReady}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Ready
              </button>
            ) : (
              <div className="text-center text-green-400 py-3">Waiting for other players...</div>
            )}

            {isHost && canStart && (
              <button
                onClick={handleStartGame}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Start Game
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-5xl font-bold text-white mb-8">UNO</h1>

      <div className="bg-slate-800 rounded-lg p-8 w-full max-w-md">
        {error && (
          <div className="bg-red-500/20 text-red-400 rounded p-3 mb-4">{error}</div>
        )}

        {!showJoinForm ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={20}
            />
            <button
              onClick={handleCreateRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Create Room
            </button>
            <button
              onClick={() => setShowJoinForm(true)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Join Room
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={20}
            />
            <input
              type="text"
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="w-full bg-slate-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={6}
            />
            <button
              onClick={handleJoinRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Join
            </button>
            <button
              onClick={() => setShowJoinForm(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
