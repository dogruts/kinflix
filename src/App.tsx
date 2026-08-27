// src/App.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";

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
    apiToken: "TMDB API Token", osToken: "OpenSubtitles API Key", libCount: "Kütüphaneler", remove: "KALDIR",
    dangerZone: "Tehlikeli Bölge", resetDb: "Veritabanını Sıfırla",
    language: "Arayüz Dili", subs: "Altyazılar", subOff: "Kapalı", searchSubWeb: "🌐 Tarayıcıda Ara",
    party: "Party Watch", joinLabel: "Odaya Katıl (IP veya Tünel Linki):", connect: "Bağlan", connected: "Bağlantı Başarılı!", disconnected: "Bağlı Değil",
    localTab: "Yerel / VPN", tunnelTab: "İnternet Tüneli", quality: "Kalite", qOriginal: "Orijinal", generatingTunnel: "Tünel Oluşturuluyor..."
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
    apiToken: "TMDB API Token", osToken: "OpenSubtitles API Key", libCount: "Libraries", remove: "REMOVE",
    dangerZone: "Danger Zone", resetDb: "Reset Database",
    language: "Interface Language", subs: "Subtitles", subOff: "Off", searchSubWeb: "🌐 Search in Browser",
    party: "Party Watch", joinLabel: "Join Room (IP or Tunnel Link):", connect: "Connect", connected: "Connected!", disconnected: "Disconnected",
    localTab: "Local / VPN", tunnelTab: "Internet Tunnel", quality: "Quality", qOriginal: "Original", generatingTunnel: "Generating Tunnel..."
  }
};

type SortOption = "title_asc" | "year_desc" | "rating_desc";
type TabState = "home" | "library" | "watchlist";
type Lang = "tr" | "en";
type SubtitleTrack = { id: string; url: string; label: string; srtContent: string; offset: number };
type StreamQuality = "original" | "1080p" | "720p" | "480p";

