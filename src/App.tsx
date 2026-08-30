// src/App.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
// @ts-ignore
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import VirtualTheater from './VirtualTheater';

import { isTV, isWeb } from "./utils/platform";
import { shuffleArray, generateLocalShortCode, normalizePath } from "./utils/helpers";
import { MovieCardFallback } from "./components/MovieCardFallback";
import { HeroBanner } from "./components/HeroBanner";
import { MovieRow } from "./components/MovieRow";
import { useParty } from "./hooks/useParty";
import { usePlayer } from "./hooks/usePlayer";
import type { SortOption, TabState, Lang, SubtitleTrack, ChatMessage } from "./types/app";
import { dict } from "./i18n";

import { getMovieMetadata } from "./tmdb";
import {
  initializeDatabase, getMovies, saveMovie, updateMovieMetadata,
  getSetting, setSetting, removeLibraryFolder, removeMovie, clearDatabase, setWatchlist, type Movie,
} from "./database";

function App() {
  const [lang, setLang] = useState<Lang>("tr");
  const t = dict[lang];

  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [tauriConvertFileSrc, setTauriConvertFileSrc] = useState<any>(null);
  
  useEffect(() => {
    if (!isWeb) { import("@tauri-apps/api/core").then(({ convertFileSrc }) => setTauriConvertFileSrc(() => convertFileSrc)); }
  }, []);

  const [activeTab, setActiveTab] = useState<TabState>("home");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isVirtualTheaterOpen, setIsVirtualTheaterOpen] = useState(false);


  const [isGeneratingSub, setIsGeneratingSub] = useState(false);

  // Party Mode - Lobi State'leri
  const [hostName, setHostName] = useState<string>("Bilinmiyor");
  const [connectedGuests, setConnectedGuests] = useState<{id: string, name: string}[]>([]);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localSubs, setLocalSubs] = useState<SubtitleTrack[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); 

  const transcodeOffsetRef = useRef<number>(0);

  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Ses Güçlendirici (Voice Booster) State ve Referansları
  const [isVoiceBoosted, setIsVoiceBoosted] = useState(false);
  const audioCtxRef = useRef<any>(null);
  const sourceNodeRef = useRef<any>(null);
  const compressorRef = useRef<any>(null);

  // x265 to x264 Çeviri State'leri
  const [convertingMoviePath, setConvertingMoviePath] = useState<string | null>(null);
  const [convertProgress, setConvertProgress] = useState<number>(0);
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardFilters, setWizardFilters] = useState({ duration: "any", year: "any", rating: "any" });
  const [wizardResult, setWizardResult] = useState<Movie | null>(null);
  const [isWizardSpinning, setIsWizardSpinning] = useState(false);

  const handleWizardFind = () => {
    setIsWizardSpinning(true);
    setWizardResult(null);

    setTimeout(() => {
      let filtered = movies;
      
      if (wizardFilters.duration === "short") filtered = filtered.filter(m => (m.runtime || 0) > 0 && m.runtime! <= 90);
      else if (wizardFilters.duration === "medium") filtered = filtered.filter(m => (m.runtime || 0) > 90 && m.runtime! <= 120);
      else if (wizardFilters.duration === "long") filtered = filtered.filter(m => (m.runtime || 0) > 120);

      if (wizardFilters.year === "new") filtered = filtered.filter(m => (m.year || 0) >= 2020);
      else if (wizardFilters.year === "2010s") filtered = filtered.filter(m => (m.year || 0) >= 2010 && m.year! < 2020);
      else if (wizardFilters.year === "old") filtered = filtered.filter(m => (m.year || 0) > 0 && m.year! < 2010);

      if (wizardFilters.rating === "high") filtered = filtered.filter(m => (m.rating || 0) >= 8.0);
      else if (wizardFilters.rating === "mid") filtered = filtered.filter(m => (m.rating || 0) >= 6.0);

      if (filtered.length === 0) {
        showToast("Kütüphanede bu kriterlere uygun film yok!", "❌");
        setIsWizardSpinning(false);
        return;
      }

      const randomMatch = filtered[Math.floor(Math.random() * filtered.length)];
      setWizardResult(randomMatch);
      setIsWizardSpinning(false);
    }, 1500); 
  };
  
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

  // Altyazı Özelleştirme
  const [subSettings, setSubSettings] = useState({
    color: localStorage.getItem("kinflix_sub_color") || "text-white",
    size: localStorage.getItem("kinflix_sub_size") || "2.4vw",
    bg: localStorage.getItem("kinflix_sub_bg") || "text-shadow"
  });

  const updateSubSetting = (key: string, val: string) => {
    const newSettings = {...subSettings, [key]: val};
    setSubSettings(newSettings);
    localStorage.setItem("kinflix_sub_"+key, val);
  };

  // Oyuncu/Yönetmen Keşif Modalı
  const [personModal, setPersonModal] = useState<{name: string, photoUrl: string | null} | null>(null);

  const handlePersonClick = async (name: string) => {
    setPersonModal({ name, photoUrl: null });
    if (tmdbToken && !isWeb) {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}`, { 
          headers: { Authorization: `Bearer ${tmdbToken}`, accept: 'application/json' } 
        });
        const data = await res.json();
        if (data.results && data.results.length > 0 && data.results[0].profile_path) {
          setPersonModal({ name, photoUrl: `https://image.tmdb.org/t/p/w500${data.results[0].profile_path}` });
        }
      } catch (e) { console.error("Oyuncu resmi çekilemedi."); }
    }
  };

  const [themeColor, setThemeColor] = useState(localStorage.getItem("kinflix_theme") || "red");

  const [isPartyMenuOpen, setIsPartyMenuOpen] = useState(isWeb); 
  const [peerId, setPeerId] = useState<string>(""); 
  const [localIp, setLocalIp] = useState<string>(""); 
  const [targetAddress, setTargetAddress] = useState(""); 
  const [partyStatus, setPartyStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [connMode, setConnMode] = useState<"none" | "webrtc" | "ip">("none");

  const [bgVideoPlaying, setBgVideoPlaying] = useState(false);
  const [isBgMuted, setIsBgMuted] = useState(true);

  useEffect(() => {
    if (selectedMovie && !isPlaying) {
      setIsBgMuted(true);
      const timer = setTimeout(() => setBgVideoPlaying(true), 2500); 
      return () => { clearTimeout(timer); setBgVideoPlaying(false); };
    }
    setBgVideoPlaying(false);
  }, [selectedMovie, isPlaying]);
  
  const [isHost, setIsHost] = useState(!isWeb); 
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);
  const [remoteStream, _setRemoteStream] = useState<MediaStream | null>(null);
  
  const [isMicActive, setIsMicActive] = useState(false);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  
  const [isConverting, setIsConverting] = useState(false);

  const [toast, setToast] = useState<{text: string, icon: string} | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const toastTimer = useRef<number | null>(null);

  const [guestName, setGuestName] = useState<string>(localStorage.getItem("kinflix_guest_name") || "");
  const [showNameModal, setShowNameModal] = useState(false);

  const [runtimeFormat, setRuntimeFormat] = useState<"min" | "hour">("min");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const [ytsMovies, setYtsMovies] = useState<any[]>([]);
  const [isFetchingYts, setIsFetchingYts] = useState(false);
  
  const torrentClient = useRef<any>(null);

