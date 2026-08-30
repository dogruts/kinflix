export type SortOption = "title_asc" | "year_desc" | "rating_desc";
export type TabState = "home" | "library" | "collections" | "watchlist" | "yts" | "foryou";
export type Lang = "tr" | "en";
export type ParsedCue = { start: number; end: number; text: string };
export type SubtitleTrack = { id: string; url: string; label: string; srtContent: string; offset: number; cues: ParsedCue[] };

export type ChatMessage = {
  id: string;
  sender: "me" | "peer";
  author?: string;
  type: "text" | "image";
  content: string;
  timestamp: number;
  reactions?: Record<string, number>;
};
