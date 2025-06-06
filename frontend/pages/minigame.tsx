import React from 'react';
import MinigameLobby from '../components/minigame/MinigameLobby';

const MinigamePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900">
      <MinigameLobby />
    </div>
  );
};

export default MinigamePage;
