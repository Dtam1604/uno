import React, { useState } from 'react';
import { Card, CardColor } from './types/Card';
import { useGameState } from './hooks/useGameState';
import { useAI } from './hooks/useAI';
import { useRoomSystem } from './hooks/useRoomSystem';
import { canPlayCard } from './utils/cardUtils';
import GameBoard from './components/GameBoard';
import PlayerHand from './components/PlayerHand';
import GameStatus from './components/GameStatus';
import RoomBrowser from './components/RoomSystem/RoomBrowser';
import RoomLobby from './components/RoomSystem/RoomLobby';

type AppState = 'room-browser' | 'room-lobby' | 'game';

function App() {
  const [appState, setAppState] = useState<AppState>('room-browser');
  const { gameState, drawCard, playCard, callUno, resetGame, initializeMultiplayerGame } = useGameState();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Room system
  const {
    currentRoom,
    currentPlayerId,
    isHost,
    activeRooms,
    loading,
    error,
    isConnected,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPlayer,
    startGame,
    toggleReady,
    loadActiveRooms,
    clearError
  } = useRoomSystem();

  // AI logic (only when in single player mode and for non-human players)
  useAI(gameState, { playCard, drawCard, callUno });

  // Handle room events
  React.useEffect(() => {
    if (currentRoom) {
      if (currentRoom.gameInProgress && appState !== 'game') {
        // Initialize multiplayer game when game starts
        if (currentPlayerId) {
          initializeMultiplayerGame(currentRoom, currentPlayerId);
        }
        setAppState('game');
      } else if (!currentRoom.gameInProgress && appState === 'game') {
        setAppState('room-lobby');
      } else if (appState === 'room-browser') {
        setAppState('room-lobby');
      }
    } else {
      setAppState('room-browser');
    }
  }, [currentRoom, appState, currentPlayerId, initializeMultiplayerGame]);

  // Room system handlers
  const handleCreateRoom = async (data: any) => {
    const result = await createRoom(data);
    return result;
  };

  const handleJoinRoom = async (data: any) => {
    const result = await joinRoom(data);
    return result;
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setAppState('room-browser');
  };

  const handleStartGame = async () => {
    const success = await startGame();
    if (success && currentRoom && currentPlayerId) {
      // Initialize the game with room players
      initializeMultiplayerGame(currentRoom, currentPlayerId);
      setAppState('game');
    }
  };

  // Game handlers
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  // In multiplayer mode, find the human player by currentPlayerId
  // In single player mode, find the human player by isHuman flag
  const humanPlayer = gameState.isMultiplayer 
    ? gameState.players.find(p => p.id === currentPlayerId)
    : gameState.players.find(p => p.isHuman);
    
  const otherPlayers = gameState.isMultiplayer
    ? gameState.players.filter(p => p.id !== currentPlayerId)
    : gameState.players.filter(p => !p.isHuman);
    
  const isHumanTurn = gameState.isMultiplayer 
    ? currentPlayer?.id === currentPlayerId
    : currentPlayer?.isHuman;

  const playableCards = humanPlayer ? humanPlayer.cards.filter(card => 
    canPlayCard(card, gameState.topCard, gameState.wildColor) &&
    (!gameState.isBlockAllActive || card.type === 'number')
  ) : [];

  const handleCardClick = (card: Card) => {
    if (!isHumanTurn || !playableCards.some(c => c.id === card.id)) return;

    if (card.type === 'wild' || card.type === 'wild-draw-four') {
      setSelectedCard(card);
      setShowColorPicker(true);
    } else {
      if (humanPlayer) {
        playCard(humanPlayer.id, card);
        setSelectedCard(null);
      }
    }
  };

  const handleColorChoice = (color: CardColor) => {
    if (selectedCard && humanPlayer) {
      playCard(humanPlayer.id, selectedCard, color);
      setSelectedCard(null);
    }
    setShowColorPicker(false);
  };

  const handleDrawCard = () => {
    if (isHumanTurn && humanPlayer) {
      drawCard(humanPlayer.id, 1);
    }
  };

  const handleUnoCall = () => {
    if (humanPlayer) {
      callUno(humanPlayer.id);
    }
  };

  const handleGameRestart = () => {
    resetGame();
    setAppState('room-lobby');
  };

  // Render based on app state
  if (appState === 'room-browser') {
    return (
      <RoomBrowser
        activeRooms={activeRooms}
        loading={loading}
        error={error}
        isConnected={isConnected}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onRefresh={loadActiveRooms}
        onClearError={clearError}
      />
    );
  }

  if (appState === 'room-lobby' && currentRoom && currentPlayerId) {
    return (
      <RoomLobby
        room={currentRoom}
        currentPlayerId={currentPlayerId}
        isHost={isHost}
        onLeaveRoom={handleLeaveRoom}
        onKickPlayer={kickPlayer}
        onStartGame={handleStartGame}
        onToggleReady={toggleReady}
      />
    );
  }

  // Game view - now properly integrated with multiplayer
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width=%2260%22%20height=%2260%22%20viewBox=%220%200%2060%2060%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg%20fill=%22none%22%20fill-rule=%22evenodd%22%3E%3Cg%20fill=%22%23ffffff%22%20fill-opacity=%220.1%22%3E%3Ccircle%20cx=%2230%22%20cy=%2230%22%20r=%224%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] bg-repeat" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 tracking-tight">
            UNO Online
          </h1>
          <p className="text-white/70 text-lg">
            {currentRoom ? `Phòng: ${currentRoom.name} (${gameState.players.length} người chơi)` : 'Experience the classic card game with enhanced features'}
          </p>
          {!isConnected && (
            <div className="mt-2 text-red-300 text-sm">
              ⚠️ Mất kết nối server - Game có thể không hoạt động bình thường
            </div>
          )}
          {gameState.isMultiplayer && (
            <div className="mt-2 text-blue-300 text-sm">
              🌐 Chế độ nhiều người chơi - Chờ lượt của bạn để đánh bài
            </div>
          )}
        </div>

        {/* Game Status */}
        <div className="mb-6">
          <GameStatus 
            gameState={gameState}
            onUnoCall={handleUnoCall}
            onRestart={handleGameRestart}
          />
        </div>

        {/* Other Players */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {otherPlayers.map(player => (
            <PlayerHand
              key={player.id}
              player={player}
              isCurrentPlayer={currentPlayer?.id === player.id}
              playableCards={[]}
            />
          ))}
        </div>

        {/* Game Board */}
        <div className="mb-8">
          <GameBoard
            gameState={gameState}
            onDrawCard={handleDrawCard}
            onColorChoice={handleColorChoice}
            showColorPicker={showColorPicker}
          />
        </div>

        {/* Human Player Hand */}
        {humanPlayer && (
          <PlayerHand
            player={humanPlayer}
            isCurrentPlayer={isHumanTurn}
            playableCards={playableCards}
            onCardClick={handleCardClick}
            selectedCard={selectedCard}
          />
        )}

        {/* Instructions */}
        <div className="mt-8 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
          <h3 className="text-white font-semibold mb-2">How to Play:</h3>
          <ul className="text-white/70 text-sm space-y-1">
            <li>• Match cards by color, number, or symbol</li>
            <li>• Use action cards strategically (Skip, Reverse, Draw 2, etc.)</li>
            <li>• Call UNO when you have one card left</li>
            <li>• New cards: SwapHands, DrawMinusTwo, ShuffleMyHand, BlockAll</li>
            <li>• First player to run out of cards wins!</li>
            {gameState.isMultiplayer ? (
              <li>• <strong>Multiplayer:</strong> Chờ đến lượt của bạn để đánh bài. Tất cả người chơi đều là người thật!</li>
            ) : (
              <li>• <strong>Single Player:</strong> Play against AI opponents</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;