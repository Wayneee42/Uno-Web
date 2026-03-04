import { useGame } from '../contexts/GameContext';

export default function Game() {
  const { gameState, leaveRoom } = useGame();

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-white">Loading game...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-white">
        <h2 className="text-2xl font-bold mb-4">Game Phase: {gameState.phase}</h2>
        <p>Current Player: {gameState.currentPlayerIndex}</p>
        <p>Your Index: {gameState.myPlayerIndex}</p>
        <p>Top Card: {gameState.topCard.color} {gameState.topCard.value}</p>
        <p>Your Hand: {gameState.myPlayer.hand.length} cards</p>
        <p>Draw Pile: {gameState.drawPileCount} cards</p>
        {gameState.activeColor && <p>Active Color: {gameState.activeColor}</p>}
        {gameState.pendingPenalty > 0 && <p>Pending Penalty: +{gameState.pendingPenalty}</p>}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {gameState.myPlayer.hand.map((card) => (
          <div
            key={card.id}
            className="p-2 rounded border border-white text-white"
            style={{ backgroundColor: card.color === 'Wild' ? '#333' : card.color.toLowerCase() }}
          >
            {card.color} {card.value}
          </div>
        ))}
      </div>

      <button
        onClick={leaveRoom}
        className="mt-8 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
      >
        Leave Game
      </button>
    </div>
  );
}
