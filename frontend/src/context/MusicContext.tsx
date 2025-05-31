import React, { createContext, useContext, useState, useEffect, type ReactNode, useRef, useCallback } from 'react';
import { musicTracks, type MusicTrack, DEFAULT_MUSIC_ID, DEFAULT_VOLUME } from '../data/musicTracks';

const LOCAL_STORAGE_MUSIC_KEY_PREFIX = 'dotverse_music_';
const CURRENT_TRACK_KEY = `${LOCAL_STORAGE_MUSIC_KEY_PREFIX}currentTrackId`;
const VOLUME_KEY = `${LOCAL_STORAGE_MUSIC_KEY_PREFIX}volume`;
const IS_MUTED_KEY = `${LOCAL_STORAGE_MUSIC_KEY_PREFIX}isMuted`;
const HAS_INTERACTED_KEY = `${LOCAL_STORAGE_MUSIC_KEY_PREFIX}hasInteracted`;
const SHOULD_PLAY_KEY = `${LOCAL_STORAGE_MUSIC_KEY_PREFIX}shouldPlay`;


interface MusicContextType {
  currentTrack: MusicTrack | undefined;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  availableTracks: MusicTrack[];
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  selectTrack: (trackId: string) => void;
  isPlayerVisible: boolean;
  togglePlayerVisibility: () => void;
  hasInteracted: boolean;
  setHasInteracted: () => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};

export const MusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [currentTrackId, setCurrentTrackId] = useState<string>(() => localStorage.getItem(CURRENT_TRACK_KEY) || DEFAULT_MUSIC_ID);
  const [isPlaying, setIsPlaying] = useState<boolean>(() => localStorage.getItem(SHOULD_PLAY_KEY) === 'true');
  const [volume, setVolumeState] = useState<number>(() => parseFloat(localStorage.getItem(VOLUME_KEY) || DEFAULT_VOLUME.toString()));
  const [isMuted, setIsMutedState] = useState<boolean>(() => localStorage.getItem(IS_MUTED_KEY) === 'true');
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [hasInteracted, setHasInteractedState] = useState<boolean>(() => localStorage.getItem(HAS_INTERACTED_KEY) === 'true');
  const [shouldPlayAfterTrackChange, setShouldPlayAfterTrackChange] = useState(false);

  const currentTrack = musicTracks.find(track => track.id === currentTrackId);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.onplay = () => setIsPlaying(true);
      audioRef.current.onpause = () => setIsPlaying(false);
      audioRef.current.onvolumechange = () => {
        if (audioRef.current) {
          setVolumeState(audioRef.current.volume);
          setIsMutedState(audioRef.current.muted);
        }
      };
    }
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CURRENT_TRACK_KEY, currentTrackId);
    if (audioRef.current && currentTrack) {
      audioRef.current.src = currentTrack.src;
      audioRef.current.load();
      if (shouldPlayAfterTrackChange && hasInteracted) {
        audioRef.current.play().catch(e => console.warn("Autoplay after track change failed:", e));
        setShouldPlayAfterTrackChange(false);
      }
    }
  }, [currentTrackId, currentTrack, hasInteracted, shouldPlayAfterTrackChange]);

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, volume.toString());
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    localStorage.setItem(IS_MUTED_KEY, isMuted.toString());
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem(SHOULD_PLAY_KEY, isPlaying.toString());
  }, [isPlaying]);

  useEffect(() => {
    localStorage.setItem(HAS_INTERACTED_KEY, hasInteracted.toString());
    if (hasInteracted && isPlaying && audioRef.current?.paused) {
        audioRef.current.play().catch(e => console.warn("Autoplay on interaction failed:", e));
    }
  }, [hasInteracted, isPlaying]);

  const play = useCallback(() => {
    if (!hasInteracted) {
      setIsPlaying(true);
      return;
    }
    if (audioRef.current && audioRef.current.src) {
      audioRef.current.play().catch(e => console.warn("Play failed:", e));
    }
    setIsPlaying(true);
  }, [hasInteracted]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const setVolumeCallback = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
  }, []);

  const toggleMuteCallback = useCallback(() => {
    setIsMutedState(prev => !prev);
  }, []);

  const selectTrackCallback = useCallback((trackId: string) => {
    if (trackId !== currentTrackId) {
      if (isPlaying) {
        setShouldPlayAfterTrackChange(true);
      }
      setCurrentTrackId(trackId);
    }
  }, [isPlaying, currentTrackId]);

  const togglePlayerVisibilityCallback = useCallback(() => setIsPlayerVisible(prev => !prev), []);
  const setHasInteractedCallback = useCallback(() => {
    if (!hasInteracted) setHasInteractedState(true);
  }, [hasInteracted]);

  const value = {
    currentTrack, isPlaying, volume, isMuted, availableTracks: musicTracks,
    play, pause, togglePlayPause, setVolume: setVolumeCallback, toggleMute: toggleMuteCallback,
    selectTrack: selectTrackCallback, isPlayerVisible, togglePlayerVisibility: togglePlayerVisibilityCallback,
    hasInteracted, setHasInteracted: setHasInteractedCallback,
  };

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
};