function App() {
  const [lang, setLang] = useState<Lang>("tr");
  const t = dict[lang];

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
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  
  const [osResults, setOsResults] = useState<any[]>([]);
  const [isSearchingOS, setIsSearchingOS] = useState(false);

  // === PARTY WATCH STATELERİ ===
  const [isPartyMenuOpen, setIsPartyMenuOpen] = useState(false);
  const [partyMenuTab, setPartyMenuTab] = useState<"local" | "tunnel">("local");
  const [localIp, setLocalIp] = useState("");
  const [tunnelUrl, setTunnelUrl] = useState(""); 
  const [targetAddress, setTargetAddress] = useState("");
  const [partyStatus, setPartyStatus] = useState<"disconnected" | "connected">("disconnected");
  
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);
  const [streamQuality, setStreamQuality] = useState<StreamQuality>("original");
  const wsRef = useRef<WebSocket | null>(null);

  let hideControlsTimeout = useRef<number | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("title_asc");
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tmdbToken, setTmdbToken] = useState("");
  const [osApiKey, setOsApiKey] = useState(""); 

  const libraries = useMemo(() => Array.from(new Set(movies.map(m => m.folder_path))), [movies]);
  const allGenres = useMemo(() => {
    const genreSet = new Set<string>();
    movies.forEach(m => { if (m.genres) m.genres.split(", ").forEach(g => genreSet.add(g)); });
    return Array.from(genreSet).sort();
  }, [movies]);

  const continueWatching = useMemo(() => movies.filter(m => m.progress && m.progress > 5).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")), [movies]);
  const watchListMovies = useMemo(() => movies.filter(m => m.watchlist === 1).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")), [movies]);
  const topRated = useMemo(() => [...movies].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 15), [movies]);
  const newReleases = useMemo(() => [...movies].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 15), [movies]);
  
  const heroMovies = useMemo(() => movies.filter(m => m.backdrop_url).slice(0, 10), [movies]);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (heroMovies.length <= 1 || activeTab !== "home" || isPlaying || selectedMovie) return;
    const interval = setInterval(() => { setHeroIndex(prev => (prev + 1) % heroMovies.length); }, 8000);
    return () => clearInterval(interval);
  }, [heroMovies, activeTab, isPlaying, selectedMovie]);

  const heroMovie = heroMovies[heroIndex] || movies[0];

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        await initializeDatabase();
        if (cancelled) return;
        const savedTmdb = await getSetting("tmdb_token");
        if (savedTmdb) setTmdbToken(savedTmdb);
        const savedOs = await getSetting("os_api_key");
        if (savedOs) setOsApiKey(savedOs);
        const savedLang = await getSetting("language");
        if (savedLang) setLang(savedLang as Lang);
        
        invoke<string>("get_local_ip").then(ip => setLocalIp(ip)).catch(console.error);

        const storedMovies = await getMovies();
        if (!cancelled) setMovies(storedMovies);
      } catch (error) { if (!cancelled) setError(String(error)); }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleSaveToken = async (val: string) => { setTmdbToken(val); await setSetting("tmdb_token", val); };
  const handleSaveOsKey = async (val: string) => { setOsApiKey(val); await setSetting("os_api_key", val); };
  const handleSaveLang = async (val: Lang) => { setLang(val); await setSetting("language", val); };

  async function chooseFolder() {
    setError(null);
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;
      await scanFolder(selected);
    } catch (error) { setError(String(error)); }
  }

  async function scanFolder(path: string) {
    setScanning(true); setError(null);
    try {
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
    if (syncing) return;
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
    const newStatus = movie.watchlist ? 0 : 1;
    await setWatchlist(movie.video_path, newStatus);
    setMovies(prev => prev.map(m => m.video_path === movie.video_path ? { ...m, watchlist: newStatus } : m));
    setSelectedMovie(prev => prev ? { ...prev, watchlist: newStatus } : null);
  };

  const srtToVtt = (srtContent: string, offsetSeconds: number = 0) => {
    let vtt = "WEBVTT\n\n";
    const lines = srtContent.split('\n');
    const timeRegex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;

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
      const match = timeRegex.exec(line);
      if (match) {
        const start = shiftTime(match[1], match[2], match[3], match[4]);
        const end = shiftTime(match[5], match[6], match[7], match[8]);
        vtt += `${start} --> ${end}\n`;
      } else {
        vtt += line + '\n';
      }
    }
    return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
  };

  const updateSubDelay = (index: number, delta: number) => {
    setLocalSubs(prev => {
      const newSubs = [...prev];
      const sub = newSubs[index];
      const newOffset = sub.offset + delta;
      URL.revokeObjectURL(sub.url);
      const newUrl = srtToVtt(sub.srtContent, newOffset);
      newSubs[index] = { ...sub, offset: newOffset, url: newUrl };
      return newSubs;
    });
  };

  // === PARTY WATCH: IP VEYA TÜNEL LİNKİ İLE BAĞLANMA ===
  const connectParty = (address: string) => {
    if (!address) return;
    if (wsRef.current) wsRef.current.close();
    
    let wsUrl = "";
    if (address.startsWith("http")) {
      wsUrl = address.replace("http://", "ws://").replace("https://", "wss://") + "/ws";
    } else {
      wsUrl = `ws://${address}:8765/ws`;
    }
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setPartyStatus("connected");
      setTargetAddress(address);
      setIsPartyMenuOpen(false);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.action === "load") {
          setIsRemoteStreaming(true);
          setSelectedMovie(data.movie);
          setIsPlaying(true);
          setIsVideoPlaying(true);
        } else if (videoRef.current) {
          if (data.action === "play") {
            videoRef.current.currentTime = data.time;
            videoRef.current.play();
            setIsVideoPlaying(true);
          } else if (data.action === "pause") {
            videoRef.current.currentTime = data.time;
            videoRef.current.pause();
            setIsVideoPlaying(false);
          } else if (data.action === "seek") {
            videoRef.current.currentTime = data.time;
            setCurrentTime(data.time);
          }
        }
      } catch(err) {}
    };

    ws.onclose = () => setPartyStatus("disconnected");
    wsRef.current = ws;
  };

  const broadcastEvent = (action: string, time: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, time }));
    }
  };

  const generateTunnel = () => {
    setTunnelUrl("");
    setTimeout(() => {
      setTunnelUrl("https://kinflix-party.loca.lt"); // Gelecekte Rust'tan gelecek
    }, 2000);
  };

  const getVideoSource = () => {
    if (!selectedMovie) return "";
    if (isRemoteStreaming && targetAddress) {
      const baseUrl = targetAddress.startsWith("http") ? targetAddress : `http://${targetAddress}:8765`;
      return `${baseUrl}/video?path=${encodeURIComponent(selectedMovie.video_path)}&quality=${streamQuality}`;
    }
    return convertFileSrc(selectedMovie.video_path);
  };

  const startPlayer = async (movieOverride?: Movie) => {
    const movieToPlay = movieOverride || selectedMovie;
    if (!movieToPlay) return;
    
    setIsRemoteStreaming(false);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "load", movie: movieToPlay }));
    }

    try {
      const srtFiles = await invoke<string[]>("get_local_subtitles", { video_path: movieToPlay.video_path });
      const subs: SubtitleTrack[] = [];
      for (let i = 0; i < srtFiles.length; i++) {
        const path = srtFiles[i];
        const content = await invoke<string>("read_text_file", { path });
        const fileName = path.split(/[/\\]/).pop() || `Yerel Altyazı ${i + 1}`;
        const label = `📂 ${fileName.replace(/\.srt$/i, '')}`;
        subs.push({ id: `local_${i}`, url: srtToVtt(content, 0), label, srtContent: content, offset: 0 });
      }
      setLocalSubs(subs);
      setActiveSubIndex(subs.length > 0 ? 0 : -1); 
    } catch (error) {}
    
    setOsResults([]);
    setSelectedMovie(movieToPlay);
    setIsPlaying(true);
    setIsVideoPlaying(true);
  };

  const searchOpenSubtitles = async () => {
    if (!selectedMovie || !osApiKey) return;
    setIsSearchingOS(true);
    try {
      const osLang = lang === "tr" ? "tr" : "en";
      const res = await tauriFetch(`https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(selectedMovie.title)}&languages=${osLang}`, {
        headers: { 'Api-Key': osApiKey, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setOsResults(data.data?.slice(0, 5) || []);
    } catch (err) { console.error("OS Search Error", err); }
    setIsSearchingOS(false);
  };

  const downloadOpenSubtitle = async (fileId: number, label: string) => {
    try {
      const res = await tauriFetch('https://api.opensubtitles.com/api/v1/download', {
        method: 'POST',
        headers: { 'Api-Key': osApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ file_id: fileId })
      });
      const data = await res.json();
      if (data.link) {
        const srtRes = await tauriFetch(data.link);
        const srtContent = await srtRes.text();
        const vttUrl = srtToVtt(srtContent, 0);
        
        setLocalSubs(prev => {
          const newSubs = [...prev, { id: `os_${fileId}`, url: vttUrl, label: `🌐 ${label}`, srtContent, offset: 0 }];
          setActiveSubIndex(newSubs.length - 1);
          return newSubs;
        });
        setOsResults([]);
      }
    } catch (err) { console.error("Download Error", err); }
  };

  const closePlayer = async () => {
    if (selectedMovie && currentTime > 5 && !isRemoteStreaming) {
      const timeToSave = Math.floor(currentTime);
      await updateMovieProgress(selectedMovie.video_path, timeToSave);
      setMovies(prev => prev.map(m => m.video_path === selectedMovie.video_path ? { ...m, progress: timeToSave, updated_at: new Date().toISOString() } : m));
      setSelectedMovie(prev => prev ? { ...prev, progress: timeToSave } : null);
    }
    localSubs.forEach(sub => URL.revokeObjectURL(sub.url));
    setLocalSubs([]); setIsPlaying(false); setCurrentTime(0);
    if (document.fullscreenElement) document.exitFullscreen();
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const m = Math.floor(time / 60).toString().padStart(2, "0");
    const s = Math.floor(time % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const togglePlay = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      if (isVideoPlaying) { videoRef.current.pause(); broadcastEvent("pause", time); } 
      else { videoRef.current.play(); broadcastEvent("play", time); }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = val;
    setCurrentTime(val);
    broadcastEvent("seek", val);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && playerContainerRef.current) {
      playerContainerRef.current.requestFullscreen();
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) window.clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = window.setTimeout(() => {
      if (isVideoPlaying && !showSubMenu && !showQualityMenu) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = i === activeSubIndex ? "showing" : "hidden";
      }
    }
  }, [activeSubIndex, localSubs]);

  const MovieRow = ({ title, data }: { title: string, data: Movie[] }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    if (data.length === 0) return null;

    const scroll = (direction: "left" | "right") => {
      if (rowRef.current) {
        const { scrollLeft, clientWidth } = rowRef.current;
        const scrollTo = direction === "left" ? scrollLeft - clientWidth + 100 : scrollLeft + clientWidth - 100;
        rowRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
      }
    };

    return (
      <div className="mb-10 relative group">
        <h2 className="mb-4 text-xl font-bold text-white md:text-2xl">{title}</h2>
        <button onClick={() => scroll("left")} className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/60 p-2 text-3xl text-white opacity-0 transition group-hover:opacity-100 md:block hover:scale-110 backdrop-blur rounded-r">❮</button>
        <div ref={rowRef} className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.map(movie => (
            <div key={movie.video_path} className="w-40 flex-shrink-0 snap-start sm:w-48 xl:w-56" onClick={() => setSelectedMovie(movie)}>
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
    <div className="min-h-screen bg-[#0b0b0b] text-white relative flex flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-10 py-6 backdrop-blur-sm">
        <div className="flex items-center gap-10">
          <h1 className="text-3xl font-extrabold tracking-tight">KIN<span className="text-red-600">FLIX</span></h1>
          
          <nav className="hidden gap-6 text-sm font-semibold md:flex">
            <button onClick={() => setActiveTab("home")} className={`transition hover:text-zinc-300 ${activeTab === "home" ? "text-white" : "text-zinc-500"}`}>{t.home}</button>
            <button onClick={() => setActiveTab("library")} className={`transition hover:text-zinc-300 ${activeTab === "library" ? "text-white" : "text-zinc-500"}`}>{t.library}</button>
            <button onClick={() => setActiveTab("watchlist")} className={`transition hover:text-zinc-300 ${activeTab === "watchlist" ? "text-white" : "text-zinc-500"}`}>{t.watchlistTab}</button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsPartyMenuOpen(true)} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold backdrop-blur transition ${partyStatus === 'connected' ? 'bg-green-600/80 hover:bg-green-700' : 'bg-zinc-800/80 hover:bg-zinc-700'}`}>
            🎉 {partyStatus === 'connected' ? 'Odaya Bağlı' : t.party}
          </button>
          {movies.length > 0 && <button onClick={syncMovieMetadata} disabled={syncing} className="rounded bg-zinc-800/80 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-zinc-700 disabled:opacity-50">{syncing ? t.syncing : t.sync}</button>}
          <button onClick={() => setIsSettingsOpen(true)} className="flex h-9 w-9 items-center justify-center rounded bg-zinc-800/80 backdrop-blur transition hover:bg-zinc-700">⚙️</button>
        </div>
      </header>

      {/* AYARLAR MODALI */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold">⚙️ {t.settings}</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-3xl text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.language}</h3>
                  <select value={lang} onChange={(e) => handleSaveLang(e.target.value as Lang)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none">
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="flex-[2]">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.apiToken}</h3>
                  <input type="password" value={tmdbToken} onChange={(e) => handleSaveToken(e.target.value)} placeholder="TMDB Read Access Token" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none" />
                </div>
              </div>
              
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.osToken}</h3>
                <input type="password" value={osApiKey} onChange={(e) => handleSaveOsKey(e.target.value)} placeholder="OpenSubtitles REST API Key (Opsiyonel)" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none" />
                <p className="mt-1 text-xs text-zinc-500">Uygulama içinden altyazı indirmek için gereklidir. Yoksa tarayıcıdan indirip klasöre atabilirsiniz.</p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-300">{t.libCount} ({libraries.length})</h3>
                  <button onClick={chooseFolder} disabled={scanning} className="text-sm font-bold text-red-500 hover:text-red-400">{t.addLib}</button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                  {libraries.length === 0 ? <p className="p-2 text-sm text-zinc-500">Yok</p> : libraries.map(lib => (
                    <div key={lib} className="flex items-center justify-between rounded p-2 hover:bg-zinc-800">
                      <span className="truncate text-sm text-zinc-300">{lib}</span>
                      <button onClick={async () => { await removeLibraryFolder(lib); setMovies(await getMovies()); }} className="ml-4 text-xs font-bold text-red-500">{t.remove}</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4">
                <h3 className="text-red-500 font-bold mb-2">{t.dangerZone}</h3>
                <button onClick={async () => { if(confirm("Emin misin?")) { await clearDatabase(); setMovies([]); setIsSettingsOpen(false); } }} className="rounded bg-red-600 px-4 py-2 text-sm font-bold transition hover:bg-red-700">{t.resetDb}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PARTY WATCH MODALI */}
      {isPartyMenuOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold">🎉 {t.party}</h2>
              <button onClick={() => setIsPartyMenuOpen(false)} className="text-3xl text-zinc-500 hover:text-white">✕</button>
            </div>
            
            <div className="flex gap-2 mb-6 p-1 bg-zinc-950 rounded-lg">
              <button onClick={() => setPartyMenuTab("local")} className={`flex-1 py-2 rounded-md text-sm font-bold transition ${partyMenuTab === "local" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>{t.localTab}</button>
              <button onClick={() => setPartyMenuTab("tunnel")} className={`flex-1 py-2 rounded-md text-sm font-bold transition ${partyMenuTab === "tunnel" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>{t.tunnelTab}</button>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-400">Oda Kur (Arkadaşına Gönder):</h3>
                <div className="flex items-center justify-between bg-black rounded p-3 text-lg font-mono text-green-400 border border-zinc-800 overflow-hidden">
                  {partyMenuTab === "local" ? (
                    <span className="truncate">{localIp || "Yükleniyor..."}</span>
                  ) : (
                    <span className="truncate text-sm">
                      {tunnelUrl || <button onClick={generateTunnel} className="text-blue-400 underline">Tünel Oluştur (Yakında)</button>}
                    </span>
                  )}
                  <button onClick={() => connectParty(partyMenuTab === "local" ? localIp : tunnelUrl)} className="ml-4 text-xs font-bold text-white bg-zinc-700 px-3 py-1 rounded hover:bg-zinc-600 whitespace-nowrap">Kendine Bağlan</button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-[1px] flex-1 bg-zinc-700"></div>
                <span className="text-zinc-500 text-sm font-bold">VEYA</span>
                <div className="h-[1px] flex-1 bg-zinc-700"></div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.joinLabel}</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder={partyMenuTab === "local" ? "Örn: 192.168.1.50" : "Örn: https://...loca.lt"} value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} className="flex-1 rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-zinc-500 transition" />
                  <button onClick={() => connectParty(targetAddress)} className="rounded-lg bg-red-600 px-6 font-bold hover:bg-red-700 transition">{t.connect}</button>
                </div>
              </div>

              {partyStatus === 'connected' && (
                <div className="mt-4 text-center text-green-500 font-bold bg-green-900/20 py-2 rounded-lg border border-green-900/50">
                  {t.connected}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM PLAYER (Kalite Seçici İle) */}
      {isPlaying && selectedMovie && (
        <div ref={playerContainerRef} onMouseMove={handleMouseMove} onClick={() => {if(showSubMenu) setShowSubMenu(false); if(showQualityMenu) setShowQualityMenu(false);}} className="fixed inset-0 z-[100] bg-black flex flex-col group">
          
          <video
            ref={videoRef} 
            src={getVideoSource()} 
            autoPlay 
            onClick={togglePlay}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); if (selectedMovie.progress && selectedMovie.progress > 0) e.currentTarget.currentTime = selectedMovie.progress; }}
            className="h-full w-full object-contain cursor-pointer"
          >
            {localSubs.map((sub) => <track key={sub.id} src={sub.url} kind="subtitles" srcLang={sub.label.includes("Türkçe") ? "tr" : "en"} label={sub.label} />)}
          </video>

          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
            <button onClick={closePlayer} className="absolute bottom-[90vh] left-6 text-4xl text-white hover:text-red-500 transition">✕</button>

            {isRemoteStreaming && (
              <div className="absolute bottom-[90vh] right-6 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.7)]">
                🔴 CANLI YAYIN ({streamQuality.toUpperCase()})
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm font-medium">{formatTime(currentTime)}</span>
              <input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-600" />
              <span className="text-sm font-medium text-zinc-400">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button onClick={togglePlay} className="text-4xl hover:scale-110 transition">{isVideoPlaying ? "⏸" : "▶"}</button>
                <h2 className="text-xl font-bold truncate max-w-md">{selectedMovie.title}</h2>
              </div>

              <div className="flex items-center gap-6 relative">
                
                {isRemoteStreaming && (
                  <div className="relative">
                    <button onClick={(e) => {e.stopPropagation(); setShowQualityMenu(!showQualityMenu); setShowSubMenu(false);}} className="text-xl hover:text-white transition">⚙️</button>
                    {showQualityMenu && (
                      <div className="absolute bottom-12 right-0 w-40 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl z-50">
                        <div className="bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 uppercase">{t.quality}</div>
                        {["original", "1080p", "720p", "480p"].map(q => (
                          <button key={q} onClick={() => { setStreamQuality(q as StreamQuality); setShowQualityMenu(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 ${streamQuality === q ? "text-red-500 font-bold" : "text-white"}`}>
                            {q === "original" ? t.qOriginal : q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={(e) => {e.stopPropagation(); setShowSubMenu(!showSubMenu); setShowQualityMenu(false);}} className="text-xl font-bold text-zinc-300 hover:text-white">CC</button>
                
                {showSubMenu && (
                  <div className="absolute bottom-12 right-0 w-72 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl z-50">
                    <div className="bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">{t.subs}</div>
                    <button onClick={() => {setActiveSubIndex(-1); setShowSubMenu(false)}} className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 ${activeSubIndex === -1 ? "text-red-500 font-bold" : "text-white"}`}>
                      {t.subOff}
                    </button>

                    {localSubs.map((sub, idx) => (
                      <div key={sub.id} className="flex items-center justify-between hover:bg-zinc-800 px-4 py-2">
                        <button onClick={() => {setActiveSubIndex(idx); setShowSubMenu(false)}} className={`flex-1 text-left text-sm ${activeSubIndex === idx ? "text-red-500 font-bold" : "text-white"}`}>
                          {sub.label} {sub.offset !== 0 && <span className="text-xs text-zinc-400">({sub.offset > 0 ? '+':''}{sub.offset}s)</span>}
                        </button>
                        
                        {activeSubIndex === idx && (
                          <div className="flex items-center gap-1 bg-zinc-950 rounded p-1">
                            <button onClick={(e) => {e.stopPropagation(); updateSubDelay(idx, -0.5)}} className="w-6 h-6 rounded flex items-center justify-center text-xs bg-zinc-800 hover:bg-zinc-700 text-white">-</button>
                            <button onClick={(e) => {e.stopPropagation(); updateSubDelay(idx, 0.5)}} className="w-6 h-6 rounded flex items-center justify-center text-xs bg-zinc-800 hover:bg-zinc-700 text-white">+</button>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    <div className="bg-zinc-800 px-4 py-2 mt-1 text-xs font-bold text-zinc-400 uppercase tracking-wider">İnternetten Bul</div>
                    
                    {!osApiKey ? (
                      <div className="p-2">
                        <p className="px-2 pb-2 text-xs text-zinc-500 text-center">API Key girmediniz. Tarayıcıdan indirip filmin klasörüne atabilirsiniz.</p>
                        <button 
                          onClick={async (e) => { e.stopPropagation(); const langQuery = lang === "tr" ? "tur" : "eng"; await openUrl(`https://www.opensubtitles.org/en/search/sublanguageid-${langQuery}/moviename-${encodeURIComponent(selectedMovie.title)}`); }} 
                          className="w-full rounded bg-blue-600/20 py-2 text-sm font-bold text-blue-400 hover:bg-blue-600/40 transition"
                        >
                          {t.searchSubWeb}
                        </button>
                      </div>
                    ) : (
                      <div className="p-2">
                        {osResults.length === 0 && !isSearchingOS && (
                          <button onClick={(e) => {e.stopPropagation(); searchOpenSubtitles()}} className="w-full rounded bg-red-600/20 py-2 text-sm font-bold text-red-500 hover:bg-red-600/40 transition">
                            API'de Ara ({lang.toUpperCase()})
                          </button>
                        )}
                        {isSearchingOS && <div className="text-center text-sm text-zinc-400 py-2">Aranıyor...</div>}
                        {osResults.map((res: any) => {
                          const fileId = res.attributes.files[0]?.file_id;
                          return fileId ? (
                            <button key={fileId} onClick={(e) => {e.stopPropagation(); downloadOpenSubtitle(fileId, res.attributes.release)}} className="w-full text-left px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800 rounded truncate">
                              ⬇ {res.attributes.release || "Subtitle File"}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={toggleFullscreen} className="text-2xl text-zinc-300 hover:text-white">⛶</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAY MODALI */}
      {selectedMovie && !isPlaying && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0b0b] animate-in fade-in zoom-in-95 duration-200">
          <button onClick={() => setSelectedMovie(null)} className="absolute left-8 top-8 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-2xl text-white backdrop-blur-md transition hover:scale-110 hover:bg-white/20">✕</button>
          
          <div className="relative h-[65vh] w-full">
            {selectedMovie.backdrop_url ? <img src={selectedMovie.backdrop_url} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-zinc-900" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/40 to-transparent" />
          </div>
          <div className="relative z-10 -mt-40 max-w-5xl px-10 pb-20">
            <h1 className="text-5xl font-extrabold shadow-black drop-shadow-2xl md:text-7xl">{selectedMovie.title}</h1>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-semibold text-zinc-300">
              {selectedMovie.rating != null && selectedMovie.rating > 0 && (
                <span className="flex items-center gap-1 text-yellow-500 font-bold text-base">
                  ⭐ {selectedMovie.rating.toFixed(1)}
                </span>
              )}
              {selectedMovie.year && <span>{selectedMovie.year}</span>}
              <span className="rounded border border-zinc-500 px-1.5 py-0.5 text-xs text-zinc-300">HD</span>
              {selectedMovie.genres && <span className="text-zinc-400">{selectedMovie.genres}</span>}
            </div>
            
            {selectedMovie.progress && selectedMovie.progress > 0 && (
               <div className="mt-4 flex items-center gap-3">
                 <div className="h-1.5 w-64 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min((selectedMovie.progress / ((selectedMovie.runtime || 120) * 60)) * 100, 100)}%` }} /></div>
               </div>
            )}
            
            <div className="mt-8 flex gap-4">
              <button onClick={() => startPlayer()} className="flex items-center justify-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200">
                <span className="text-2xl">▶</span> {selectedMovie.progress ? t.resume : t.play}
              </button>
              <button onClick={() => toggleWatchlist(selectedMovie)} className="flex items-center justify-center gap-2 rounded bg-zinc-800/80 backdrop-blur px-8 py-3 text-xl font-bold text-white transition hover:bg-zinc-700">
                {selectedMovie.watchlist ? "✓ " + t.inWatchlist : "+ " + t.toWatch}
              </button>
            </div>
            <p className="mt-10 max-w-3xl text-lg leading-relaxed text-zinc-300">{selectedMovie.overview || t.noOverview}</p>
          </div>
        </div>
      )}

      {/* ANA İÇERİK (HOME, LIBRARY, WATCHLIST) */}
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
                    {heroMovie.backdrop_url ? (
                      <img src={heroMovie.backdrop_url} key={heroMovie.video_path} className="h-full w-full object-cover opacity-80 animate-in fade-in duration-1000" />
                    ) : <div className="h-full w-full bg-zinc-900" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/20 to-[#0b0b0b]/40" />
                    <div className="absolute bottom-20 left-10 z-10 max-w-2xl drop-shadow-2xl">
                      <h1 className="text-6xl font-extrabold md:text-7xl">{heroMovie.title}</h1>
                      <p className="mt-4 line-clamp-3 text-lg font-medium text-zinc-300">{heroMovie.overview}</p>
                      <div className="mt-6 flex gap-4">
                        <button onClick={() => startPlayer(heroMovie)} className="flex items-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200">
                          <span className="text-2xl">▶</span> {heroMovie.progress ? t.resume : t.play}
                        </button>
                        <button onClick={() => setSelectedMovie(heroMovie)} className="flex items-center gap-2 rounded bg-zinc-500/50 px-8 py-3 text-xl font-bold text-white backdrop-blur transition hover:bg-zinc-500/70">
                          {t.info}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="px-10">
                  <MovieRow title={t.continue} data={continueWatching} />
                  <MovieRow title={t.watchlist} data={watchListMovies} />
                  <MovieRow title={t.newReleases} data={newReleases} />
                  <MovieRow title={t.topRated} data={topRated} />
                  {allGenres.slice(0, 3).map(genre => <MovieRow key={genre} title={`${genre}`} data={movies.filter(m => m.genres?.includes(genre)).slice(0,10)} />)}
                </div>
              </div>
            )}

            {activeTab === "watchlist" && (
              <div className="animate-in fade-in duration-500 px-10 pt-4">
                <h2 className="mb-6 text-2xl font-bold">{t.watchlist}</h2>
                {watchListMovies.length === 0 ? (
                  <div className="text-zinc-500">{t.emptyWatchlist}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {watchListMovies.map((movie) => (
                      <div key={movie.video_path} onClick={() => setSelectedMovie(movie)}>
                        <MovieCard movie={movie} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "library" && (
              <div className="animate-in fade-in duration-500 px-10 pt-4">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <input type="text" placeholder={t.search} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full max-w-xs rounded border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 outline-none transition focus:border-white" />
                  <div className="flex gap-4">
                    <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-white">
                      <option value="All">{t.allGenres}</option>
                      {allGenres.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-white">
                      <option value="title_asc">{t.sortAZ}</option>
                      <option value="year_desc">{t.sortNew}</option>
                      <option value="rating_desc">{t.sortRating}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {libraryMovies.map((movie) => (
                    <div key={movie.video_path} onClick={() => setSelectedMovie(movie)}>
                      <MovieCard movie={movie} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;