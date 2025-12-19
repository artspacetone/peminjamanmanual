import React, { useEffect, useState } from 'react';
import { initializeAudio, isAudioSupported, testAudio } from '../services/audioService';

interface AudioInitializerProps {
  autoTest?: boolean;
  showStatus?: boolean;
}

const AudioInitializer: React.FC<AudioInitializerProps> = ({ 
  autoTest = false, 
  showStatus = false 
}) => {
  const [audioReady, setAudioReady] = useState(false);
  const [audioSupported, setAudioSupported] = useState(false);

  useEffect(() => {
    // Check audio support
    setAudioSupported(isAudioSupported());
    
    // Try to initialize audio
    const ready = initializeAudio();
    setAudioReady(ready);
    
    // Auto test if enabled
    if (autoTest && ready) {
      setTimeout(() => testAudio(), 1000);
    }
  }, [autoTest]);

  const handleTestClick = () => {
    testAudio();
  };

  if (!showStatus) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 border border-gray-700 shadow-lg">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${audioReady ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <div className="text-white text-sm">
            <div className="font-medium">Audio System</div>
            <div className="text-xs text-gray-400">
              {audioSupported 
                ? (audioReady ? 'Ready' : 'Initializing...') 
                : 'Not supported'}
            </div>
          </div>
          {audioReady && (
            <button
              onClick={handleTestClick}
              className="ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              Test
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioInitializer;