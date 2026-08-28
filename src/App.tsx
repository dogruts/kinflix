// src/App.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";

const isWeb = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window) && !('__TAURI_IPC__' in window) && !('__TAURI__' in window);

import { getMovieMetadata } from "./tmdb";
import {
  initializeDatabase, getMovies, saveMovie, updateMovieMetadata, updateMovieProgress,
  getSetting, setSetting, removeLibraryFolder, removeMovie, clearDatabase, setWatchlist, type Movie,
} from "./database";
import MovieCard from "./components/MovieCard";

const dict = {
  tr: {
    home: "Ana Sayfa", library: "Tüm Filmler", watchlistTab: "İzlenecekler", sync: "TMDB Güncelle", addLib: "+ Kütüphane Ekle",
    syncing: "Eşitleniyor...", scanning: "Taranıyor...", settings: "Ayarlar",
    emptyLib: "Kütüphanen Bomboş", clickToStart: "Başlamak İçin Tıkla", emptyWatchlist: "İzlenecekler listeniz şu an boş.",
    continue: "Kaldığın Yerden Devam Et", newReleases: "Yeni Çıkanlar", topRated: "En Yüksek Puanlılar",
    watchlist: "İzlenecekler Listem", toWatch: "Sonra İzle", inWatchlist: "Listede",
    search: "Film Ara...", allGenres: "Tüm Türler", sort: "Sırala",
    sortAZ: "A - Z", sortNew: "En Yeni Yıl", sortRating: "En Yüksek Puan",
    play: "Oynat", resume: "Devam Et", info: "ⓘ Daha Fazla Bilgi",
    noOverview: "Bu film için herhangi bir özet bulunamadı.",
    apiToken: "TMDB API Token", libCount: "Kütüphaneler", remove: "KALDIR",
    dangerZone: "Tehlikeli Bölge", resetDb: "Veritabanını Sıfırla",
    language: "Arayüz Dili", subs: "Altyazılar", subOff: "Kapalı",
    party: "Party Watch", joinLabel: "Odaya Katıl (Kod veya IP):", connect: "Bağlan", connected: "Bağlantı Başarılı!", disconnected: "Bağlı Değil",
    random: "🎲 Rastgele", chatMsg: "Mesaj yaz...", send: "Gönder"
  },
  en: {
    home: "Home", library: "All Movies", watchlistTab: "Watchlist", sync: "Sync TMDB", addLib: "+ Add Library",
    syncing: "Syncing...", scanning: "Scanning...", settings: "Settings",
    emptyLib: "Your Library is Empty", clickToStart: "Click to Start", emptyWatchlist: "Your watchlist is empty.",
    continue: "Continue Watching", newReleases: "New Releases", topRated: "Top Rated",
    watchlist: "My Watchlist", toWatch: "Watch Later", inWatchlist: "In Watchlist",
    search: "Search Movies...", allGenres: "All Genres", sort: "Sort By",
    sortAZ: "A - Z", sortNew: "Newest", sortRating: "Highest Rated",
    play: "Play", resume: "Resume", info: "ⓘ More Info",
    noOverview: "No overview found for this movie.",
    apiToken: "TMDB API Token", libCount: "Libraries", remove: "REMOVE",
    dangerZone: "Danger Zone", resetDb: "Reset Database",
    language: "Interface Language", subs: "Subtitles", subOff: "Off",
    party: "Party Watch", joinLabel: "Join Room (Code or IP):", connect: "Connect", connected: "Connected!", disconnected: "Disconnected",
    random: "🎲 Random", chatMsg: "Type a message...", send: "Send"
  }
};

type SortOption = "title_asc" | "year_desc" | "rating_desc";
type TabState = "home" | "library" | "watchlist";
type Lang = "tr" | "en";
type SubtitleTrack = { id: string; url: string; label: string; srtContent: string; offset: number; originalPath?: string };
type ChatMessage = { id: string; sender: "me" | "peer"; type: "text" | "image"; content: string; timestamp: number };

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

