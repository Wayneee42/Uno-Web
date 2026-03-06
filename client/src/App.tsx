import { GameProvider, useGame } from './contexts/GameContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import Lobby from './pages/Lobby';
import Game from './pages/Game';

function App() {
  return (
    <GameProvider>
      <AppErrorBoundary>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
          <AppContent />
        </div>
      </AppErrorBoundary>
    </GameProvider>
  );
}

function AppContent() {
  const { gameState } = useGame();
  return gameState ? <Game /> : <Lobby />;
}

export default App;