const [profiles, setProfiles] = useState<{id: string, name: string, color: string, avatar: string}[]>(
    JSON.parse(localStorage.getItem("kinflix_profiles") || '[{"id":"1","name":"tekin","color":"bg-blue-600","avatar":"🥷"}]')
  );
  const [activeProfile, setActiveProfile] = useState<string>(localStorage.getItem("kinflix_profile") || "");
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  const handleSelectProfile = (id: string) => {
    setActiveProfile(id);
    localStorage.setItem("kinflix_profile", id);
  };

  const handleAddProfile = () => {
    if (!newProfileName.trim()) return;
    const colors = ["bg-red-600", "bg-green-600", "bg-purple-600", "bg-yellow-600"];
    const avatars = ["👩‍🚀", "🧙‍♂️", "🧛‍♀️", "🤖"];
    const randomColor = colors[profiles.length % colors.length];
    const randomAvatar = avatars[profiles.length % avatars.length];
    
    const newProfiles = [...profiles, { id: Date.now().toString(), name: newProfileName, color: randomColor, avatar: randomAvatar }];
    setProfiles(newProfiles);
    localStorage.setItem("kinflix_profiles", JSON.stringify(newProfiles));
    setIsCreatingProfile(false);
    setNewProfileName("");
  };
  
  const [likedMovies, setLikedMovies] = useState<Record<string, number>>(JSON.parse(localStorage.getItem("kinflix_likes") || "{}"));

  const handleLike = (path: string, val: number) => {
    const newLikes = { ...likedMovies, [path]: val };
    setLikedMovies(newLikes);
    localStorage.setItem("kinflix_likes", JSON.stringify(newLikes));
    showToast(val === 1 ? "Film türleri favorilerine eklendi 👍" : "Bu tarz filmler daha az önerilecek 👎", "🎯");
  };
  
  const showToast = (text: string, icon: string = "🔔") => {
    setToast({text, icon});
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const isHostRef = useRef(!isWeb);
  const partyStatusRef = useRef<"disconnected" | "connecting" | "connected">("disconnected");
  const connModeRef = useRef<"none" | "webrtc" | "ip">("none");
  const targetAddressRef = useRef("");
  const localIpRef = useRef("");
  
  const moviesRef = useRef<Movie[]>([]);
  useEffect(() => { moviesRef.current = movies; }, [movies]);

  const selectedMovieRef = useRef<Movie | null>(null);
  useEffect(() => { selectedMovieRef.current = selectedMovie; }, [selectedMovie]);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null); 
  const callRef = useRef<MediaConnection | null>(null); 
  const voiceCallRef = useRef<MediaConnection | null>(null); 
  const wsRef = useRef<WebSocket | null>(null);
  
  const lastSyncTimeRef = useRef<number>(0);
  
  const localSubsRef = useRef<SubtitleTrack[]>([]);
  useEffect(() => { localSubsRef.current = localSubs; }, [localSubs]);

  const activeSubIndexRef = useRef<number>(-1);
  useEffect(() => { activeSubIndexRef.current = activeSubIndex; }, [activeSubIndex]);

  let hideControlsTimeout = useRef<number | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const isChatOpenRef = useRef(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0); 
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

  const continueWatching = useMemo(() => movies.filter(m => (m.progress || 0) > 5 && (m.is_watched || 0) === 0).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")), [movies]);
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

  const similarMovies = useMemo(() => {
    if (!selectedMovie) return [];
    return movies.filter(m => 
      m.video_path !== selectedMovie.video_path && 
      m.genres && selectedMovie.genres && 
      m.genres.split(", ").some(g => selectedMovie.genres?.includes(g))
    ).sort(() => 0.5 - Math.random()).slice(0, 15);
  }, [selectedMovie, movies]);
  
  const sameCollectionMovies = useMemo(() => {
    if (!selectedMovie || !selectedMovie.collection_name) return [];
    return movies.filter(m => m.collection_name === selectedMovie.collection_name && m.video_path !== selectedMovie.video_path);
  }, [selectedMovie, movies]);

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

  const libraryMovies = useMemo(() => {
    let filtered = movies.filter(movie => {
      const q = searchQuery.toLowerCase();
      return (movie.title && movie.title.toLowerCase().includes(q)) ||
             (movie.director && movie.director.toLowerCase().includes(q)) ||
             (movie.actors && movie.actors.toLowerCase().includes(q));
    });
    if (selectedGenre !== "All") filtered = filtered.filter(movie => movie.genres?.includes(selectedGenre));
    filtered.sort((a, b) => {
      if (sortBy === "title_asc") return a.title.localeCompare(b.title);
      else if (sortBy === "year_desc") return (b.year || 0) - (a.year || 0);
      else if (sortBy === "rating_desc") return (b.rating || 0) - (a.rating || 0);
      return 0;
    });
    return filtered;
  }, [movies, searchQuery, sortBy, selectedGenre]);

  const recommendedMovies = useMemo(() => {
    const likedPaths = Object.keys(likedMovies).filter(k => likedMovies[k] === 1);
    const dislikedPaths = Object.keys(likedMovies).filter(k => likedMovies[k] === -1);
    const genreWeights: Record<string, number> = {};
    
    movies.forEach(m => {
      if (likedPaths.includes(m.video_path) && m.genres) {
        m.genres.split(", ").forEach(g => { genreWeights[g] = (genreWeights[g] || 0) + 1; });
      }
    });

    const recommendations = movies
      .filter(m => !likedPaths.includes(m.video_path) && !dislikedPaths.includes(m.video_path))
      .map(m => {
        let score = 0;
        if (m.genres) m.genres.split(", ").forEach(g => { score += (genreWeights[g] || 0); });
        return { ...m, matchScore: score };
      })
      .filter(m => m.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 15);
      
    return recommendations.length > 0 ? recommendations : topRated;
  }, [movies, likedMovies, topRated]);

  // YTS API Çağrısı
  useEffect(() => {
    if (activeTab === "yts" && ytsMovies.length === 0) {
      setIsFetchingYts(true);
      
      const fetchYts = async () => {
        const mirrors = [
          "https://yts.torrentbay.to/api/v2/list_movies.json?limit=24&sort_by=like_count",
          "https://yts.proxm.cc/api/v2/list_movies.json?limit=24&sort_by=like_count",
          "https://yts.unblocked.lol/api/v2/list_movies.json?limit=24&sort_by=like_count"
        ];

        for (const url of mirrors) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (data?.data?.movies) {
              setYtsMovies(data.data.movies);
              return; 
            }
          } catch (err) {
            console.warn(`${url} engelli, diğerine geçiliyor...`);
          }
        }
        showToast(lang === 'tr' ? "YTS sunucularına ulaşılamadı. VPN deneyin." : "YTS servers unreachable. Try VPN.", "🚫");
      };

      fetchYts().finally(() => setIsFetchingYts(false));
    }
  }, [activeTab, ytsMovies.length, lang]);

  useEffect(() => {
    async function loadData() {
      if (!isWeb) {
        import('@tauri-apps/plugin-updater').then(({ check }) => {
          check().then(update => { if (update?.available) setUpdateInfo(update); }).catch(err => console.log("Güncelleme hatası:", err));
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

          const storedMovies = await getMovies(activeProfile || "default");
          setMovies(storedMovies);
          initPeerHost();
          // HOST: Yerel WebSocket ağına da dahil ol (Aynı ağdan gelen misafirleri dinlemek için)
          connectWebSocket("127.0.0.1");
        } catch (error) { setError(String(error)); }
      } else {
        const savedLang = localStorage.getItem("kinflix_language");
        if (savedLang) setLang(savedLang as Lang);
        
        const params = new URLSearchParams(window.location.search);
        const roomCode = params.get('room');
        if (roomCode) {
          setTargetAddress(roomCode);
          connectParty(roomCode);
        } else {
          const sessionStr = localStorage.getItem("kinflix_last_session");
          if (sessionStr) {
            const { target, time } = JSON.parse(sessionStr);
            if (Date.now() - time < 1000 * 60 * 60 * 3) {
              setTargetAddress(target);
              connectParty(target);
            }
          }
        }
      }

      const savedChat = localStorage.getItem("kinflix_chat_history");
      if (savedChat) setChatMessages(JSON.parse(savedChat));
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!isWeb && activeProfile) {
      getMovies(activeProfile).then(setMovies);
    }
  }, [activeProfile]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    if (isChatOpen) setUnreadCount(0);
  }, [isChatOpen]);

  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [chatMessages, isChatOpen]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { partyStatusRef.current = partyStatus; }, [partyStatus]);
  useEffect(() => { connModeRef.current = connMode; }, [connMode]);
  useEffect(() => { targetAddressRef.current = targetAddress; }, [targetAddress]);
  useEffect(() => { localIpRef.current = localIp; }, [localIp]);

  const forceUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update && update.available) {
        setUpdateInfo(update);
        showToast(t.updateFound, "🎉");
      } else {
        showToast(t.upToDate, "✅");
      }
    } catch (e) {
      showToast(t.updateError, "❌");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    if (!updateInfo || isWeb) return;
    setIsUpdating(true);
    try {
      await updateInfo.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) { alert("Güncelleme yüklenemedi: " + err); setIsUpdating(false); }
  };

  const handleSaveLang = async (val: Lang) => { 
    setLang(val); 
    if(!isWeb) await setSetting("language", val); 
    else localStorage.setItem("kinflix_language", val); 
  };
  const handleSaveToken = async (val: string) => { setTmdbToken(val); if(!isWeb) await setSetting("tmdb_token", val); };

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
      const normalizedInput = normalizePath(path);
      const dbMoviesInFolder = (await getMovies(activeProfile || "default")).filter(m => normalizePath(m.folder_path) === normalizedInput);
      
      for (const dbMovie of dbMoviesInFolder) {
        if (!scannedPaths.includes(dbMovie.video_path)) await removeMovie(dbMovie.video_path);
      }
      setMovies(await getMovies(activeProfile || "default"));
    } catch (error) { setError(String(error)); } finally { setScanning(false); }
  }

 async function syncMovieMetadata() {
    if (syncing || isWeb) return;
    if (!tmdbToken) { setIsSettingsOpen(true); return; }
    setSyncing(true); setError(null);
    try {
      const storedMovies = await getMovies(activeProfile || "default");
      
      // YENİ: Sadece daha önce metadata çekilmemiş (yeni eklenen) filmlere öncelik ver
      const pendingMovies = storedMovies.filter(m => !m.overview || m.overview.trim() === "");
      const targetMovies = pendingMovies.length > 0 ? pendingMovies : storedMovies;

      let successCount = 0;
      let failCount = 0;
      const batchSize = 5;

      for (let i = 0; i < targetMovies.length; i += batchSize) {
        const batch = targetMovies.slice(i, i + batchSize);
        await Promise.all(batch.map(async (movie) => {
          try {
            let cleanTitle = movie.title
              .replace(/\b(1080p|720p|480p|2160p|4k|bluray|x264|x265|hevc|dual|remux|webrip|hdrip|hdtv|yify|yts|aac|dd5|xvid)\b.*/i, '')
              .replace(/(\[.*?\]|\(.*?\))/g, '')
              .replace(/[-_.]/g, ' ')
              .trim();
            
            const metadata = await getMovieMetadata(cleanTitle, movie.year, tmdbToken, lang);
            if (metadata) {
              await updateMovieMetadata(movie.video_path, metadata);
              successCount++;
            } else {
              failCount++;
            }
          } catch (err) {
            failCount++;
          }
        }));
        
        if (i + batchSize < targetMovies.length) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
      setMovies(await getMovies(activeProfile || "default"));
      showToast(`✅ Yeni filmler eşitlendi! Başarılı: ${successCount}`, "🚀");
    } catch (error) { setError(String(error)); } finally { setSyncing(false); }
  }

  const toggleWatchlist = async (movie: Movie) => {
    if (isWeb) return;
    const newStatus = movie.watchlist ? 0 : 1;
    await setWatchlist(activeProfile || "default", movie.video_path, newStatus);
    setMovies(prev => prev.map(m => m.video_path === movie.video_path ? { ...m, watchlist: newStatus } : m));
    setSelectedMovie(prev => prev ? { ...prev, watchlist: newStatus } : null);
  };

  const playRandomMovie = () => {
    if (movies.length === 0) return;
    const randomMovie = movies[Math.floor(Math.random() * movies.length)];
    setSelectedMovie(randomMovie);
  };

  const networkHandlerRef = useRef<Function | null>(null);

  const handleMovieClick = (movie: Movie) => {
    setSelectedMovie(movie);
    setBgVideoPlaying(false);
  };

  const startPlayerRef = useRef<(movieOverride?: Movie) => void>(() => {});

  const {
    disconnectParty, connectParty, connectWebSocket, initPeerHost,
    broadcastEvent, handleSendChatText, handleSendChatImage, sendReaction, toggleVoiceChat,
  } = useParty({
    peerRef, connRef, wsRef, voiceCallRef, networkHandlerRef, localMicStreamRef, remoteAudioRef,
    videoRef, transcodeOffsetRef, moviesRef, selectedMovieRef, localSubsRef, activeSubIndexRef,
    isChatOpenRef, isHostRef, partyStatusRef, connModeRef, targetAddressRef, localIpRef, startPlayerRef,
    localIp, guestName, profiles, activeProfile, isHost, isMicActive, chatInput,
    setMovies, setHostName, setSelectedMovie, setIsPlaying, setIsVideoPlaying, setIsRemoteStreaming,
    setCurrentTime, setDuration, setLocalSubs, setActiveSubIndex, setPlaybackSpeed,
    setChatMessages, setUnreadCount, setChatInput, setIsHost, setPartyStatus, setConnMode,
    setTargetAddress, setPeerId, setConnectedGuests, setIsPartyMenuOpen, setShowNameModal,
    setIsMicActive, _setRemoteStream, showToast,
  });

  const {
    togglePlay, toggleFullscreen, toggleMute, toggleVoiceBoost, handleGenerateAISubtitle,
    convertToX264, changeSubtitle, updateSubDelay, searchStremioSubtitles, downloadStremioSubtitle,
    streamYtsMovie, startPlayer, closePlayer, formatTime, handleProgressMouseMove, handleSeekPlayer,
    handleVolumeChangePlayer, changePlaybackSpeed, togglePip, handleMouseMove, getSafeVideoSource,
  } = usePlayer({
    videoRef, playerContainerRef, previewVideoRef, transcodeOffsetRef, audioCtxRef, sourceNodeRef,
    compressorRef, torrentClient, hideControlsTimeout, callRef, peerRef, connRef,
    isHostRef, partyStatusRef, connModeRef, targetAddressRef,
    isPlaying, isVideoPlaying, currentTime, duration, volume, isMuted, playbackSpeed, showSpeedMenu,
    hoverTime, showSubMenu, activeSubIndex, localSubs, isVoiceBoosted, isConverting, isGeneratingSub,
    selectedMovie, isRemoteStreaming, runtimeFormat, isChatOpen, activeProfile, tauriConvertFileSrc,
    setIsPlaying, setIsVideoPlaying, setCurrentTime, setDuration, setVolume, setIsMuted, setPlaybackSpeed,
    setShowSpeedMenu, setHoverTime, setHoverX, setShowControls, setActiveSubIndex, setShowSubMenu,
    setLocalSubs, setOsResults, setIsSearchingOS, setDownloadingId, setOsError, setIsVoiceBoosted,
    setConvertingMoviePath, setConvertProgress, setIsConverting, setIsGeneratingSub, setSelectedMovie,
    setIsRemoteStreaming, setMovies,
    toggleWatchlist, broadcastEvent, showToast,
  });

  useEffect(() => { startPlayerRef.current = startPlayer; }, [startPlayer]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white relative flex flex-col overflow-hidden">
      {/* SİNEMATİK İNTRO */}
      {showIntro && (
        <div className="fixed inset-0 z-[99999] bg-[#0b0b0b] flex items-center justify-center transition-opacity duration-500">
          <style>
            {`
              @keyframes kinflix-zoom {
                0% { transform: scale(1); opacity: 0; filter: blur(10px); }
                30% { opacity: 1; filter: blur(0px); }
                100% { transform: scale(1.5); opacity: 0; filter: blur(5px); }
              }
              .animate-kinflix { animation: kinflix-zoom 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
            `}
          </style>
          <h1 className="text-red-600 text-6xl md:text-8xl font-black tracking-tighter animate-kinflix drop-shadow-[0_0_30px_rgba(220,38,38,0.8)]">
            KINFLIX
          </h1>
        </div>
      )}

      {/* Kim İzliyor Ekranı */}
      {!activeProfile && (!isWeb || isHost) && (
        <div className="fixed inset-0 z-[5000] bg-[#141414] flex flex-col items-center justify-center animate-in fade-in duration-500">
          <h1 className="text-4xl md:text-5xl font-medium text-white mb-10 tracking-wider text-center">Kim İzliyor?</h1>
          <div className="flex flex-wrap justify-center gap-4 md:gap-8 items-start px-4">
            {profiles.map(p => (
              <div key={p.id} className="flex flex-col items-center gap-4 cursor-pointer group" onClick={() => handleSelectProfile(p.id)}>
                <div className={`w-24 h-24 md:w-36 md:h-36 rounded-md ${p.color} border-2 border-transparent group-hover:border-white transition-all overflow-hidden flex items-center justify-center text-4xl md:text-6xl shadow-lg`}>
                  {p.avatar}
                </div>
                <span className="text-zinc-500 group-hover:text-white transition-colors text-sm md:text-lg">{p.name}</span>
              </div>
            ))}
            
            {profiles.length < 4 && (
              <div className="flex flex-col items-center gap-4 cursor-pointer group" onClick={() => setIsCreatingProfile(true)}>
                <div className="w-24 h-24 md:w-36 md:h-36 rounded-md border-2 border-zinc-700 group-hover:bg-zinc-800 transition-all flex items-center justify-center text-5xl text-zinc-500 group-hover:text-white">
                  +
                </div>
                <span className="text-zinc-500 group-hover:text-white transition-colors text-sm md:text-lg">Profil Ekle</span>
              </div>
            )}
          </div>

          {isCreatingProfile && (
            <div className="fixed inset-0 bg-black/90 z-[5010] flex items-center justify-center">
              <div className="bg-zinc-900 p-8 rounded-xl max-w-sm w-full shadow-2xl border border-zinc-800">
                <h2 className="text-2xl font-bold mb-4 text-white">Yeni Profil</h2>
                <input 
                  type="text" 
                  placeholder="İsim girin..." 
                  autoFocus
                  value={newProfileName} 
                  onChange={e => setNewProfileName(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleAddProfile()}
                  className="w-full bg-black border border-zinc-700 text-white rounded p-3 mb-6 outline-none focus:border-red-600 transition" 
                />
                <div className="flex gap-4">
                  <button onClick={handleAddProfile} className="flex-1 bg-white text-black font-bold py-3 rounded hover:bg-zinc-200 transition">Kaydet</button>
                  <button onClick={() => { setIsCreatingProfile(false); setNewProfileName(""); }} className="flex-1 border border-zinc-700 text-white font-bold py-3 rounded hover:bg-zinc-800 transition">İptal</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {toast && (
        <div className="fixed top-8 right-8 z-[9999] flex items-center gap-3 bg-zinc-900 border border-zinc-700 text-white px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-right-10 fade-in duration-300">
          <span className="text-2xl">{toast.icon}</span>
          <span className="font-bold">{toast.text}</span>
        </div>
      )}

      {isRemoteStreaming && !isHostRef.current && (
        <div className="bg-red-600/90 backdrop-blur text-white text-center py-2 text-sm font-bold flex items-center justify-center gap-4 shadow-lg z-50 relative">
          <span>🎭 {t.guestMode}</span>
          <span className="opacity-50">|</span>
          <span className="text-yellow-300">Bağlanılan Host: {hostName !== "Bilinmiyor" ? hostName : targetAddress || "Yerel Ağ"}</span>
          <button onClick={() => window.location.reload()} className="ml-4 bg-black/30 hover:bg-black/50 px-3 py-1 rounded transition">Ağdan Ayrıl</button>
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay />

      {updateInfo && !isWeb && (
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

      {isWeb && !isTV && partyStatus === 'connecting' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(220,38,38,0.5)]"></div>
          <h1 className="text-3xl font-bold text-white animate-pulse mb-8">Odaya Bağlanılıyor...</h1>
          <button 
            onClick={disconnectParty} 
            className="rounded-lg bg-zinc-800/80 px-6 py-3 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 hover:text-white border border-zinc-700 shadow-xl"
          >
            ✕ İptal Et ve Geri Dön
          </button>
        </div>
      )}

      {isWeb && !isTV && partyStatus === 'disconnected' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight mb-8">KIN<span className="text-red-600">FLIX</span> <span className="text-2xl text-zinc-500">WEB</span></h1>
          <p className="text-zinc-400 mb-8 max-w-md">Arkadaşının bilgisayarına doğrudan bağlanıp birlikte film izlemek için 6 Haneli Oda Kodunu veya IP'yi gir.</p>
          <div className="w-full max-w-md flex flex-col gap-4">
            <input 
              type="text" placeholder="Oda Kodu (Örn: AB7K2Q)" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && connectParty(targetAddress)}
              className="w-full rounded-xl border-2 border-zinc-800 bg-black px-6 py-4 text-center text-xl text-white outline-none focus:border-red-600 transition font-mono uppercase tracking-widest" 
            />
            <button onClick={() => connectParty(targetAddress)} className="w-full rounded-xl bg-red-600 py-4 text-xl font-bold hover:bg-red-700 transition shadow-[0_0_20px_rgba(220,38,38,0.4)]">
              Odaya Katıl 🚀
            </button>
          </div>
        </div>
      )}

      {isTV && partyStatus === 'disconnected' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight mb-8">KIN<span className="text-red-600">FLIX</span> <span className="text-2xl text-zinc-500">TV</span></h1>
          <p className="text-zinc-400 mb-8 max-w-md">Televizyon kumandası ile yerel ağı (Kısa TV Kodu) veya IP adresini girerek bağlan.</p>
          <div className="w-full max-w-md flex flex-col gap-4">
            <input 
              autoFocus type="number" placeholder="Örn: 900261" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} 
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
            <button onClick={() => setActiveTab("collections")} className={`transition hover:text-zinc-300 ${activeTab === "collections" ? "text-white" : "text-zinc-500"}`}>{t.collections}</button>
            <button onClick={() => setActiveTab("watchlist")} className={`transition hover:text-zinc-300 ${activeTab === "watchlist" ? "text-white" : "text-zinc-500"}`}>{t.watchlistTab}</button>
            <button onClick={() => setActiveTab("foryou")} className={`transition hover:text-zinc-300 ${activeTab === "foryou" ? "text-white" : "text-zinc-500"}`}>Sana Özel</button>
            <button onClick={() => setActiveTab("yts")} className={`transition hover:text-zinc-300 flex items-center gap-1 ${activeTab === "yts" ? "text-green-400" : "text-green-900"}`}>YTS Keşfet</button>
            <button onClick={playRandomMovie} className="ml-4 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-800 hover:scale-105">
              {t.random}
            </button>
            <button onClick={() => setIsWizardOpen(true)} className="ml-2 flex items-center gap-2 rounded-full border border-red-900/50 bg-red-600/20 px-4 py-1.5 text-xs font-bold text-red-500 transition hover:bg-red-600/40 hover:scale-105">
              ✨ Film Bul
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

      {/* ANA İÇERİK - MİSSİNG BÖLÜM BURASIYDI */}
      {(partyStatus === 'connected' || (!isWeb && !isTV)) && (
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
                  <HeroBanner movies={movies} onPlay={startPlayer} onInfo={handleMovieClick} t={t} />
                  <div className="px-10">
                    <MovieRow title={t.continue} data={continueWatching} onMovieClick={handleMovieClick} />
                    <MovieRow title={t.watchlist} data={watchListMovies} onMovieClick={handleMovieClick} />
                    <MovieRow title={t.newReleases} data={newReleases} onMovieClick={handleMovieClick} />
                    <MovieRow title={t.topRated} data={topRated} onMovieClick={handleMovieClick} />
                    {homeGenres.map(item => <MovieRow key={item.genre} title={`${item.genre}`} data={item.movies} onMovieClick={handleMovieClick} />)}
                  </div>
                </div>
              )}
              {activeTab === "collections" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <h2 className="mb-6 text-2xl font-bold">{t.collections}</h2>
                  {collections.length === 0 ? <div className="text-zinc-500">Herhangi bir koleksiyon bulunamadı.</div> : (
                    <div>
                      {collections.map(item => <MovieRow key={item.name} title={`🎬 ${item.name}`} data={item.movies} onMovieClick={handleMovieClick} />)}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "watchlist" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <h2 className="mb-6 text-2xl font-bold">{t.watchlist}</h2>
                  {watchListMovies.length === 0 ? <div className="text-zinc-500">{t.emptyWatchlist}</div> : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">{watchListMovies.map((movie) => <div key={movie.video_path} onClick={() => handleMovieClick(movie)}><MovieCardFallback movie={movie} /></div>)}</div>
                  )}
                </div>
              )}
              {activeTab === "foryou" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <h2 className="mb-2 text-2xl font-bold">✨ Sana Özel Algoritma</h2>
                  <p className="text-zinc-500 text-sm mb-6">Beğendiğin filmlerin ağırlık grafiğine göre senin için seçilenler.</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {recommendedMovies.map((movie: Movie) => <div key={movie.video_path} onClick={() => handleMovieClick(movie)}><MovieCardFallback movie={movie} /></div>)}
                  </div>
                </div>
              )}
              {activeTab === "yts" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-green-400">🏴‍☠️ YTS Dünyası</h2>
                    <span className="text-xs text-zinc-500">P2P Torrent Streaming</span>
                  </div>
                  {isFetchingYts ? <div className="text-center text-zinc-500 py-10 animate-pulse">Korsan ağlara bağlanılıyor...</div> : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                      {ytsMovies.map((yts: any) => (
                        <div key={yts.id} className="w-full h-full aspect-[2/3] relative group bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-green-500 transition shadow-lg cursor-pointer" onClick={() => streamYtsMovie(yts)}>
                          <img src={yts.large_cover_image} alt={yts.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent p-3 flex flex-col justify-end">
                            <span className="text-green-400 font-bold text-xs mb-1">⭐ {yts.rating}</span>
                            <span className="text-white font-bold text-sm truncate">{yts.title}</span>
                          </div>
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
                      <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-white"><option value="All">{t.allGenres}</option>{allGenres.map(g => <option key={g} value={g}>{g}</option>)}</select>
                      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-white"><option value="title_asc">{t.sortAZ}</option><option value="year_desc">{t.sortNew}</option><option value="rating_desc">{t.sortRating}</option></select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">{libraryMovies.map((movie: Movie) => <div key={movie.video_path} onClick={() => handleMovieClick(movie)}><MovieCardFallback movie={movie} /></div>)}</div>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {isPartyMenuOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 flex gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-3xl font-bold">🎉 {t.party}</h2>
              </div>
              
{!isWeb && isHost ? (
                <>
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 text-center">
                    <h3 className="mb-2 text-sm font-semibold text-zinc-400">Sabit İnternet Oda Kodu (Host):</h3>
                    <div className="bg-black rounded-lg p-2 text-4xl font-black tracking-widest text-green-400 border border-zinc-800 flex justify-between items-center px-6">
                      <div className="flex items-center gap-3">
                        <span>{peerId || "..."}</span>
                        {peerId && (
                          <button onClick={() => { navigator.clipboard.writeText(peerId); showToast("Oda kodu kopyalandı!", "📋"); }} className="text-xl text-zinc-500 hover:text-white transition hover:scale-110" title="Kodu Kopyala">
                            📋
                          </button>
                        )}
                      </div>
                      <button onClick={() => {
                        localStorage.removeItem("kinflix_host_code");
                        window.location.reload();
                      }} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg font-bold border border-zinc-700 transition">
                        🔄 Kodu Değiştir
                      </button>
                    </div>
                    
                    <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-400">Yerel IP (Aynı Ev / Wi-Fi İçin):</h3>
                    <div className="bg-black rounded-lg p-2 text-xl font-mono tracking-widest text-blue-400 border border-zinc-800 flex justify-between items-center px-4">
                      <div className="flex items-center gap-3">
                        <span>{localIp || "Yükleniyor..."}</span>
                        {localIp && localIp !== "Bilinmiyor" && (
                          <button onClick={() => { navigator.clipboard.writeText(localIp); showToast("IP kopyalandı!", "📋"); }} className="text-lg text-zinc-500 hover:text-white transition hover:scale-110" title="IP'yi Kopyala">
                            📋
                          </button>
                        )}
                      </div>
                      {generateLocalShortCode(localIp) && (
                        <span 
                          onClick={() => { navigator.clipboard.writeText(generateLocalShortCode(localIp)); showToast("TV Kodu kopyalandı!", "📋"); }}
                          className="text-sm bg-blue-900/30 text-blue-300 px-3 py-1 rounded border border-blue-800/50 flex flex-col items-center cursor-pointer hover:bg-blue-800/60 transition"
                          title="TV Kodunu Kopyala"
                        >
                          <span className="text-[10px] uppercase tracking-wider text-blue-500 font-bold mb-0.5">TV Kısa Kodu</span>
                          <div className="flex items-center gap-1.5">
                            <span>{generateLocalShortCode(localIp)}</span>
                            <span className="text-xs opacity-50">📋</span>
                          </div>
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-zinc-400">Arkadaşının Kodunu Gir:</h3>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Örn: AB7K2Q veya 900261" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} className="flex-1 rounded-lg border border-zinc-700 bg-black px-4 py-2 text-white outline-none focus:border-zinc-500 transition font-mono uppercase" />
                      <button onClick={() => connectParty(targetAddress)} className="rounded-lg bg-red-600 px-6 font-bold hover:bg-red-700 transition">{t.connect}</button>
                    </div>
                  </div>
                  
                  {partyStatus === 'connected' && (
                     <button onClick={disconnectParty} className="mt-4 w-full rounded bg-red-600/20 py-3 text-red-500 font-bold hover:bg-red-600/40 border border-red-900/50 transition">
                       Ağı Kapat ve Odadan Ayrıl
                     </button>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                   <h3 className="text-2xl font-bold text-green-400 mb-2">Başarıyla Bağlandınız!</h3>
                   <p className="text-zinc-400 mb-8">Şu anda oda kurucusunun (Host) kütüphanesini görüntülüyorsunuz.</p>
                   
                   <button onClick={() => {
                     if (partyStatus === 'connected') {
                       broadcastEvent("request_catalog");
                     } else {
                       alert("Önce bir odaya bağlı olmalısın!");
                     }
                   }} className="w-full rounded bg-blue-600/20 py-3 text-blue-400 font-bold hover:bg-blue-600/40 border border-blue-900/50 transition mb-4">
                     🔄 Kataloğu Senkronize Et
                   </button>
                   
                   <button onClick={disconnectParty} className="w-full rounded bg-red-600/20 py-3 text-red-500 font-bold hover:bg-red-600/40 border border-red-900/50 transition">
                     Odadan Ayrıl / Bağlantıyı Kes
                   </button>
                </div>
              )}
            </div>
            
            {!isWeb && isHost && (
              <div className="w-48 flex flex-col items-center justify-center border-l border-zinc-800 pl-8">
                 <h3 className="text-sm font-bold text-zinc-400 mb-4 text-center">Telefondan Katıl</h3>
                 <div className="bg-white p-2 rounded-xl">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('https://kinflix.netlify.app/?room=' + peerId)}`} alt="Kinflix QR" className="w-32 h-32" />
                 </div>
                 <p className="text-xs text-zinc-500 mt-4 text-center">Kameranı okutarak anında odaya gir.</p>
                 <button onClick={() => setIsPartyMenuOpen(false)} className="mt-8 text-zinc-500 hover:text-white font-bold">Kapat ✕</button>
              </div>
            )}
            {(isWeb || !isHost) && (
              <button onClick={() => setIsPartyMenuOpen(false)} className="absolute top-4 right-6 text-2xl text-zinc-500 hover:text-white font-bold">✕</button>
            )}
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/90 backdrop-blur-sm px-4 py-8">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 p-8 shadow-2xl relative [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-900 [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
            
            <div className="sticky -top-8 bg-zinc-900 z-50 pt-8 pb-4 mb-6 flex items-center justify-between border-b border-zinc-800">
              <h2 className="text-3xl font-bold">⚙️ {t.settings}</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-2xl font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-red-600 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg">✕</button>
            </div>
            
            <div className="mb-6 flex items-center gap-4 border-b border-zinc-800 pb-6">
              <h3 className="text-sm font-semibold text-zinc-400">{t.language}:</h3>
              <select value={lang} onChange={(e) => handleSaveLang(e.target.value as Lang)} className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-white outline-none">
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="mb-6 border-b border-zinc-800 pb-6">
              <h3 className="text-white font-bold mb-4">🔤 Altyazı Görünümü</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-bold">Renk</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateSubSetting('color', 'text-white')} className={`flex-1 py-2 rounded-lg font-bold border transition ${subSettings.color === 'text-white' ? 'border-white bg-white text-black' : 'border-zinc-700 bg-zinc-900 text-white'}`}>Beyaz</button>
                    <button onClick={() => updateSubSetting('color', 'text-yellow-400')} className={`flex-1 py-2 rounded-lg font-bold border transition ${subSettings.color === 'text-yellow-400' ? 'border-yellow-400 bg-yellow-400 text-black' : 'border-zinc-700 bg-zinc-900 text-yellow-400'}`}>Sarı</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-bold">Boyut</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateSubSetting('size', '1.8vw')} className={`flex-1 py-2 rounded-lg text-sm border transition ${subSettings.size === '1.8vw' ? 'border-red-500 bg-red-600/20' : 'border-zinc-700 bg-zinc-900'}`}>A-</button>
                    <button onClick={() => updateSubSetting('size', '2.4vw')} className={`flex-1 py-2 rounded-lg text-base border transition ${subSettings.size === '2.4vw' ? 'border-red-500 bg-red-600/20' : 'border-zinc-700 bg-zinc-900'}`}>A</button>
                    <button onClick={() => updateSubSetting('size', '3.2vw')} className={`flex-1 py-2 rounded-lg text-xl font-bold border transition ${subSettings.size === '3.2vw' ? 'border-red-500 bg-red-600/20' : 'border-zinc-700 bg-zinc-900'}`}>A+</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-bold">Arkaplan</p>
                  <select value={subSettings.bg} onChange={(e) => updateSubSetting('bg', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 px-3 outline-none focus:border-red-500">
                    <option value="none">Şeffaf (Sadece Yazı)</option>
                    <option value="text-shadow">Siyah Gölge (Standart)</option>
                    <option value="solid">Siyah Kutu (Yüksek Okunabilirlik)</option>
                  </select>
                </div>
              </div>
            </div>

            {(!isHost && partyStatus === 'connected') || isWeb || isTV ? (
              <div className="text-center py-6">
                <h3 className="text-2xl font-bold text-white mb-4">Misafir Modundasınız 🎭</h3>
                <p className="text-zinc-400 leading-relaxed max-w-md mx-auto">Oda kurucusunun (Host) kütüphanesini görüntülüyorsunuz. Bütün film verileri doğrudan Host'tan size aktarılıyor.<br/><br/>Arkanıza yaslanın ve filmin tadını çıkarın!</p>
                
                <div className="mt-8 rounded-xl border border-blue-900/50 bg-blue-950/20 p-4 max-w-xs mx-auto">
                  <h3 className="text-blue-500 font-bold mb-2">Sistem Durumu</h3>
                  <p className="text-sm text-zinc-300">Web arayüzü Vercel/Netlify tarafından otomatik güncellenir.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.apiToken}</h3>
                  <input type="password" value={tmdbToken} onChange={(e) => handleSaveToken(e.target.value)} placeholder="TMDB Read Access Token" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between"><h3 className="text-lg font-semibold text-zinc-300">{t.libCount} ({libraries.length})</h3><button onClick={chooseFolder} disabled={scanning} className="text-sm font-bold text-red-500 hover:text-red-400">{t.addLib}</button></div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                    {libraries.length === 0 ? <p className="p-2 text-sm text-zinc-500">Yok</p> : libraries.map(lib => (
                      <div key={lib} className="flex items-center justify-between rounded p-2 hover:bg-zinc-800"><span className="truncate text-sm text-zinc-300">{lib}</span><button onClick={async () => { await removeLibraryFolder(lib); setMovies(await getMovies(activeProfile || "default")); }} className="ml-4 text-xs font-bold text-red-500">{t.remove}</button></div>
                    ))}
                  </div>
                </div>

                <div className="mb-6 rounded-xl border border-blue-900/50 bg-blue-950/20 p-4">
                  <h3 className="text-blue-500 font-bold mb-2">{t.desktopUpdates}</h3>
                  <button disabled={isCheckingUpdate} onClick={forceUpdateCheck} className={`rounded px-4 py-2 text-sm font-bold transition text-white ${isCheckingUpdate ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    {isCheckingUpdate ? t.checkingUpdates : t.checkUpdates}
                  </button>
                </div>

                <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <h3 className="text-white font-bold mb-3">Vurgu Rengi (Tema)</h3>
                  <div className="flex gap-3">
                    <button onClick={() => {setThemeColor('red'); localStorage.setItem("kinflix_theme", "red");}} className={`w-8 h-8 rounded-full bg-red-600 ${themeColor === 'red' ? 'ring-4 ring-white' : ''}`}></button>
                    <button onClick={() => {setThemeColor('blue'); localStorage.setItem("kinflix_theme", "blue");}} className={`w-8 h-8 rounded-full bg-blue-600 ${themeColor === 'blue' ? 'ring-4 ring-white' : ''}`}></button>
                    <button onClick={() => {setThemeColor('green'); localStorage.setItem("kinflix_theme", "green");}} className={`w-8 h-8 rounded-full bg-green-600 ${themeColor === 'green' ? 'ring-4 ring-white' : ''}`}></button>
                    <button onClick={() => {setThemeColor('purple'); localStorage.setItem("kinflix_theme", "purple");}} className={`w-8 h-8 rounded-full bg-purple-600 ${themeColor === 'purple' ? 'ring-4 ring-white' : ''}`}></button>
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
          <div className="relative h-[65vh] w-full overflow-hidden">
            {selectedMovie.backdrop_url && (
              <img 
                src={selectedMovie.backdrop_url} 
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${bgVideoPlaying ? 'opacity-0' : 'opacity-100'}`} 
              />
            )}
{bgVideoPlaying && !selectedMovie.video_path.startsWith("torrent-") && (
              <>
                <video 
                  src={tauriConvertFileSrc ? tauriConvertFileSrc(selectedMovie.video_path) : ""} 
                  muted={isBgMuted} 
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover opacity-60 animate-in fade-in duration-1000"
                  onLoadedMetadata={(e) => { 
                    // Sadece filmin yarısına (0.5) sarsın yeter, başka bir koda ihtiyacı yok
                    e.currentTarget.currentTime = ((selectedMovie.runtime || 120) * 60) * 0.5; 
                  }}
                />
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsBgMuted(!isBgMuted); }}
                  className="absolute bottom-8 right-10 z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-zinc-500 bg-black/40 text-xl text-white backdrop-blur transition hover:scale-110 hover:border-white hover:bg-black/60 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                  title={isBgMuted ? "Sesi Aç" : "Sesi Kapat"}
                >
                  {isBgMuted ? "🔇" : "🔊"}
                </button>
              </>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/60 to-transparent pointer-events-none" />
          </div>         
          <div className="relative z-10 -mt-56 max-w-5xl px-10 pb-20">
            <h1 className="text-5xl font-extrabold shadow-black drop-shadow-2xl md:text-7xl">{selectedMovie.title}</h1>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-semibold text-zinc-300">
              {selectedMovie.rating != null && selectedMovie.rating > 0 && <span className="flex items-center gap-1 text-yellow-500 font-bold text-base">⭐ {selectedMovie.rating.toFixed(1)} IMDB</span>}
              {selectedMovie.year && <span>{selectedMovie.year}</span>}
              {selectedMovie.runtime && <span>{selectedMovie.runtime} min</span>}
              <span className="rounded border border-zinc-500 px-1.5 py-0.5 text-xs text-zinc-300">HD</span>
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => handleLike(selectedMovie.video_path, 1)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${likedMovies[selectedMovie.video_path] === 1 ? 'bg-white text-black' : 'bg-zinc-800 text-white'}`}>👍</button>
              <button onClick={() => handleLike(selectedMovie.video_path, -1)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${likedMovies[selectedMovie.video_path] === -1 ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white'}`}>👎</button>
            </div>
            
            {(selectedMovie.progress || 0) > 0 && (selectedMovie.is_watched || 0) === 0 && !isWeb && <div className="mt-4 flex items-center gap-3"><div className="h-1.5 w-64 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{ width: `${Math.min(((selectedMovie.progress || 0) / ((selectedMovie.runtime || 120) * 60)) * 100, 100)}%` }} /></div></div>}
            
            <div className="mt-8 flex flex-wrap gap-4">
              <button onClick={() => startPlayer()} className="flex items-center justify-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200">
                <span className="text-2xl">▶</span> {(selectedMovie.progress || 0) > 0 && (selectedMovie.is_watched || 0) === 0 && !isWeb ? t.resume : t.play}
              </button>

              {/* 3D SİNEMA MODU BUTONU BURAYA GELECEK */}
              <button 
                onClick={() => {
                  startPlayer(); // Önce filmi normal oynatıcıda başlatıyoruz (videoRef oluşsun diye)
                  setTimeout(() => setIsVirtualTheaterOpen(true), 800); // 800ms sonra 3D salonu açıyoruz
                }}
                className="flex items-center justify-center gap-2 rounded px-8 py-3 text-sm font-bold text-white transition backdrop-blur border bg-purple-600/20 border-purple-500/50 hover:bg-purple-600/40 hover:border-purple-400"
              >
                👓 3D Sinema Modu
              </button>

                {!isWeb && !selectedMovie.video_path.startsWith("torrent-") && (
                  <div className="mt-4 max-w-sm w-full">
                    {convertingMoviePath === selectedMovie.video_path ? (
                      <div className="w-full bg-zinc-900/80 rounded-xl p-4 border border-zinc-700 backdrop-blur">
                        <div className="flex justify-between text-xs font-bold mb-2">
                          <span className="text-blue-400 animate-pulse">⏳ x264'e Çevriliyor... İşlemci yanıyor 🔥</span>
                          <span className="text-white">{convertProgress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.8)]" 
                            style={{ width: `${convertProgress}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            setConvertingMoviePath(selectedMovie.video_path);
                            setConvertProgress(0);
                            showToast("Dönüştürme motoru başlatıldı...", "⏳");
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('convert_video', { path: selectedMovie.video_path });
                          } catch (err) {
                            setConvertingMoviePath(null);
                            showToast("Çeviri başlatılamadı!", "❌");
                          }
                        }} 
                        className="flex items-center justify-center gap-2 w-full bg-zinc-800 hover:bg-blue-600 text-white text-sm font-bold py-3 px-4 rounded-xl transition border border-zinc-700 hover:border-blue-500 shadow-lg"
                      >
                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"></path></svg>
                        {t.convertToX264}
                      </button>

                    )}
                  </div>
                )}
              {!isWeb && <button onClick={() => toggleWatchlist(selectedMovie)} className="flex items-center justify-center gap-2 rounded bg-zinc-800/80 backdrop-blur px-8 py-3 text-xl font-bold text-white transition hover:bg-zinc-700">{selectedMovie.watchlist ? "✓ " + t.inWatchlist : "+ " + t.toWatch}</button>}
              
              {!isWeb && isHost && !selectedMovie.video_path.startsWith("torrent-") && (
                <button disabled={isConverting} onClick={convertToX264} className={`flex items-center justify-center gap-2 rounded px-8 py-3 text-sm font-bold text-white transition backdrop-blur border ${isConverting ? 'bg-blue-600/50 border-blue-500 cursor-not-allowed' : 'bg-blue-600/20 border-blue-500/50 hover:bg-blue-600/40 hover:border-blue-400'}`}>
                  {isConverting ? "⏳ Çevriliyor..." : "🔄 Web İçin Optimize Et (x264)"}
                </button>
              )}
            </div>

            <div className="mt-10 flex flex-col md:flex-row gap-10">
              <div className="flex-[2]"><p className="text-lg leading-relaxed text-zinc-300">{selectedMovie.overview || t.noOverview}</p></div>
              <div className="flex-1 flex flex-col gap-3 text-sm">
                {selectedMovie.genres && <p><span className="text-zinc-500">Genres:</span> <span className="text-zinc-300">{selectedMovie.genres}</span></p>}
                {selectedMovie.director && (
                  <p><span className="text-zinc-500">Director:</span> {selectedMovie.director.split(',').map((dir, i, arr) => (
                    <span key={i}><span onClick={() => handlePersonClick(dir.trim())} className="text-zinc-300 hover:text-white hover:underline cursor-pointer transition">{dir.trim()}</span>{i < arr.length - 1 ? ', ' : ''}</span>
                  ))}</p>
                )}
                {selectedMovie.actors && (
                  <p><span className="text-zinc-500">Cast:</span> {selectedMovie.actors.split(',').map((actor, i, arr) => (
                    <span key={i}><span onClick={() => handlePersonClick(actor.trim())} className="text-zinc-300 hover:text-white hover:underline cursor-pointer transition">{actor.trim()}</span>{i < arr.length - 1 ? ', ' : ''}</span>
                  ))}</p>
                )}
                {selectedMovie.collection_name && <p><span className="text-zinc-500">Franchise:</span> <span className="text-zinc-300">{selectedMovie.collection_name}</span></p>}
              </div>
            </div>
            
            {sameCollectionMovies.length > 0 && (
              <div className="mt-16">
                <MovieRow title="🎬 Aynı Serideki Filmler" data={sameCollectionMovies} onMovieClick={handleMovieClick} />
              </div>
            )}
            {similarMovies.length > 0 && (
              <div className="mt-16">
                <MovieRow title={t.similar} data={similarMovies} onMovieClick={handleMovieClick} />
              </div>
            )}
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

      {!isTV && partyStatus === 'connected' && !isPlaying && (
        <button onClick={() => setIsChatOpen(!isChatOpen)} className="fixed bottom-8 right-8 z-[150] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-2xl hover:scale-110 transition-transform text-2xl relative">
          💬
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-lg border border-red-900 animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* SOHBET VE LOBİ PENCERESİ */}
      {!isTV && isChatOpen && partyStatus === 'connected' && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-950 border-l border-zinc-800 z-[250] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center shadow-md">
            <h3 className="font-bold text-white flex items-center gap-2">📡 Party Lobi <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span></h3>
            <button onClick={toggleVoiceChat} className={`flex items-center justify-center w-8 h-8 rounded-full transition ${isMicActive ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
              {isMicActive ? '🎙️' : '🎤'}
            </button>
            <button onClick={() => setIsChatOpen(false)} className="text-zinc-400 hover:text-white transition ml-2">✕</button>
          </div>
          
          {/* Lobi Kişileri */}
          <div className="bg-zinc-950 p-3 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 font-bold mb-2 uppercase">Odada Kimler Var?</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-yellow-400 font-bold">
                👑 {isHostRef.current ? (profiles.find(p => p.id === activeProfile)?.name || "Sen (Host)") : hostName}
              </div>
              
              {isHostRef.current ? (
                connectedGuests.length > 0 ? (
                  connectedGuests.map((guest, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-zinc-300 pl-4 border-l-2 border-zinc-700">
                      👤 {guest.name}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-zinc-600 italic pl-4">Henüz kimse katılmadı...</div>
                )
              ) : (
                <div className="flex items-center gap-2 text-sm text-zinc-300 pl-4 border-l-2 border-zinc-700">
                   👤 {guestName || localStorage.getItem("kinflix_guest_name") || "Sen"}
                </div>
              )}
            </div>
          </div>
          
          {/* Mesajlaşma Alanı */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-zinc-950">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`relative group max-w-[85%] rounded-xl p-2.5 text-sm shadow-md ${msg.sender === 'me' ? 'bg-blue-600 text-white self-end rounded-tr-sm' : 'bg-zinc-800 text-zinc-200 self-start rounded-tl-sm'}`}>
                {msg.author && (
                  <span className={`text-[10px] font-bold block mb-1 opacity-80 ${msg.sender === 'me' ? 'text-blue-200 text-right' : 'text-zinc-400 text-left'}`}>
                    {msg.author}
                  </span>
                )}
                {msg.type === 'text' ? <p className="break-words">{msg.content}</p> : <img src={msg.content} className="rounded-lg w-full object-cover cursor-pointer hover:opacity-80 transition" onClick={async () => { if(!isWeb) { const { openUrl } = await import('@tauri-apps/plugin-opener'); openUrl(msg.content); } else { window.open(msg.content); } }} />}
                
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {Object.entries(msg.reactions).map(([emo, count]) => (
                      <span key={emo} className={`text-xs rounded-full px-1.5 py-0.5 border ${msg.sender === 'me' ? 'bg-blue-700 border-blue-500' : 'bg-zinc-700 border-zinc-600'}`}>
                        {emo} <span className="opacity-70">{count}</span>
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[10px] opacity-50 block mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                
                <div className={`absolute -top-4 ${msg.sender === 'me' ? 'left-0' : 'right-0'} hidden group-hover:flex bg-zinc-800 border border-zinc-700 rounded-full shadow-xl p-1 gap-1 z-50`}>
                  {['👍', '❤️', '😂', '😲'].map(emo => (
                     <button key={emo} onClick={() => sendReaction(msg.id, emo)} className="hover:scale-125 transition px-1">{emo}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-zinc-900 border-t border-zinc-800 flex flex-col">
            <div className="flex gap-3 px-4 pt-2 pb-1 text-xl justify-center border-b border-zinc-800/50 bg-black/20">
              {['😀', '😂', '❤️', '🔥', '👍', '😲'].map(emo => (
                <button key={emo} onClick={() => setChatInput(prev => prev + emo)} className="hover:scale-125 transition drop-shadow-md">{emo}</button>
              ))}
            </div>
            <div className="flex gap-2 items-center p-3">
              <label className="cursor-pointer text-xl hover:scale-110 transition text-zinc-400 hover:text-white">
                📷 <input type="file" className="hidden" accept="image/*" onChange={handleSendChatImage} />
              </label>
              <input type="text" className="flex-1 bg-black border border-zinc-800 rounded-full px-4 py-2 text-sm text-white outline-none focus:border-blue-500 transition" placeholder={t.chatMsg} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendChatText()} />
              <button onClick={handleSendChatText} className="text-blue-500 font-bold px-2 hover:text-blue-400 transition">➤</button>
            </div>
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
<video
            ref={videoRef} 
            crossOrigin="anonymous" 
            src={getSafeVideoSource()} 
            autoPlay 
            playsInline
            onClick={togglePlay}
            onTimeUpdate={(e) => { 
              // 1. MİSAFİR KENDİ KAFASINA GÖRE SÜRE GÜNCELLEYEMEZ
              if (isRemoteStreaming && !isHostRef.current) return;

              // 2. MKV 10 SANİYE/BAŞA SARMA ÇÖZÜMÜ (Offset'i ekliyoruz)
              const cTime = e.currentTarget.currentTime + transcodeOffsetRef.current;
              setCurrentTime(cTime);

              // 3. HOST İSE ZAMANI MİSAFİRLERE YAYINLA
              if (isHostRef.current && partyStatusRef.current === 'connected') {
                if (Math.floor(cTime) !== lastSyncTimeRef.current) {
                  lastSyncTimeRef.current = Math.floor(cTime);
                  
                  // MKV Infinity verirse TMDB süresini (runtime * 60) yedek olarak gönder
                  const safeDuration = (e.currentTarget.duration && e.currentTarget.duration !== Infinity) 
                    ? e.currentTarget.duration 
                    : ((selectedMovieRef.current?.runtime || 120) * 60);
                    
                  broadcastEvent("sync_time", { time: cTime, duration: safeDuration });
                }
              }
            }}
            onLoadedMetadata={(e) => { 
              if (isRemoteStreaming && !isHostRef.current) return;

              // MKV transcode yüzünden süre bozuk gelirse kütüphaneden çek
              const actualDuration = (e.currentTarget.duration && e.currentTarget.duration > 0 && e.currentTarget.duration !== Infinity) 
                 ? e.currentTarget.duration 
                 : (selectedMovieRef.current?.runtime || 120) * 60;
              
              setDuration(actualDuration); 
              
              // Kalındığı yerden devam etme (Sadece sıfırdan başlıyorsa)
              if ((selectedMovie.progress || 0) > 0 && !isWeb && !isRemoteStreaming && !selectedMovie.video_path.startsWith("torrent-")) {
                if (transcodeOffsetRef.current === 0) {
                  e.currentTarget.currentTime = selectedMovie.progress!;
                }
              }
            }}
            className="h-full w-full object-contain cursor-pointer"
          />

          {activeSubIndex >= 0 && localSubs[activeSubIndex] && (
            <div className={`absolute left-0 right-0 z-[110] flex flex-col items-center justify-end pointer-events-none transition-all duration-300 ${showControls ? 'bottom-32' : 'bottom-12'}`}>
              {localSubs[activeSubIndex].cues
                .filter(c => currentTime >= c.start && currentTime <= c.end)
                .map((c, i) => (
                  <div key={i} className="text-center mb-1">
                    {c.text.split('\n').map((line, j) => (
                      <span 
                        key={j} 
                        className={`inline-block font-bold leading-tight ${subSettings.color}`} 
                        style={{ 
                          fontSize: subSettings.size,
                          textShadow: subSettings.bg === 'text-shadow' ? '0px 0px 6px black, 0px 0px 12px black' : 'none',
                          backgroundColor: subSettings.bg === 'solid' ? 'rgba(0,0,0,0.8)' : 'transparent',
                          padding: subSettings.bg === 'solid' ? '2px 10px' : '0',
                          borderRadius: subSettings.bg === 'solid' ? '8px' : '0'
                        }}
                      >
                        {line}
                      </span>
                    ))}
                  </div>
                ))
              }
            </div>
          )}

          {isRemoteStreaming && connMode === 'webrtc' && !remoteStream && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none">
              <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(220,38,38,0.5)]"></div>
              <p className="text-white text-xl font-bold animate-pulse">Video Akışı Bekleniyor (P2P)...</p>
            </div>
          )}

          {duration > 0 && duration - currentTime <= 15 && !isRemoteStreaming && !isTV && !selectedMovie.video_path.startsWith("torrent-") && (sameCollectionMovies[0] || recommendedMovies[0]) && (
             <div className="absolute bottom-32 right-10 z-[120] bg-black/80 border border-zinc-700 p-4 rounded-xl shadow-2xl backdrop-blur-md animate-in slide-in-from-right w-80">
               <p className="text-zinc-400 text-[10px] font-bold mb-3 uppercase tracking-widest">Sıradaki Film Başlıyor</p>
               <div className="flex gap-4">
                 <div className="w-16 h-24 bg-zinc-800 rounded flex-shrink-0">
                   <img src={(sameCollectionMovies[0] || recommendedMovies[0]).poster_url || ""} className="w-full h-full object-cover rounded"/>
                 </div>
                 <div className="flex flex-col justify-center w-full">
                   <p className="text-white font-bold text-sm line-clamp-2">{(sameCollectionMovies[0] || recommendedMovies[0]).title}</p>
                   
                   <div className="w-full h-1 bg-zinc-700 mt-2 rounded overflow-hidden">
                     <div className="h-full bg-red-600 transition-all duration-1000 ease-linear" style={{width: `${((15 - (duration - currentTime)) / 15) * 100}%`}}></div>
                   </div>
                   
                   <p className="text-xs text-zinc-400 mt-1">{Math.ceil(duration - currentTime)} saniye kaldı...</p>

                   <div className="flex gap-2 mt-2">
                     <button onClick={(e) => { 
                       e.stopPropagation(); 
                       closePlayer().then(() => setTimeout(() => startPlayer(sameCollectionMovies[0] || recommendedMovies[0]), 500)); 
                     }} className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 rounded transition">
                       Şimdi Aç ▶
                     </button>
                   </div>
                   
                   {Math.ceil(duration - currentTime) === 0 && (
                     <img src="" onError={() => closePlayer().then(() => setTimeout(() => startPlayer(sameCollectionMovies[0] || recommendedMovies[0]), 500))} className="hidden" />
                   )}
                 </div>
               </div>
             </div>
          )}

          {currentTime > 10 && currentTime < 120 && !isRemoteStreaming && !isWeb && (
             <button onClick={(e) => { e.stopPropagation(); handleSeekPlayer(currentTime + 85); }} className="absolute bottom-32 right-10 z-50 bg-black/60 border border-zinc-500 text-white font-bold px-6 py-3 rounded hover:bg-white hover:text-black transition-all hover:scale-105 shadow-2xl">
               İntroyu Atla (85s) ❯
             </button>
          )}

          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
            <button onClick={closePlayer} className="absolute bottom-[90vh] left-6 text-4xl text-white hover:text-red-500 transition drop-shadow-lg">✕</button>

            {!isTV && partyStatus === 'connected' && (
              <button onClick={(e) => {e.stopPropagation(); setIsChatOpen(!isChatOpen);}} className="absolute bottom-[90vh] right-6 flex items-center gap-2 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur transition shadow-xl border border-blue-500">
                💬 SOHBET {unreadCount > 0 ? `(${unreadCount})` : ''}
              </button>
            )}

            {isRemoteStreaming && (
              <div className="absolute bottom-[90vh] right-[150px] bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-full animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.7)]">
                {connMode === 'webrtc' ? '🔴 CANLI YAYIN (P2P)' : '🔵 AĞ ÜZERİNDEN (HTTP)'}
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
              <span 
                className="text-sm font-medium w-16 text-center drop-shadow-md cursor-pointer hover:text-white transition select-none"
                onClick={(e) => { e.stopPropagation(); setRuntimeFormat(prev => prev === 'min' ? 'hour' : 'min'); }}
                title="Saat/Dakika Görünümünü Değiştir"
              >
                {formatTime(currentTime)}
              </span>
              
              <div 
                className="relative w-full h-1.5 bg-zinc-700/80 backdrop-blur rounded-lg cursor-pointer group hover:h-2 transition-all"
                onMouseMove={handleProgressMouseMove}
                onMouseLeave={() => setHoverTime(null)}
                onClick={(e) => { if(isRemoteStreaming) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left; handleSeekPlayer((x / rect.width) * duration); }}
              >
                <div className="absolute top-0 left-0 h-full bg-red-600 rounded-lg shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{width: `${(currentTime/duration)*100}%`}}></div>
                {hoverTime !== null && !isRemoteStreaming && !isTV && (
                  <div className="absolute bottom-6 -translate-x-1/2 bg-black border border-zinc-700 rounded overflow-hidden shadow-2xl z-50 flex flex-col items-center pointer-events-none" style={{ left: hoverX }}>
                    <video ref={previewVideoRef} src={getSafeVideoSource()} className="w-40 h-[90px] object-cover" muted />
                    <span className="text-xs font-bold p-1 bg-black/80 w-full text-center">{formatTime(hoverTime)}</span>
                  </div>
                )}
              </div>
              
              <span 
                className="text-sm font-medium text-zinc-400 w-16 text-center drop-shadow-md cursor-pointer hover:text-white transition select-none"
                onClick={(e) => { e.stopPropagation(); setRuntimeFormat(prev => prev === 'min' ? 'hour' : 'min'); }}
                title="Saat/Dakika Görünümünü Değiştir"
              >
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button onClick={togglePlay} disabled={isRemoteStreaming && connMode === 'webrtc'} className={`text-4xl transition drop-shadow-lg ${isRemoteStreaming && connMode === 'webrtc' ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}`}>{isVideoPlaying ? "⏸" : "▶"}</button>
                <div className="flex items-center gap-2 group/vol relative drop-shadow-lg">
                  <button onClick={toggleMute} className="text-2xl hover:text-white transition w-8 text-center text-zinc-300">{isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</button>
                  <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={handleVolumeChangePlayer} className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-300 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white" />
                </div>
                <h2 className="text-xl font-bold truncate max-w-md ml-2 drop-shadow-md">{selectedMovie.title}</h2>
              </div>

              <div className="flex items-center gap-6 relative drop-shadow-lg">
                <div className="relative">
                  <button onClick={(e) => {e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); setShowSubMenu(false);}} className="text-base font-bold text-zinc-300 hover:text-white transition w-8">{playbackSpeed}x</button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-12 right-0 w-24 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl z-50">
                      {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                        <button key={rate} disabled={isRemoteStreaming && connMode === 'webrtc'} onClick={() => changePlaybackSpeed(rate)} className={`w-full text-center px-4 py-2 text-sm hover:bg-zinc-800 ${playbackSpeed === rate ? "text-red-500 font-bold" : "text-white"} ${isRemoteStreaming && connMode === 'webrtc' ? "opacity-50 cursor-not-allowed" : ""}`}>{rate}x</button>
                      ))}
                    </div>
                  )}
                </div>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if(isWeb) { showToast("Web modunda TV'ye yansıtılamaz.", "❌"); return; }
                    showToast("Yerel ağdaki TV'ler taranıyor...", "📺");
                  }} 
                  className="text-2xl text-zinc-300 hover:text-white transition group/cast relative mt-1" 
                  title="Cast to TV"
                >
                  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><line x1="2" y1="20" x2="2.01" y2="20"></line>
                  </svg>
                </button>

                <button 
                  onClick={toggleVoiceBoost} 
                  className={`text-xl font-bold transition group relative mt-1 ${isVoiceBoosted ? 'text-blue-500' : 'text-zinc-300 hover:text-white'}`}
                  title="Ses Güçlendirici (Gece Modu) - Kısayol: B"
                >
                  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>
                  </svg>
                  {isVoiceBoosted && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>}
                </button>

                <button onClick={(e) => {e.stopPropagation(); setShowSubMenu(!showSubMenu); setShowSpeedMenu(false);}} className="text-xl font-bold text-zinc-300 hover:text-white">CC</button>
                
                {!isTV && <button onClick={togglePip} className="text-2xl text-zinc-300 hover:text-white transition" title="Small Window">◱</button>}
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
                        <button 
    onClick={handleGenerateAISubtitle} 
    disabled={isGeneratingSub}
    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold transition disabled:opacity-50"
  >
    {isGeneratingSub ? "⏳ Dinleniyor & Çevriliyor..." : "🤖 AI ile Altyazı Üret"}
  </button>
                      </div>
                      
                    ))}
                    
                    {!isTV && (
                      <>
                        <div className="bg-zinc-800 px-4 py-2 mt-1 text-xs font-bold text-zinc-400 uppercase tracking-wider">İnternetten Bul (STREMIO)</div>
                        <div className="p-2">
                          {osResults.length === 0 && !isSearchingOS && (
                            <div className="flex gap-2">
                              <button onClick={(e) => {e.stopPropagation(); searchStremioSubtitles('tur')}} className="flex-1 rounded bg-red-600/20 py-2 text-xs font-bold text-red-500 hover:bg-red-600/40 transition">{t.searchSubTr}</button>
                              <button onClick={(e) => {e.stopPropagation(); searchStremioSubtitles('eng')}} className="flex-1 rounded bg-blue-600/20 py-2 text-xs font-bold text-blue-500 hover:bg-blue-600/40 transition">{t.searchSubEn}</button>
                            </div>
                          )}
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
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "BANA FİLM BUL" SİHİRBAZI MODALI */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 backdrop-blur-md px-4 animate-in fade-in zoom-in-95">
          <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 relative">
            <button onClick={() => setIsWizardOpen(false)} className="absolute top-6 right-6 text-2xl text-zinc-500 hover:text-white transition">✕</button>
            <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">✨ Ne İzlesek?</h2>
            <p className="text-zinc-400 mb-8">Kütüphanenden moduna uygun filmi bulalım.</p>

            {!wizardResult && !isWizardSpinning && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase">Ne Kadar Vaktin Var?</label>
                  <div className="flex gap-2">
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'short'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'short' ? 'border-red-500 bg-red-600/20 text-red-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>Kısa (90dk)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'medium'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'medium' ? 'border-red-500 bg-red-600/20 text-red-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>Normal (~2 Saat)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'long'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'long' ? 'border-red-500 bg-red-600/20 text-red-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>Uzun (120dk)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'any'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'any' ? 'border-white bg-zinc-800 text-white' : 'border-zinc-700 bg-black text-zinc-300'}`}>Fark Etmez</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase">Hangi Dönem?</label>
                  <div className="flex gap-2">
                    <button onClick={() => setWizardFilters({...wizardFilters, year: 'new'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === 'new' ? 'border-blue-500 bg-blue-600/20 text-blue-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>Yeni (2020+)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, year: '2010s'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === '2010s' ? 'border-blue-500 bg-blue-600/20 text-blue-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>2010'lar</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, year: 'old'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === 'old' ? 'border-blue-500 bg-blue-600/20 text-blue-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>Nostalji (2010)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, year: 'any'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === 'any' ? 'border-white bg-zinc-800 text-white' : 'border-zinc-700 bg-black text-zinc-300'}`}>Fark Etmez</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase">Puan Skalası?</label>
                  <div className="flex gap-2">
                    <button onClick={() => setWizardFilters({...wizardFilters, rating: 'high'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.rating === 'high' ? 'border-yellow-500 bg-yellow-600/20 text-yellow-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>Başyapıt (+8.0)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, rating: 'mid'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.rating === 'mid' ? 'border-yellow-500 bg-yellow-600/20 text-yellow-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>İzlenir (+6.0)</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, rating: 'any'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.rating === 'any' ? 'border-white bg-zinc-800 text-white' : 'border-zinc-700 bg-black text-zinc-300'}`}>Fark Etmez</button>
                  </div>
                </div>

                <button onClick={handleWizardFind} className="w-full mt-6 bg-white text-black font-extrabold text-xl py-4 rounded-xl hover:bg-zinc-200 transition shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                  Film Bul 🎲
                </button>
              </div>
            )}

            {isWizardSpinning && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h3 className="text-xl font-bold animate-pulse text-zinc-300">Kütüphanen Taranıyor...</h3>
              </div>
            )}

            {wizardResult && !isWizardSpinning && (
              <div className="flex flex-col items-center animate-in zoom-in duration-500">
                <h3 className="text-xl text-green-400 font-bold mb-6">Bunu İzlemelisin! 👇</h3>
                <div className="w-48 cursor-pointer hover:scale-105 transition" onClick={() => { setIsWizardOpen(false); setSelectedMovie(wizardResult); }}>
                  <MovieCardFallback movie={wizardResult} />
                </div>
                <div className="flex gap-4 mt-8 w-full">
                  <button onClick={() => { setIsWizardOpen(false); setSelectedMovie(wizardResult); startPlayer(wizardResult); }} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition">Hemen Aç</button>
                  <button onClick={handleWizardFind} className="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition border border-zinc-700">Tekrar Çevir</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OYUNCU/YÖNETMEN KEŞİF MODALI */}
      {personModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col overflow-y-auto animate-in fade-in zoom-in-95 duration-300 px-6 py-10 md:px-20 md:py-20 backdrop-blur-md">
          <button onClick={() => setPersonModal(null)} className="absolute top-8 left-8 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-md transition hover:scale-110 hover:bg-white/20 shadow-2xl">✕</button>
          
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-start max-w-5xl mx-auto w-full mt-10">
            {personModal.photoUrl ? (
              <img src={personModal.photoUrl} className="w-48 h-72 object-cover rounded-xl shadow-[0_0_40px_rgba(255,255,255,0.1)] border border-zinc-800 flex-shrink-0" />
            ) : (
              <div className="w-48 h-72 bg-zinc-900 rounded-xl flex items-center justify-center text-6xl shadow-xl border border-zinc-800 flex-shrink-0">🎭</div>
            )}
            
            <div className="flex-1 text-center md:text-left mt-4 md:mt-10">
              <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight drop-shadow-lg">{personModal.name}</h2>
              <p className="text-zinc-400 text-lg md:text-xl font-medium mt-4">Kütüphanendeki eşleşen yapımlar aşağıda listeleniyor.</p>
            </div>
          </div>

          <div className="max-w-7xl mx-auto w-full mt-16">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <span className="w-8 h-1 bg-red-600 rounded"></span> Oynadığı/Yönettiği Filmler
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 pb-20">
              {movies.filter(m => m.actors?.includes(personModal.name) || m.director?.includes(personModal.name)).map(m => (
                <div key={m.video_path} onClick={() => { setPersonModal(null); setSelectedMovie(m); }}>
                  <MovieCardFallback movie={m} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* İsim Sorma Modalı */}
      {showNameModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md px-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 text-center">
            <h2 className="text-2xl font-bold mb-2">👋 Adın Ne Kanka?</h2>
            <p className="text-zinc-400 text-sm mb-6">Party chatte arkadaşının seni tanıyabilmesi için bir isim gir.</p>
            <input 
              type="text" placeholder="Örn: tekin" 
              onKeyDown={(e) => {
                if(e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                  const name = (e.target as HTMLInputElement).value.trim();
                  setGuestName(name);
                  localStorage.setItem("kinflix_guest_name", name);
                  setShowNameModal(false);
                }
              }}
              className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-center text-lg text-white outline-none focus:border-red-600 transition mb-4" 
            />
            <button onClick={(e) => {
              const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
              if(input && input.value.trim()) {
                const name = input.value.trim();
                setGuestName(name);
                localStorage.setItem("kinflix_guest_name", name);
                setShowNameModal(false);
              }
            }} className="w-full rounded-xl bg-red-600 py-3 font-bold hover:bg-red-700 transition">
              Devam Et 🚀
            </button>
          </div>
          
        </div>
      )}
      {/* --- 3D SANAL SİNEMA MODU BURAYA GELECEK --- */}
      {isVirtualTheaterOpen && videoRef.current && (
        <VirtualTheater 
          videoElement={videoRef.current} 
          onClose={() => setIsVirtualTheaterOpen(false)} 
        />
      )}
    </div>
  );
}

export default App;