function App() {
  const [lang, setLang] = useState<Lang>("tr");
  const t = dict[lang];

  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [activeTab, setActiveTab] = useState<TabState>("home");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localSubs, setLocalSubs] = useState<SubtitleTrack[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); 

  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const [showControls, setShowControls] = useState(true);
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1);
  const [showSubMenu, setShowSubMenu] = useState(false);
  
  const [osResults, setOsResults] = useState<any[]>([]);
  const [isSearchingOS, setIsSearchingOS] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [osError, setOsError] = useState<string | null>(null);

  const [isPartyMenuOpen, setIsPartyMenuOpen] = useState(isWeb); 
  const [peerId, setPeerId] = useState<string>(""); 
  const [localIp, setLocalIp] = useState<string>(""); 
  const [targetAddress, setTargetAddress] = useState(""); 
  const [partyStatus, setPartyStatus] = useState<"disconnected" | "connected">("disconnected");
  const [connMode, setConnMode] = useState<"none" | "webrtc" | "ip">("none");
  
  const [isHost, setIsHost] = useState(!isWeb); 
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const [isMicActive, setIsMicActive] = useState(false);
  const localMicStreamRef = useRef<MediaStream | null>(null);

  const isHostRef = useRef(!isWeb);
  const partyStatusRef = useRef<"disconnected" | "connected">("disconnected");
  const connModeRef = useRef<"none" | "webrtc" | "ip">("none");
  const targetAddressRef = useRef("");

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null); 
  const callRef = useRef<MediaConnection | null>(null); 
  const voiceCallRef = useRef<MediaConnection | null>(null); 
  const wsRef = useRef<WebSocket | null>(null);

  let hideControlsTimeout = useRef<number | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("title_asc");
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [tmdbToken, setTmdbToken] = useState("");

  const libraries = useMemo(() => Array.from(new Set(movies.map(m => m.folder_path))), [movies]);
  const allGenres = useMemo(() => {
    const genreSet = new Set<string>();
    movies.forEach(m => { if (m.genres) m.genres.split(", ").forEach(g => genreSet.add(g)); });
    return Array.from(genreSet).sort();
  }, [movies]);

  const collections = useMemo(() => {
    const map = new Map<string, Movie[]>();
    movies.forEach(m => {
      if (m.collection_name) {
        if (!map.has(m.collection_name)) map.set(m.collection_name, []);
        map.get(m.collection_name)!.push(m);
      }
    });
    return Array.from(map.entries())
      .filter(([_, items]) => items.length > 1) 
      .map(([name, items]) => ({ name, movies: items.sort((a,b) => (a.year||0) - (b.year||0)) }));
  }, [movies]);

  const continueWatching = useMemo(() => movies.filter(m => m.progress && m.progress > 5 && (m.is_watched || 0) === 0).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")), [movies]);
  const watchListMovies = useMemo(() => movies.filter(m => m.watchlist === 1).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")), [movies]);
  
  const topRated = useMemo(() => {
    const top50 = [...movies].filter(m => m.rating && m.rating > 0).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 50);
    return shuffleArray(top50).slice(0, 15);
  }, [movies]);

  const newReleases = useMemo(() => {
    const new50 = [...movies].filter(m => m.year).sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 50);
    return shuffleArray(new50).slice(0, 15);
  }, [movies]);

  const homeGenres = useMemo(() => {
    const randomGenres = shuffleArray(allGenres).slice(0, 3);
    return randomGenres.map(genre => {
      const genreMovies = movies.filter(m => m.genres?.includes(genre));
      return { genre, movies: shuffleArray(genreMovies).slice(0, 15) };
    }).filter(g => g.movies.length > 0);
  }, [movies, allGenres]);

  const userStats = useMemo(() => {
    const watched = movies.filter(m => m.is_watched === 1);
    const totalTime = watched.reduce((acc, m) => acc + (m.runtime || 0), 0);
    const hours = Math.floor(totalTime / 60);
    const genreCounts: Record<string, number> = {};
    watched.forEach(m => {
      if (m.genres) m.genres.split(", ").forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
    });
    const favGenre = Object.entries(genreCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || "Yok";
    return { total: movies.length, watchedCount: watched.length, hours, favGenre };
  }, [movies]);

  const heroMovies = useMemo(() => shuffleArray(movies.filter(m => m.backdrop_url)).slice(0, 10), [movies]);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (heroMovies.length <= 1 || activeTab !== "home" || isPlaying || selectedMovie) return;
    const interval = setInterval(() => { setHeroIndex(prev => (prev + 1) % heroMovies.length); }, 8000);
    return () => clearInterval(interval);
  }, [heroMovies, activeTab, isPlaying, selectedMovie]);

  const heroMovie = heroMovies[heroIndex] || movies[0];

  // YENİ: URL'DEN OTOMATİK ODAYA KATILMA (Telefondan QR okutunca anında girmek için)
  useEffect(() => {
    if (isWeb) {
      const params = new URLSearchParams(window.location.search);
      const roomCode = params.get('room');
      if (roomCode) {
        setTargetAddress(roomCode);
        connectParty(roomCode);
      }
    }
  }, []);

  // YENİ: TV KUMANDASI (D-PAD) DESTEĞİ
  useEffect(() => {
    const handleTvRemote = (e: KeyboardEvent) => {
      if (!isPlaying || !videoRef.current || isChatOpen) return; // Chat açıksa kumanda oraya çalışsın
      
      switch(e.key) {
        case "ArrowRight":
          handleSeek(videoRef.current.currentTime + 10);
          break;
        case "ArrowLeft":
          handleSeek(videoRef.current.currentTime - 10);
          break;
        case "Enter":
          togglePlay();
          break;
        case "ArrowUp":
          setVolume(v => {
            const newVol = Math.min(1, v + 0.1);
            if(videoRef.current) videoRef.current.volume = newVol;
            return newVol;
          });
          break;
        case "ArrowDown":
          setVolume(v => {
            const newVol = Math.max(0, v - 0.1);
            if(videoRef.current) videoRef.current.volume = newVol;
            return newVol;
          });
          break;
      }
    };
    
    window.addEventListener("keydown", handleTvRemote);
    return () => window.removeEventListener("keydown", handleTvRemote);
  }, [isPlaying, isChatOpen]);

  useEffect(() => {
    async function loadData() {
      if (!isWeb) {
        import('@tauri-apps/plugin-updater').then(({ check }) => {
          check().then(update => { if (update?.available) setUpdateInfo(update); }).catch(err => console.log("Güncelleme kontrol hatası:", err));
        });
      }

      if (!isWeb) {
        try {
          await initializeDatabase();
          const savedTmdb = await getSetting("tmdb_token");
          if (savedTmdb) setTmdbToken(savedTmdb);
          const savedLang = await getSetting("language");
          if (savedLang) setLang(savedLang as Lang);
          
          import('@tauri-apps/api/core').then(({ invoke }) => {
             invoke<string>("get_local_ip").then(ip => setLocalIp(ip)).catch(() => setLocalIp("Bilinmiyor"));
          });

          const storedMovies = await getMovies();
          setMovies(storedMovies);
          initPeerHost(storedMovies);
        } catch (error) { setError(String(error)); }
      } else {
        initPeerHost([]);
      }

      const savedChat = localStorage.getItem("kinflix_chat_history");
      if (savedChat) setChatMessages(JSON.parse(savedChat));
    }
    loadData();
  }, []);

  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [chatMessages, isChatOpen]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { partyStatusRef.current = partyStatus; }, [partyStatus]);
  useEffect(() => { connModeRef.current = connMode; }, [connMode]);
  useEffect(() => { targetAddressRef.current = targetAddress; }, [targetAddress]);

  const installUpdate = async () => {
    if (!updateInfo || isWeb) return;
    setIsUpdating(true);
    try {
      await updateInfo.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) { alert("Güncelleme yüklenemedi: " + err); setIsUpdating(false); }
  };

  const handleSaveToken = async (val: string) => { setTmdbToken(val); if(!isWeb) await setSetting("tmdb_token", val); };
  const handleSaveLang = async (val: Lang) => { setLang(val); if(!isWeb) await setSetting("language", val); };

  async function chooseFolder() {
    if (isWeb) return;
    setError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;
      await scanFolder(selected);
    } catch (error) { setError(String(error)); }
  }

  async function scanFolder(path: string) {
    if (isWeb) return;
    setScanning(true); setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<Movie[]>("scan_movies", { path });
      for (const movie of result) await saveMovie(movie);
      const scannedPaths = result.map(m => m.video_path);
      const dbMoviesInFolder = (await getMovies()).filter(m => m.folder_path === path);
      for (const dbMovie of dbMoviesInFolder) {
        if (!scannedPaths.includes(dbMovie.video_path)) await removeMovie(dbMovie.video_path);
      }
      setMovies(await getMovies());
    } catch (error) { setError(String(error)); } finally { setScanning(false); }
  }

  async function syncMovieMetadata() {
    if (syncing || isWeb) return;
    if (!tmdbToken) { setIsSettingsOpen(true); return; }
    setSyncing(true); setError(null);
    try {
      const storedMovies = await getMovies();
      for (const movie of storedMovies) {
        try {
          const metadata = await getMovieMetadata(movie.title, movie.year, tmdbToken, lang);
          if (!metadata) continue;
          await updateMovieMetadata(movie.video_path, metadata);
          await new Promise(r => setTimeout(r, 250));
        } catch (err) {}
      }
      setMovies(await getMovies());
    } catch (error) { setError(String(error)); } finally { setSyncing(false); }
  }

  const toggleWatchlist = async (movie: Movie) => {
    if (isWeb) return;
    const newStatus = movie.watchlist ? 0 : 1;
    await setWatchlist(movie.video_path, newStatus);
    setMovies(prev => prev.map(m => m.video_path === movie.video_path ? { ...m, watchlist: newStatus } : m));
    setSelectedMovie(prev => prev ? { ...prev, watchlist: newStatus } : null);
  };

  const playRandomMovie = () => {
    if (movies.length === 0) return;
    const randomMovie = movies[Math.floor(Math.random() * movies.length)];
    setSelectedMovie(randomMovie);
  };

  const parseSubtitle = (content: string, offsetSeconds: number = 0) => {
    let isVtt = content.trim().startsWith("WEBVTT");
    let vtt = "WEBVTT\n\n";
    const lines = content.split('\n');
    const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

    const shiftTime = (h: string, m: string, s: string, ms: string) => {
      let totalMs = parseInt(h)*3600000 + parseInt(m)*60000 + parseInt(s)*1000 + parseInt(ms) + (offsetSeconds * 1000);
      if (totalMs < 0) totalMs = 0;
      const newH = Math.floor(totalMs / 3600000).toString().padStart(2, '0');
      const newM = Math.floor((totalMs % 3600000) / 60000).toString().padStart(2, '0');
      const newS = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '0');
      const newMs = Math.floor(totalMs % 1000).toString().padStart(3, '0');
      return `${newH}:${newM}:${newS}.${newMs}`; 
    };

    for (let line of lines) {
      if (isVtt && line.startsWith("WEBVTT")) continue;
      const match = timeRegex.exec(line);
      if (match) {
        const start = shiftTime(match[1], match[2], match[3], match[4]);
        const end = shiftTime(match[5], match[6], match[7], match[8]);
        vtt += `${start} --> ${end}\n`;
      } else { vtt += line + '\n'; }
    }
    return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
  };

  const changeSubtitle = (idx: number) => {
    setActiveSubIndex(idx);
    setShowSubMenu(false);
    if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("change_sub_index", { activeIndex: idx }); }
  };

  const updateSubDelay = (index: number, delta: number) => {
    setLocalSubs(prev => {
      const newSubs = [...prev];
      const sub = newSubs[index];
      const newOffset = sub.offset + delta;
      URL.revokeObjectURL(sub.url);
      const newUrl = parseSubtitle(sub.srtContent, newOffset);
      newSubs[index] = { ...sub, offset: newOffset, url: newUrl };
      if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs: newSubs, activeIndex: index }); }
      return newSubs;
    });
  };

  const searchStremioSubtitles = async () => {
    if (!selectedMovie) return;
    setIsSearchingOS(true);
    setOsError(null);
    try {
      let cleanQuery = selectedMovie.title.replace(/[\._]/g, ' ').replace(/\b(1080p|720p|480p|2160p|4k|bluray|x264|x265|dual|remux|webrip|hdrip|hdtv|yify|yts)\b.*/i, '').replace(/(\[.*?\]|\(.*?\))/g, '').trim();
      const metaUrl = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(cleanQuery)}.json`;
      const metaRes = await fetch(metaUrl);
      if(!metaRes.ok) throw new Error("Cinemeta çöktü");
      const metaData = await metaRes.json();
      
      let imdbId = null;
      if (metaData.metas && metaData.metas.length > 0) {
        const match = selectedMovie.year ? metaData.metas.find((m:any) => m.year == selectedMovie.year) || metaData.metas[0] : metaData.metas[0];
        imdbId = match.imdb_id || match.id;
      }
      if (!imdbId) { setOsError(`Bulunamadı.`); setIsSearchingOS(false); return; }

      const subRes = await fetch(`https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`);
      if(!subRes.ok) throw new Error("Addon çöktü");
      const subData = await subRes.json();

      if (subData.subtitles && subData.subtitles.length > 0) {
        const targetLang = lang === "tr" ? "tur" : "eng";
        const filtered = subData.subtitles.filter((s:any) => s.lang === targetLang);
        if(filtered.length === 0) { setOsError(`Altyazı bulunamadı.`); setOsResults([]); } 
        else { setOsResults(filtered.slice(0, 10)); }
      } else { setOsError("Altyazı bulunamadı."); }
    } catch (err: any) { setOsError(`Bağlantı Hatası`); }
    setIsSearchingOS(false);
  };

  const downloadStremioSubtitle = async (sub: any) => {
    setDownloadingId(sub.id);
    setOsError(null);
    try {
      const res = await fetch(sub.url);
      const content = await res.text();
      const vttUrl = parseSubtitle(content, 0); 
      setLocalSubs(prev => {
        const newSubs = [...prev, { id: `stremio_${sub.id}`, url: vttUrl, label: `🌐 ${sub.lang.toUpperCase()} - Stremio`, srtContent: content, offset: 0 }];
        setActiveSubIndex(newSubs.length - 1);
        if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs: newSubs, activeIndex: newSubs.length - 1 }); }
        return newSubs;
      });
      setOsResults([]); 
    } catch (err) { setOsError("Altyazı indirilemedi."); } finally { setDownloadingId(null); }
  };

  const saveChatMessage = (msg: ChatMessage) => {
    setChatMessages(prev => {
      const newChat = [...prev, msg];
      localStorage.setItem("kinflix_chat_history", JSON.stringify(newChat));
      return newChat;
    });
  };

  const handleSendChatText = () => {
    if (!chatInput.trim()) return;
    const msg: ChatMessage = { id: Date.now().toString(), sender: "me", type: "text", content: chatInput, timestamp: Date.now() };
    saveChatMessage(msg);
    broadcastEvent("chat_msg", { msg });
    setChatInput("");
  };

  const handleSendChatImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      const msg: ChatMessage = { id: Date.now().toString(), sender: "me", type: "image", content: base64, timestamp: Date.now() };
      saveChatMessage(msg);
      broadcastEvent("chat_msg", { msg });
    };
    reader.readAsDataURL(file);
  };

  const toggleVoiceChat = async () => {
    if (isMicActive) {
      if (localMicStreamRef.current) localMicStreamRef.current.getTracks().forEach(t => t.stop());
      setIsMicActive(false);
      broadcastEvent("voice_chat_closed");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localMicStreamRef.current = stream;
        setIsMicActive(true);
        if (connRef.current && peerRef.current) {
          const call = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'voice_chat' } });
          voiceCallRef.current = call;
        }
      } catch (err) { alert("Mikrofon erişimi reddedildi veya bulunamadı."); }
    }
  };

  const handleIncomingNetworkData = async (data: any, isHostMode: boolean) => {
    if (data.action === "chat_msg") {
      const receivedMsg = data.msg as ChatMessage;
      receivedMsg.sender = "peer"; 
      saveChatMessage(receivedMsg);
    }
    else if (data.action === "voice_chat_closed") { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null; }
    else if (data.action === "catalog" && !isHostMode) setMovies(data.catalog);
    else if (data.action === "request_movie" && isHostMode) startPlayer(data.movie);
    else if (data.action === "load" && !isHostMode) { setSelectedMovie(data.movie); setIsPlaying(true); setIsRemoteStreaming(true); }
    else if (data.action === "sync_subs" && !isHostMode) {
      const guestSubs = data.subs.map((sub: any) => { const vttUrl = parseSubtitle(sub.srtContent, sub.offset); return { ...sub, url: vttUrl }; });
      setLocalSubs(guestSubs); setActiveSubIndex(data.activeIndex);
    }
    else if (data.action === "change_sub_index" && !isHostMode) { setActiveSubIndex(data.activeIndex); }
    else if (data.action === "rate_change" && !isHostMode) {
      if (videoRef.current) videoRef.current.playbackRate = data.rate;
      setPlaybackSpeed(data.rate);
    }
    else if (videoRef.current && !isHostMode) { 
      if (data.action === "play") { videoRef.current.currentTime = data.time; videoRef.current.play().catch(()=>{}); setIsVideoPlaying(true); } 
      else if (data.action === "pause") { videoRef.current.currentTime = data.time; videoRef.current.pause(); setIsVideoPlaying(false); } 
      else if (data.action === "seek") { videoRef.current.currentTime = data.time; setCurrentTime(data.time); }
    }
  };

  // YENİ: KISA KOD KONTROLÜ
  const connectParty = (target: string) => {
    if (!target) return;
    const isIp = target.includes(".") || target.startsWith("http") || target === "localhost";
    if (isIp) { 
      setConnMode("ip"); connectWebSocket(target); 
    } else { 
      setConnMode("webrtc"); 
      // 4 Haneli kod girildiyse başına "kinflix-" ekleyerek bağlan, yoksa olduğu gibi bağlan
      const targetId = target.length === 4 && !isNaN(Number(target)) ? `kinflix-${target}` : target;
      connectPeerJS(targetId); 
    }
  };

  const connectPeerJS = (targetId: string) => {
    if (!peerRef.current) return;
    const conn = peerRef.current.connect(targetId);
    connRef.current = conn;
    conn.on('open', () => { setPartyStatus("connected"); setIsHost(false); setIsPartyMenuOpen(false); });
    conn.on('data', (data) => handleIncomingNetworkData(data, false));
    peerRef.current.on('call', (call) => {
      if (call.metadata?.type === 'voice_chat') {
        call.answer();
        call.on('stream', (audioStream) => { if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = audioStream; remoteAudioRef.current.play().catch(()=>{}); } });
        return;
      }
      call.answer(); 
      callRef.current = call;
      call.on('stream', (remoteMediaStream) => { setRemoteStream(remoteMediaStream); setIsRemoteStreaming(true); setIsPlaying(true); setIsVideoPlaying(true); });
    });
  };

  const connectWebSocket = async (address: string) => {
    if (wsRef.current) wsRef.current.close();
    const hostStatus = (address === localIp || address === "127.0.0.1") && !isWeb; 
    setIsHost(hostStatus);
    let wsUrl = address.startsWith("http") ? address.replace("http://", "ws://").replace("https://", "wss://") + "/ws" : `ws://${address}:8765/ws`;
    let httpBaseUrl = address.startsWith("http") ? address : `http://${address}:8765`;
    if (!hostStatus) {
      try { const res = await fetch(`${httpBaseUrl}/movies`); const remoteMovies: Movie[] = await res.json(); setMovies(remoteMovies); } catch (err) {}
    }
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { setPartyStatus("connected"); setTargetAddress(address); setIsPartyMenuOpen(false); };
    ws.onmessage = (e) => { try { const data = JSON.parse(e.data); handleIncomingNetworkData(data, hostStatus); } catch(err) {} };
    ws.onclose = () => setPartyStatus("disconnected");
    wsRef.current = ws;
  };

