export interface MusicTrack {
  id: string;
  name: string;
  src: string;
  isFree: boolean;
  artist?: string;
}

export const musicTracks: MusicTrack[] = [
  { id: 'default_theme', name: 'DotVerse Anthem', src: '/assets/music/default_theme.mp3', isFree: true, artist: 'System' },
  { id: 'parrot', name: 'Parrot', src: '/assets/music/parrot.mp3', isFree: true, artist: 'System' },
];

export const DEFAULT_MUSIC_ID = musicTracks[0].id;
export const DEFAULT_VOLUME = 0.3;