const initPeerHost = (currentMovies: Movie[]) => {
    if (peerRef.current) return;
    
    // Rastgele 4 haneli kod (Örn: 5842) üret ve PeerJS ID'si olarak ayarla
    const shortCode = Math.floor(1000 + Math.random() * 9000).toString();
    const customId = isWeb ? undefined : `kinflix-${shortCode}`; 
    
    // YENİ: customId varsa içine yaz, yoksa parantezi boş bırak! TS artık mutlu.
    const peer = customId ? new Peer(customId) : new Peer();
    peer.on('open', (id) => {
      // Ekranda uzun kimliği değil, bizim 4 haneli kodu göster
      setPeerId(isWeb ? id : shortCode);
    });
    
    peer.on('connection', (conn) => {
      setPartyStatus("connected"); setConnMode("webrtc"); connRef.current = conn; 
      if (!isWeb) {
        setIsHost(true);
        conn.on('open', () => { conn.send({ action: "catalog", catalog: currentMovies }); });
      }
      conn.on('data', (data) => handleIncomingNetworkData(data, !isWeb));
    });
    peer.on('call', (call) => {
      if (call.metadata?.type === 'voice_chat') {
        call.answer();
        call.on('stream', (audioStream) => { if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = audioStream; remoteAudioRef.current.play().catch(()=>{}); } });
      }
    });
    peerRef.current = peer;
  };

  const broadcastEvent = (action: string, payload: any = {}) => {
    if (connModeRef.current === 'webrtc' && connRef.current?.open) { connRef.current.send({ action, ...payload }); } 
    else if (connModeRef.current === 'ip' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ action, ...payload })); }
  };

  const handleMovieClick = (movie: Movie) => {
    if (!isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("request_movie", { movie }); } 
    else { setSelectedMovie(movie); }
  };

  const [tauriConvertFileSrc, setTauriConvertFileSrc] = useState<any>(null);
  useEffect(() => {
    if (!isWeb) { import("@tauri-apps/api/core").then(({ convertFileSrc }) => setTauriConvertFileSrc(() => convertFileSrc)); }
  }, []);

  const getSafeVideoSource = () => {
    if (!selectedMovie) return ""; 
    if (isRemoteStreaming && connModeRef.current === 'ip') {
      const baseUrl = targetAddressRef.current.startsWith("http") ? targetAddressRef.current : `http://${targetAddressRef.current}:8765`;
      return `${baseUrl}/video?path=${encodeURIComponent(selectedMovie.video_path)}&quality=720p`;
    }
    if (isRemoteStreaming && connModeRef.current === 'webrtc') return "";
    if (isWeb || !tauriConvertFileSrc) return "";
    return tauriConvertFileSrc(selectedMovie.video_path);
  };

  useEffect(() => {
    if (videoRef.current && isRemoteStreaming && connModeRef.current === 'webrtc' && remoteStream) {
      videoRef.current.srcObject = remoteStream;
      videoRef.current.play().catch(e => console.log("Engeli aşmak için tıklayın:", e));
    }
  }, [remoteStream, isRemoteStreaming, selectedMovie]);

  const startPlayer = async (movieOverride?: Movie) => {
    const movieToPlay = movieOverride || selectedMovie;
    if (!movieToPlay) return;
    setIsRemoteStreaming(false);

    if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("load", { movie: movieToPlay }); }

    if (!isWeb) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const srtFiles = await invoke<string[]>("get_local_subtitles", { video_path: movieToPlay.video_path });
        const subs: SubtitleTrack[] = [];
        for (let i = 0; i < srtFiles.length; i++) {
          const path = srtFiles[i];
          const content = await invoke<string>("read_text_file", { path });
          const fileName = path.split(/[/\\]/).pop() || `Yerel Altyazı ${i + 1}`;
          const label = `📂 ${fileName.replace(/\.srt$/i, '')}`;
          subs.push({ id: `local_${i}`, url: parseSubtitle(content, 0), label, srtContent: content, offset: 0, originalPath: path });
        }
        setLocalSubs(subs);
        const activeIdx = subs.length > 0 ? 0 : -1;
        setActiveSubIndex(activeIdx); 
        if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs, activeIndex: activeIdx }); }
      } catch (error) {}
    }
    
    setOsResults([]); setOsError(null); setSelectedMovie(movieToPlay); setIsPlaying(true); setIsVideoPlaying(true); setPlaybackSpeed(1);
    
    if (connModeRef.current === 'webrtc' && isHostRef.current && partyStatusRef.current === 'connected') {
      setTimeout(() => {
        if (connRef.current && videoRef.current && peerRef.current) {
           const stream = (videoRef.current as any).captureStream();
           callRef.current = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'movie' } });
        }
      }, 1500); 
    }
  };

  const closePlayer = async () => {
    if (selectedMovie && currentTime > 5 && !isRemoteStreaming && !isWeb) {
      const timeToSave = Math.floor(currentTime);
      const isCompleted = duration > 0 && (currentTime / duration) > 0.90; 
      const newIsWatched = isCompleted ? 1 : (selectedMovie.is_watched || 0);
      const newWatchCount = isCompleted ? (selectedMovie.watch_count || 0) + 1 : (selectedMovie.watch_count || 0);

      await updateMovieProgress(selectedMovie.video_path, timeToSave, newIsWatched, newWatchCount);
      setMovies(prev => prev.map(m => m.video_path === selectedMovie.video_path ? { ...m, progress: timeToSave, is_watched: newIsWatched, watch_count: newWatchCount, updated_at: new Date().toISOString() } : m));
      setSelectedMovie(prev => prev ? { ...prev, progress: timeToSave, is_watched: newIsWatched, watch_count: newWatchCount } : null);
    }
    localSubs.forEach(sub => URL.revokeObjectURL(sub.url));
    setLocalSubs([]); setIsPlaying(false); setCurrentTime(0);
    
    if (callRef.current) callRef.current.close();
    if (document.fullscreenElement) document.exitFullscreen();
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const m = Math.floor(time / 60).toString().padStart(2, "0");
    const s = Math.floor(time % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isRemoteStreaming || !duration) return; 
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    setHoverX(x); setHoverTime(time);
    if (previewVideoRef.current) previewVideoRef.current.currentTime = time;
  };

  const togglePlay = () => {
    if (videoRef.current && !isRemoteStreaming) { 
      const time = videoRef.current.currentTime;
      if (isVideoPlaying) { videoRef.current.pause(); broadcastEvent("pause", { time }); } 
      else { videoRef.current.play(); broadcastEvent("play", { time }); }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  const handleSeek = (timeVal: number) => {
    if(isRemoteStreaming) return; 
    if (videoRef.current) videoRef.current.currentTime = timeVal;
    setCurrentTime(timeVal);
    broadcastEvent("seek", { time: timeVal });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if(val > 0) setIsMuted(false);
    if(videoRef.current) videoRef.current.volume = val;
  };

  const toggleMute = () => {
    if(videoRef.current) { videoRef.current.muted = !isMuted; setIsMuted(!isMuted); }
  };

  const changePlaybackSpeed = (rate: number) => {
    setPlaybackSpeed(rate); setShowSpeedMenu(false);
    if(videoRef.current) videoRef.current.playbackRate = rate;
    if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("rate_change", { rate }); }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && playerContainerRef.current) { playerContainerRef.current.requestFullscreen(); } 
    else if (document.fullscreenElement) { document.exitFullscreen(); }
  };

  const togglePip = async () => {
    if (videoRef.current) {
      try {
        if (document.pictureInPictureElement) { await document.exitPictureInPicture(); } 
        else { await videoRef.current.requestPictureInPicture(); }
      } catch (error) { console.error("PIP Hatası:", error); }
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) window.clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = window.setTimeout(() => {
      if (isVideoPlaying && !showSubMenu && !showSpeedMenu && hoverTime === null) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) { tracks[i].mode = "showing"; }
    }
  }, [activeSubIndex, localSubs]);

  const MovieRow = ({ title, data }: { title: string, data: Movie[] }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    if (data.length === 0) return null;

    const scroll = (direction: "left" | "right") => {
      if (rowRef.current) {
        const { scrollLeft, clientWidth, scrollWidth } = rowRef.current;
        let scrollTo = direction === "left" ? scrollLeft - clientWidth + 100 : scrollLeft + clientWidth - 100;
        if (direction === "right" && scrollLeft + clientWidth >= scrollWidth - 50) scrollTo = 0;
        else if (direction === "left" && scrollLeft <= 0) scrollTo = scrollWidth;
        rowRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
      }
    };

    return (
      <div className="mb-10 relative group">
        <h2 className="mb-4 text-xl font-bold text-white md:text-2xl">{title}</h2>
        <button onClick={() => scroll("left")} className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/60 p-2 text-3xl text-white opacity-0 transition group-hover:opacity-100 md:block hover:scale-110 backdrop-blur rounded-r">❮</button>
        <div ref={rowRef} className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.map(movie => (
            <div key={movie.video_path} className="w-40 flex-shrink-0 snap-start sm:w-48 xl:w-56" onClick={() => handleMovieClick(movie)}>
              <MovieCard movie={movie} />
            </div>
          ))}
        </div>
        <button onClick={() => scroll("right")} className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/60 p-2 text-3xl text-white opacity-0 transition group-hover:opacity-100 md:block hover:scale-110 backdrop-blur rounded-l">❯</button>
      </div>
    );
  };

  const libraryMovies = useMemo(() => {
    let filtered = movies.filter(movie => movie.title.toLowerCase().includes(searchQuery.toLowerCase()));
    if (selectedGenre !== "All") filtered = filtered.filter(movie => movie.genres?.includes(selectedGenre));
    filtered.sort((a, b) => {
      if (sortBy === "title_asc") return a.title.localeCompare(b.title);
      else if (sortBy === "year_desc") return (b.year || 0) - (a.year || 0);
      else if (sortBy === "rating_desc") return (b.rating || 0) - (a.rating || 0);
      return 0;
    });
    return filtered;
  }, [movies, searchQuery, sortBy, selectedGenre]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white relative flex flex-col overflow-hidden">
      
      <audio ref={remoteAudioRef} autoPlay />

      {updateInfo && (
        <div className="fixed top-0 left-0 right-0 z-[500] bg-blue-600 text-white px-6 py-3 flex items-center justify-between shadow-2xl">
          <div className="font-bold flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <p>Kinflix'in Yeni Bir Sürümü Çıktı! (v{updateInfo.version})</p>
              <p className="text-xs text-blue-200">{updateInfo.body}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setUpdateInfo(null)} className="px-4 py-2 bg-black/20 hover:bg-black/40 rounded transition text-sm font-bold">Sonra</button>
            <button onClick={installUpdate} disabled={isUpdating} className="px-4 py-2 bg-white text-blue-600 hover:bg-zinc-200 rounded transition text-sm font-bold">
              {isUpdating ? "⏳ Yükleniyor..." : "İndir ve Yeniden Başlat"}
            </button>
          </div>
        </div>
      )}

      {/* WEB MİSAFİR GİRİŞ EKRANI (TV UYUMLU) */}
      {isWeb && partyStatus !== 'connected' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight mb-8">KIN<span className="text-red-600">FLIX</span> <span className="text-2xl text-zinc-500">TV</span></h1>
          <p className="text-zinc-400 mb-8 max-w-md">Televizyon kumandası ile oda kodunu gir ve bağlan.</p>
          
          <div className="w-full max-w-md flex flex-col gap-4">
            <input 
              autoFocus // TV Klavyesi otomatik açılsın
              type="number" // TV'de numaratör açılsın
              placeholder="4 Haneli Kodu Girin" 
              value={targetAddress} 
              onChange={(e) => setTargetAddress(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && connectParty(targetAddress)}
              className="w-full rounded-xl border-2 border-zinc-800 bg-black px-6 py-4 text-center text-3xl text-white outline-none focus:border-red-600 transition font-mono tracking-widest" 
            />
            <button onClick={() => connectParty(targetAddress)} className="w-full rounded-xl bg-red-600 py-4 text-xl font-bold hover:bg-red-700 transition shadow-[0_0_20px_rgba(220,38,38,0.4)] focus:ring-4 focus:ring-white">
              Odaya Katıl 🚀
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-10 py-6 backdrop-blur-sm">
        <div className="flex items-center gap-10">
          <h1 className="text-3xl font-extrabold tracking-tight">KIN<span className="text-red-600">FLIX</span></h1>
          
          <nav className="hidden gap-6 text-sm font-semibold md:flex items-center">
            <button onClick={() => setActiveTab("home")} className={`transition hover:text-zinc-300 ${activeTab === "home" ? "text-white" : "text-zinc-500"}`}>{t.home}</button>
            <button onClick={() => setActiveTab("library")} className={`transition hover:text-zinc-300 ${activeTab === "library" ? "text-white" : "text-zinc-500"}`}>{t.library}</button>
            <button onClick={() => setActiveTab("watchlist")} className={`transition hover:text-zinc-300 ${activeTab === "watchlist" ? "text-white" : "text-zinc-500"}`}>{t.watchlistTab}</button>
            <button onClick={playRandomMovie} className="ml-4 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-800 hover:scale-105">
              {t.random}
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => setIsPartyMenuOpen(true)} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold backdrop-blur transition ${partyStatus === 'connected' ? 'bg-green-600/80 hover:bg-green-700' : 'bg-zinc-800/80 hover:bg-zinc-700'}`}>
            🎉 {partyStatus === 'connected' ? (isHost ? 'Oda Kuruldu' : 'MİSAFİR MODU') : t.party}
          </button>
          
          {isHost && movies.length > 0 && !isWeb && (
            <button onClick={syncMovieMetadata} disabled={syncing} className="rounded bg-zinc-800/80 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-zinc-700 disabled:opacity-50">
              {syncing ? t.syncing : t.sync}
            </button>
          )}
          
          <button onClick={() => setIsStatsOpen(true)} className="flex h-9 w-9 items-center justify-center rounded bg-zinc-800/80 backdrop-blur transition hover:bg-zinc-700" title="İstatistikler">📊</button>
          <button onClick={() => setIsSettingsOpen(true)} className="flex h-9 w-9 items-center justify-center rounded bg-zinc-800/80 backdrop-blur transition hover:bg-zinc-700" title="Ayarlar">⚙️</button>
        </div>
      </header>

      {/* PARTY MODALI (YENİ: QR KOD İLE) */}
      {isPartyMenuOpen && !isWeb && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 flex gap-8">
            <div className="flex-1 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-3xl font-bold">🎉 {t.party}</h2>
              </div>
              
              <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 text-center">
                <h3 className="mb-2 text-sm font-semibold text-zinc-400">TV ve Telefon İçin Kısayol:</h3>
                <div className="bg-black rounded-lg p-3 text-4xl font-black tracking-widest text-green-400 border border-zinc-800">
                  {peerId || "..."}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-400">Veya Arkadaşının Kodunu Gir:</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder="Örn: 5842" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} className="flex-1 rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-zinc-500 transition font-mono" />
                  <button onClick={() => connectParty(targetAddress)} className="rounded-lg bg-red-600 px-6 font-bold hover:bg-red-700 transition">{t.connect}</button>
                </div>
              </div>
            </div>
            
            {/* YENİ: QR KOD BÖLÜMÜ */}
            <div className="w-48 flex flex-col items-center justify-center border-l border-zinc-800 pl-8">
               <h3 className="text-sm font-bold text-zinc-400 mb-4 text-center">Telefondan Katıl</h3>
               <div className="bg-white p-2 rounded-xl">
                 <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('https://kinflix.vercel.app/?room=' + peerId)}`} 
                    alt="Kinflix QR" 
                    className="w-32 h-32"
                 />
               </div>
               <p className="text-xs text-zinc-500 mt-4 text-center">Kameranı okutarak anında odaya gir.</p>
               <button onClick={() => setIsPartyMenuOpen(false)} className="mt-8 text-zinc-500 hover:text-white font-bold">Kapat ✕</button>
            </div>

          </div>
        </div>
      )}

      {isStatsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 animate-in fade-in zoom-in-95">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-600/20 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="mb-8 flex items-center justify-between relative z-10">
              <h2 className="text-3xl font-extrabold text-white">📊 İstatistiklerin</h2>
              <button onClick={() => setIsStatsOpen(false)} className="text-3xl text-zinc-500 hover:text-white transition">✕</button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 relative z-10">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center shadow-lg">
                <p className="text-4xl font-black text-white">{userStats.watchedCount}</p>
                <p className="text-xs text-zinc-500 mt-2 font-bold uppercase tracking-wider">İzlenen Film</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center shadow-lg">
                <p className="text-4xl font-black text-red-500">{userStats.hours}s</p>
                <p className="text-xs text-zinc-500 mt-2 font-bold uppercase tracking-wider">İzleme Süresi</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center shadow-lg col-span-2">
                <p className="text-3xl font-black text-white truncate px-2">{userStats.favGenre}</p>
                <p className="text-xs text-zinc-500 mt-2 font-bold uppercase tracking-wider">En Sevdiğin Tür</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {partyStatus === 'connected' && !isPlaying && (
        <button onClick={() => setIsChatOpen(!isChatOpen)} className="fixed bottom-8 right-8 z-[150] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-2xl hover:scale-110 transition-transform text-2xl">
          💬
        </button>
      )}

      {isChatOpen && partyStatus === 'connected' && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-950 border-l border-zinc-800 z-[250] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center shadow-md">
            <h3 className="font-bold text-white flex items-center gap-2">💬 Party Chat <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span></h3>
            <button onClick={toggleVoiceChat} className={`flex items-center justify-center w-8 h-8 rounded-full transition ${isMicActive ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
              {isMicActive ? '🎙️' : '🎤'}
            </button>
            <button onClick={() => setIsChatOpen(false)} className="text-zinc-400 hover:text-white transition ml-2">✕</button>
          </div>
          
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-zinc-950">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`max-w-[85%] rounded-xl p-2.5 text-sm shadow-md ${msg.sender === 'me' ? 'bg-blue-600 text-white self-end rounded-tr-sm' : 'bg-zinc-800 text-zinc-200 self-start rounded-tl-sm'}`}>
                {msg.type === 'text' ? <p className="break-words">{msg.content}</p> : <img src={msg.content} className="rounded-lg w-full object-cover cursor-pointer hover:opacity-80 transition" onClick={async () => { if(!isWeb) { const { openUrl } = await import('@tauri-apps/plugin-opener'); openUrl(msg.content); } else { window.open(msg.content); } }} />}
                <span className="text-[10px] opacity-50 block mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
          
          <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex gap-2 items-center">
            <label className="cursor-pointer text-xl hover:scale-110 transition text-zinc-400 hover:text-white">
              📷 <input type="file" className="hidden" accept="image/*" onChange={handleSendChatImage} />
            </label>
            <input type="text" className="flex-1 bg-black border border-zinc-800 rounded-full px-4 py-2 text-sm text-white outline-none focus:border-blue-500 transition" placeholder={t.chatMsg} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendChatText()} />
            <button onClick={handleSendChatText} className="text-blue-500 font-bold px-2 hover:text-blue-400 transition">➤</button>
          </div>
        </div>
      )}

      {isPlaying && selectedMovie && (
        <div 
          ref={playerContainerRef} 
          onMouseMove={handleMouseMove} 
          onClick={() => {if(showSubMenu) setShowSubMenu(false); if(showSpeedMenu) setShowSpeedMenu(false);}} 
          className={`fixed inset-0 z-[100] bg-black flex flex-col group ${showControls ? "controls-visible" : "controls-hidden"}`}
        >
          <style>
            {`
              video::cue { background-color: transparent !important; color: #ffffff; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 2.3vw; font-weight: bold; text-shadow: 0px 0px 7px rgba(0,0,0, 1), 0px 0px 7px rgba(0,0,0, 1), 2px 2px 3px rgba(0,0,0, 0.9), -1px -1px 0px rgba(0,0,0, 0.5), 1px -1px 0px rgba(0,0,0, 0.5); }
              .controls-visible video::-webkit-media-text-track-display { transform: translateY(-90px) !important; transition: transform 0.3s ease-in-out; }
              .controls-hidden video::-webkit-media-text-track-display { transform: translateY(-15px) !important; transition: transform 0.3s ease-in-out; }
            `}
          </style>

          <video
            ref={videoRef} 
            src={getSafeVideoSource()} 
            autoPlay 
            playsInline
            onClick={togglePlay}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); if (selectedMovie.progress && selectedMovie.progress > 0 && !isWeb) e.currentTarget.currentTime = selectedMovie.progress; }}
            className="h-full w-full object-contain cursor-pointer"
          >
            {activeSubIndex >= 0 && localSubs[activeSubIndex] && (
              <track key={localSubs[activeSubIndex].url} src={localSubs[activeSubIndex].url} kind="subtitles" srcLang={localSubs[activeSubIndex].label.includes("Türkçe") ? "tr" : "en"} label={localSubs[activeSubIndex].label} default />
            )}
          </video>

          {currentTime > 10 && currentTime < 120 && !isRemoteStreaming && !isWeb && (
             <button onClick={(e) => { e.stopPropagation(); handleSeek(currentTime + 85); }} className="absolute bottom-32 right-10 z-50 bg-black/60 border border-zinc-500 text-white font-bold px-6 py-3 rounded hover:bg-white hover:text-black transition-all hover:scale-105 shadow-2xl">
               İntroyu Atla (85s) ❯
             </button>
          )}

          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
            <button onClick={closePlayer} className="absolute bottom-[90vh] left-6 text-4xl text-white hover:text-red-500 transition drop-shadow-lg">✕</button>

            {partyStatus === 'connected' && (
              <button onClick={(e) => {e.stopPropagation(); setIsChatOpen(!isChatOpen);}} className="absolute bottom-[90vh] right-6 flex items-center gap-2 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur transition shadow-xl">
                💬 SOHBET {isChatOpen ? 'KAPAT' : 'AÇ'}
              </button>
            )}

            {isRemoteStreaming && (
              <div className="absolute bottom-[90vh] right-[150px] bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-full animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.7)]">
                {connMode === 'webrtc' ? '🔴 CANLI YAYIN (P2P)' : '🔵 AĞ ÜZERİNDEN (HTTP)'}
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm font-medium w-12 text-center drop-shadow-md">{formatTime(currentTime)}</span>
              <div 
                className="relative w-full h-1.5 bg-zinc-700/80 backdrop-blur rounded-lg cursor-pointer group hover:h-2 transition-all"
                onMouseMove={handleProgressMouseMove}
                onMouseLeave={() => setHoverTime(null)}
                onClick={(e) => { if(isRemoteStreaming) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left; handleSeek((x / rect.width) * duration); }}
              >
                <div className="absolute top-0 left-0 h-full bg-red-600 rounded-lg shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{width: `${(currentTime/duration)*100}%`}}></div>
                {hoverTime !== null && !isRemoteStreaming && (
                  <div className="absolute bottom-6 -translate-x-1/2 bg-black border border-zinc-700 rounded overflow-hidden shadow-2xl z-50 flex flex-col items-center pointer-events-none" style={{ left: hoverX }}>
                    <video ref={previewVideoRef} src={getSafeVideoSource()} className="w-40 h-[90px] object-cover" muted />
                    <span className="text-xs font-bold p-1 bg-black/80 w-full text-center">{formatTime(hoverTime)}</span>
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-zinc-400 w-12 text-center drop-shadow-md">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button onClick={togglePlay} disabled={isRemoteStreaming} className={`text-4xl transition drop-shadow-lg ${isRemoteStreaming ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}`}>{isVideoPlaying ? "⏸" : "▶"}</button>
                <div className="flex items-center gap-2 group/vol relative drop-shadow-lg">
                  <button onClick={toggleMute} className="text-2xl hover:text-white transition w-8 text-center text-zinc-300">{isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</button>
                  <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-300 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white" />
                </div>
                <h2 className="text-xl font-bold truncate max-w-md ml-2 drop-shadow-md">{selectedMovie.title}</h2>
              </div>

              <div className="flex items-center gap-6 relative drop-shadow-lg">
                <div className="relative">
                  <button onClick={(e) => {e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); setShowSubMenu(false);}} className="text-base font-bold text-zinc-300 hover:text-white transition w-8">{playbackSpeed}x</button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-12 right-0 w-24 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl z-50">
                      {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                        <button key={rate} disabled={isRemoteStreaming} onClick={() => changePlaybackSpeed(rate)} className={`w-full text-center px-4 py-2 text-sm hover:bg-zinc-800 ${playbackSpeed === rate ? "text-red-500 font-bold" : "text-white"} ${isRemoteStreaming ? "opacity-50 cursor-not-allowed" : ""}`}>{rate}x</button>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={(e) => {e.stopPropagation(); setShowSubMenu(!showSubMenu); setShowSpeedMenu(false);}} className="text-xl font-bold text-zinc-300 hover:text-white">CC</button>
                
                <button onClick={togglePip} className="text-2xl text-zinc-300 hover:text-white transition" title="Küçük Pencere">◱</button>
                <button onClick={toggleFullscreen} className="text-2xl text-zinc-300 hover:text-white">⛶</button>
                
                {showSubMenu && (
                  <div className="absolute bottom-12 right-0 w-72 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl z-50">
                    <div className="bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">{t.subs}</div>
                    <button onClick={() => changeSubtitle(-1)} className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 ${activeSubIndex === -1 ? "text-red-500 font-bold" : "text-white"}`}>{t.subOff}</button>
                    {localSubs.map((sub, idx) => (
                      <div key={sub.id} className="flex items-center justify-between hover:bg-zinc-800 px-4 py-2">
                        <button onClick={() => changeSubtitle(idx)} className={`flex-1 text-left text-sm ${activeSubIndex === idx ? "text-red-500 font-bold" : "text-white"}`}>{sub.label} {sub.offset !== 0 && <span className="text-xs text-zinc-400">({sub.offset > 0 ? '+':''}{sub.offset}s)</span>}</button>
                        {activeSubIndex === idx && (
                          <div className="flex items-center gap-1 bg-zinc-950 rounded p-1">
                            <button onClick={(e) => {e.stopPropagation(); updateSubDelay(idx, -0.5)}} className="w-6 h-6 rounded flex items-center justify-center text-xs bg-zinc-800 hover:bg-zinc-700 text-white">-</button>
                            <button onClick={(e) => {e.stopPropagation(); updateSubDelay(idx, 0.5)}} className="w-6 h-6 rounded flex items-center justify-center text-xs bg-zinc-800 hover:bg-zinc-700 text-white">+</button>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    <div className="bg-zinc-800 px-4 py-2 mt-1 text-xs font-bold text-zinc-400 uppercase tracking-wider">İnternetten Bul (STREMIO)</div>
                    <div className="p-2">
                      {osResults.length === 0 && !isSearchingOS && <button onClick={(e) => {e.stopPropagation(); searchStremioSubtitles()}} className="w-full rounded bg-red-600/20 py-2 text-sm font-bold text-red-500 hover:bg-red-600/40 transition">Altyazı Ara ({lang.toUpperCase()})</button>}
                      {isSearchingOS && <div className="text-center text-sm text-zinc-400 py-2">Stremio'da Aranıyor...</div>}
                      {osError && <div className="text-center text-xs text-red-500 py-2 font-bold bg-red-950/30 rounded mb-2">{osError}</div>}
                      {osResults.map((res: any) => {
                        const isDownloading = downloadingId === res.id;
                        return (
                          <button key={res.id} disabled={isDownloading} onClick={(e) => {e.stopPropagation(); downloadStremioSubtitle(res)}} className={`w-full text-left px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800 rounded truncate ${isDownloading ? 'opacity-50' : ''}`}>
                            {isDownloading ? "⏳ İndiriliyor..." : `⬇ Stremio [${res.lang}] - Dosya`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold">⚙️ {t.settings}</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-3xl text-zinc-500 hover:text-white">✕</button>
            </div>
            {(!isHost && partyStatus === 'connected') || isWeb ? (
              <div className="text-center py-10">
                <h3 className="text-2xl font-bold text-white mb-4">Misafir Modundasınız 🎭</h3>
                <p className="text-zinc-400 leading-relaxed max-w-md mx-auto">Oda kurucusunun (Host) kütüphanesini görüntülüyorsunuz. Bütün film verileri doğrudan Host'tan size aktarılıyor.<br/><br/>Arkanıza yaslanın ve filmin tadını çıkarın!</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.language}</h3>
                    <select value={lang} onChange={(e) => handleSaveLang(e.target.value as Lang)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none"><option value="tr">Türkçe</option><option value="en">English</option></select>
                  </div>
                  <div className="flex-[2]">
                    <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.apiToken}</h3>
                    <input type="password" value={tmdbToken} onChange={(e) => handleSaveToken(e.target.value)} placeholder="TMDB Read Access Token" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none" />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between"><h3 className="text-lg font-semibold text-zinc-300">{t.libCount} ({libraries.length})</h3><button onClick={chooseFolder} disabled={scanning} className="text-sm font-bold text-red-500 hover:text-red-400">{t.addLib}</button></div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                    {libraries.length === 0 ? <p className="p-2 text-sm text-zinc-500">Yok</p> : libraries.map(lib => (
                      <div key={lib} className="flex items-center justify-between rounded p-2 hover:bg-zinc-800"><span className="truncate text-sm text-zinc-300">{lib}</span><button onClick={async () => { await removeLibraryFolder(lib); setMovies(await getMovies()); }} className="ml-4 text-xs font-bold text-red-500">{t.remove}</button></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4"><h3 className="text-red-500 font-bold mb-2">{t.dangerZone}</h3><button onClick={async () => { if(confirm("Emin misin?")) { await clearDatabase(); setMovies([]); setIsSettingsOpen(false); } }} className="rounded bg-red-600 px-4 py-2 text-sm font-bold transition hover:bg-red-700">{t.resetDb}</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedMovie && !isPlaying && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0b0b] animate-in fade-in zoom-in-95 duration-200">
          <button onClick={() => setSelectedMovie(null)} className="absolute left-8 top-8 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-2xl text-white backdrop-blur-md transition hover:scale-110 hover:bg-white/20 shadow-2xl">✕</button>
          <div className="relative h-[65vh] w-full">{selectedMovie.backdrop_url ? <img src={selectedMovie.backdrop_url} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-zinc-900" />}<div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/60 to-transparent" /></div>
          <div className="relative z-10 -mt-56 max-w-5xl px-10 pb-20">
            <h1 className="text-5xl font-extrabold shadow-black drop-shadow-2xl md:text-7xl">{selectedMovie.title}</h1>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-semibold text-zinc-300">
              {selectedMovie.rating != null && selectedMovie.rating > 0 && <span className="flex items-center gap-1 text-green-400 font-bold text-base">{Math.round(selectedMovie.rating * 10)}% Eşleşme</span>}
              {selectedMovie.year && <span>{selectedMovie.year}</span>}
              {selectedMovie.runtime && <span>{selectedMovie.runtime} dk</span>}
              <span className="rounded border border-zinc-500 px-1.5 py-0.5 text-xs text-zinc-300">HD</span>
            </div>
            {selectedMovie.progress && selectedMovie.progress > 0 && (selectedMovie.is_watched || 0) === 0 && !isWeb && <div className="mt-4 flex items-center gap-3"><div className="h-1.5 w-64 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{ width: `${Math.min((selectedMovie.progress / ((selectedMovie.runtime || 120) * 60)) * 100, 100)}%` }} /></div></div>}
            
            <div className="mt-8 flex gap-4">
              <button onClick={() => startPlayer()} className="flex items-center justify-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200">
                <span className="text-2xl">▶</span> {selectedMovie.progress && (selectedMovie.is_watched || 0) === 0 && !isWeb ? t.resume : t.play}
              </button>
              {!isWeb && <button onClick={() => toggleWatchlist(selectedMovie)} className="flex items-center justify-center gap-2 rounded bg-zinc-800/80 backdrop-blur px-8 py-3 text-xl font-bold text-white transition hover:bg-zinc-700">{selectedMovie.watchlist ? "✓ " + t.inWatchlist : "+ " + t.toWatch}</button>}
            </div>
            <div className="mt-10 flex flex-col md:flex-row gap-10">
              <div className="flex-[2]"><p className="text-lg leading-relaxed text-zinc-300">{selectedMovie.overview || t.noOverview}</p></div>
              <div className="flex-1 flex flex-col gap-3 text-sm">
                {selectedMovie.genres && <p><span className="text-zinc-500">Türler:</span> <span className="text-zinc-300">{selectedMovie.genres}</span></p>}
                {selectedMovie.director && <p><span className="text-zinc-500">Yönetmen:</span> <span className="text-zinc-300">{selectedMovie.director}</span></p>}
                {selectedMovie.actors && <p><span className="text-zinc-500">Oyuncular:</span> <span className="text-zinc-300">{selectedMovie.actors}</span></p>}
                {selectedMovie.collection_name && <p><span className="text-zinc-500">Seri:</span> <span className="text-zinc-300">{selectedMovie.collection_name}</span></p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isWeb && (
        <main className="flex-1 pb-10">
          {error && <div className="mx-10 mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-400">Hata: {error}</div>}
          {movies.length === 0 && !scanning && !syncing ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center px-10">
              <h3 className="text-2xl font-bold">{t.emptyLib}</h3>
              <button onClick={() => setIsSettingsOpen(true)} className="mt-6 rounded bg-red-600 px-8 py-3 font-bold transition hover:bg-red-700">{t.clickToStart}</button>
            </div>
          ) : (
            <>
              {activeTab === "home" && (
                <div className="animate-in fade-in duration-500">
                  {heroMovie && (
                    <div className="relative -mt-24 mb-10 h-[70vh] w-full transition-all duration-1000 ease-in-out">
                      {heroMovie.backdrop_url ? <img src={heroMovie.backdrop_url} key={heroMovie.video_path} className="h-full w-full object-cover opacity-80 animate-in fade-in duration-1000" /> : <div className="h-full w-full bg-zinc-900" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/20 to-[#0b0b0b]/40" />
                      <div className="absolute bottom-20 left-10 z-10 max-w-2xl drop-shadow-2xl">
                        <h1 className="text-6xl font-extrabold md:text-7xl">{heroMovie.title}</h1>
                        <p className="mt-4 line-clamp-3 text-lg font-medium text-zinc-300">{heroMovie.overview}</p>
                        <div className="mt-6 flex gap-4">
                          <button onClick={() => startPlayer(heroMovie)} className="flex items-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200"><span className="text-2xl">▶</span> {heroMovie.progress ? t.resume : t.play}</button>
                          <button onClick={() => handleMovieClick(heroMovie)} className="flex items-center gap-2 rounded bg-zinc-500/50 px-8 py-3 text-xl font-bold text-white backdrop-blur transition hover:bg-zinc-500/70">{t.info}</button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="px-10">
                    <MovieRow title={t.continue} data={continueWatching} />
                    <MovieRow title={t.watchlist} data={watchListMovies} />
                    {collections.map(item => <MovieRow key={item.name} title={`🎬 ${item.name}`} data={item.movies} />)}
                    <MovieRow title={t.newReleases} data={newReleases} />
                    <MovieRow title={t.topRated} data={topRated} />
                    {homeGenres.map(item => <MovieRow key={item.genre} title={`${item.genre}`} data={item.movies} />)}
                  </div>
                </div>
              )}
              {activeTab === "watchlist" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <h2 className="mb-6 text-2xl font-bold">{t.watchlist}</h2>
                  {watchListMovies.length === 0 ? <div className="text-zinc-500">{t.emptyWatchlist}</div> : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">{watchListMovies.map((movie) => <div key={movie.video_path} onClick={() => handleMovieClick(movie)}><MovieCard movie={movie} /></div>)}</div>
                  )}
                </div>
              )}
              {activeTab === "library" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <input type="text" placeholder={t.search} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full max-w-xs rounded border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 outline-none transition focus:border-white" />
                    <div className="flex gap-4">
                      <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-white"><option value="All">{t.allGenres}</option>{allGenres.map(g => <option key={g} value={g}>{g}</option>)}</select>
                      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-white"><option value="title_asc">{t.sortAZ}</option><option value="year_desc">{t.sortNew}</option><option value="rating_desc">{t.sortRating}</option></select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">{libraryMovies.map((movie) => <div key={movie.video_path} onClick={() => handleMovieClick(movie)}><MovieCard movie={movie} /></div>)}</div>
                </div>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}

export default App;