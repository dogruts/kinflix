// src/App.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
// @ts-ignore
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import VirtualTheater from './VirtualTheater';
import XRayOverlay from "./components/XRayOverlay";
import TriviaGame from "./components/TriviaGame";
import AchievementsModal, { checkAchievements } from "./components/AchievementsModal";
import ClipperModal from "./components/ClipperModal";
import SoundtrackRadar from "./components/SoundtrackRadar";
import SocialTimeMachine from "./components/SocialTimeMachine";
import FourthWallEngine from "./components/FourthWallEngine";
import BrainRotOverlay from "./components/BrainRotOverlay";
import { useAudioReactiveSubs } from "./hooks/useAudioReactiveSubs";
import { useVoiceControl } from "./hooks/useVoiceControl";

import { isTV, isWeb } from "./utils/platform";
import { shuffleArray, generateLocalShortCode, normalizePath } from "./utils/helpers";
import { MovieCardFallback } from "./components/MovieCardFallback";
import { HeroBanner } from "./components/HeroBanner";
import { MovieRow } from "./components/MovieRow";
import { useParty } from "./hooks/useParty";
import { usePlayer } from "./hooks/usePlayer";
import { useAmbilight } from "./hooks/useAmbilight";
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

  // YENİ: Gerçek Saat State'i
  const [realTime, setRealTime] = useState("");
  useEffect(() => {
    const updateTime = () => setRealTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3D Sinema Teması State'i (VIP, Space, Retro)
  const [isVirtualTheaterOpen, setIsVirtualTheaterOpen] = useState(false);
  const [theaterTheme, setTheaterTheme] = useState<'vip' | 'space' | 'retro'>('vip');

  const [isGeneratingSub, setIsGeneratingSub] = useState(false);

  // Party Mode - Lobi State'leri
  const [hostName, setHostName] = useState<string>("Bilinmiyor");
  const [connectedGuests, setConnectedGuests] = useState<{id: string, name: string}[]>([]);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localSubs, setLocalSubs] = useState<SubtitleTrack[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ambilightColor = useAmbilight(videoRef, isPlaying, true);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); 
  const latestHoverWordRef = useRef<string | null>(null);
  
  // FaceCam Ref'leri
  const localCamRef = useRef<HTMLVideoElement>(null);
  const remoteCamRef = useRef<HTMLVideoElement>(null);

  const transcodeOffsetRef = useRef<number>(0);

  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Uçuşan Emojiler State'i
  const [floatingEmojis, setFloatingEmojis] = useState<{id: string, emoji: string, left: string}[]>([]);

  // Ses Güçlendirici State ve Referansları
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

  // YouTube Link Input
  const [ytInput, setYtInput] = useState("");

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
        showToast(t.noMoviesMatch, "❌");
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
  
  // Video Settings
  const [videoFilters, setVideoFilters] = useState({ brightness: 1, contrast: 1, saturation: 1 });
  const [showVideoSettings, setShowVideoSettings] = useState(false);

  // YENİ: Otomatik İntro Atlama State'i
  const [autoSkipIntro, setAutoSkipIntro] = useState(localStorage.getItem("kinflix_auto_skip") === "true");
  
  // YENİ: Altyazı Arama Geliştirmesi
  const [subSearchQuery, setSubSearchQuery] = useState("");
  const [subSearchLang, setSubSearchLang] = useState("tur");

  // YENİ: Altyazı Kelime Çeviri
  const [hoveredWord, setHoveredWord] = useState<{word: string, translation: string, x: number, y: number, loading: boolean} | null>(null);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const [showControls, setShowControls] = useState(true);
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1);
  const [showSubMenu, setShowSubMenu] = useState(false);
  
  const [osResults, setOsResults] = useState<any[]>([]);
  const [isSearchingOS, setIsSearchingOS] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [osError, setOsError] = useState<string | null>(null);

  const [subSettings, setSubSettings] = useState({
    color: localStorage.getItem("kinflix_sub_color") || "text-white",
    size: localStorage.getItem("kinflix_sub_size") || "2.4vw",
    bg: localStorage.getItem("kinflix_sub_bg") || "text-shadow",
    style: localStorage.getItem("kinflix_sub_style") || "classic"
  });

  const updateSubSetting = (key: string, val: string) => {
    const newSettings = {...subSettings, [key]: val};
    setSubSettings(newSettings);
    localStorage.setItem("kinflix_sub_"+key, val);
  };

  const kineticAudioScale = useAudioReactiveSubs(videoRef, subSettings.style === 'kinetic');

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

  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [isClipperOpen, setIsClipperOpen] = useState(false);
  const [isSoundtrackOpen, setIsSoundtrackOpen] = useState(false);
  const [showExtraControls, setShowExtraControls] = useState(false);
  
  // DENEYSEL ÖZELLİKLER (Experimental)
  const [expSocial, setExpSocial] = useState(false);
  const [expFourthWall, setExpFourthWall] = useState(false);
  const [expBrainRot, setExpBrainRot] = useState(false);
  const [expVoiceControl, setExpVoiceControl] = useState(false);
  const [expLUT, setExpLUT] = useState("none");
  
  const [isPartyMenuOpen, setIsPartyMenuOpen] = useState(isWeb); 
  const [peerId, setPeerId] = useState<string>(""); 
  const [localIp, setLocalIp] = useState<string>(""); 
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null); 
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
  const [isCamActive, setIsCamActive] = useState(false);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const camCallRef = useRef<MediaConnection | null>(null);
  
  const [isConverting, setIsConverting] = useState(false);

  const [toast, setToast] = useState<{text: string, icon: string} | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const toastTimer = useRef<number | null>(null);

  const [guestName, setGuestName] = useState<string>(localStorage.getItem("kinflix_guest_name") || "");
  const [showNameModal, setShowNameModal] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  const [runtimeFormat, setRuntimeFormat] = useState<"min" | "hour">("min");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const [ytsMovies, setYtsMovies] = useState<any[]>([]);
  const [isFetchingYts, setIsFetchingYts] = useState(false);

  const [showSpotify, setShowSpotify] = useState(false);
  
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
    showToast(val === 1 ? t.likedGenreToast : t.dislikedGenreToast, "🎯");
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
  
  // Rastgele listelerin her render'da (örneğin saniye güncellendiğinde) sıfırlanmasını önlemek için state kullanıyoruz.
  const [newReleases, setNewReleases] = useState<Movie[]>([]);
  const [homeGenres, setHomeGenres] = useState<{genre: string, movies: Movie[]}[]>([]);
  const [topRated, setTopRated] = useState<Movie[]>([]);
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [recommendedMovies, setRecommendedMovies] = useState<Movie[]>([]);

  useEffect(() => {
    if (movies.length === 0) return;

    // Top Rated
    const top50 = [...movies].filter(m => m.rating && m.rating > 0).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 50);
    const topRatedShuffled = shuffleArray(top50).slice(0, 15);
    setTopRated(topRatedShuffled);

    // New Releases
    const new50 = [...movies].filter(m => m.year).sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 50);
    setNewReleases(shuffleArray(new50).slice(0, 15));

    // Home Genres
    const randomGenres = shuffleArray(allGenres).slice(0, 3);
    const hg = randomGenres.map(genre => {
      const genreMovies = movies.filter(m => m.genres?.includes(genre));
      return { genre, movies: shuffleArray(genreMovies).slice(0, 15) };
    }).filter(g => g.movies.length > 0);
    setHomeGenres(hg);

    // Recommended
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
      
    setRecommendedMovies(recommendations.length > 0 ? recommendations : topRatedShuffled);
  }, [movies, allGenres, likedMovies]);

  useEffect(() => {
    if (!selectedMovie || movies.length === 0) return;
    const similar = movies.filter(m => 
      m.video_path !== selectedMovie.video_path && 
      m.genres && selectedMovie.genres && 
      m.genres.split(", ").some(g => selectedMovie.genres?.includes(g))
    );
    setSimilarMovies(shuffleArray(similar).slice(0, 15));
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

  // YTS API Çağrısı (Zırhlı Çözüm)
  useEffect(() => {
    if (activeTab === "yts" && ytsMovies.length === 0) {
      setIsFetchingYts(true);
      const fetchYts = async () => {
        const url = "https://yts.mx/api/v2/list_movies.json?limit=24&sort_by=like_count";
        
        try {
          let data;
          if (!isWeb) {
            // Tauri ortamı, CORS'a takılmaz
            const { fetch } = await import('@tauri-apps/plugin-http');
            const res = await fetch(url);
            data = await res.json();
          } else {
            // Web ortamı için Proxy
            const res = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent(url));
            const proxyData = await res.json();
            data = JSON.parse(proxyData.contents);
          }

          if (data?.data?.movies) {
            setYtsMovies(data.data.movies);
            return; 
          }
        } catch (err) {
          console.warn("YTS API hatası:", err);
        }
        showToast("YTS sunucularına ulaşılamadı. Lütfen internet bağlantınızı kontrol edin.", "🚫");
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
    } catch (err) { alert(t.updateInstallFailed + err); setIsUpdating(false); }
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

  async function scanFolder(path: string, silent = false) {
    if (isWeb) return;
    if (!silent) setScanning(true);
    if (!silent) setError(null);
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
    } catch (error) { 
      if (!silent) setError(String(error)); 
    } finally { 
      if (!silent) setScanning(false); 
    }
  }

  // YENİ: Akıllı Auto-Watch (Klasör Dinleme) Sistemi
  // Tarama döngüsünü engellemek için sadece sekme/pencere görünür olduğunda (visibilitychange) çalışır.
  const moviesRefForScan = useRef(movies);
  useEffect(() => { moviesRefForScan.current = movies; }, [movies]);

  useEffect(() => {
    if (isWeb) return;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && !scanning) {
        const libs = Array.from(new Set(moviesRefForScan.current.map(m => m.folder_path)));
        for (const lib of libs) {
          await scanFolder(lib, true); // Sessiz tarama
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [scanning, isWeb]);

  async function syncMovieMetadata(silent = false) {
    if (syncing || isWeb) return;
    if (!tmdbToken) { 
      if (!silent) setIsSettingsOpen(true); 
      return; 
    }
    setSyncing(true); 
    if (!silent) setError(null);
    try {
      const storedMovies = await getMovies(activeProfile || "default");
      const pendingMovies = storedMovies.filter(m => !m.overview || m.overview.trim() === "");
      if (silent && pendingMovies.length === 0) {
        setSyncing(false);
        return; // Sessiz modda güncellenecek yoksa direkt çık
      }
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
              
              // YENİ: OTOMATİK ALTYAZI ROBOTU (Auto-Sub Fetcher)
              if (!isWeb) {
                try {
                  const metaUrl = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(cleanTitle)}.json`;
                  const metaRes = await window.fetch(metaUrl);
                  const metaData = await metaRes.json();
                  
                  let imdbId = null;
                  if (metaData.metas && metaData.metas.length > 0) {
                    const match = movie.year ? metaData.metas.find((m:any) => m.year == movie.year) || metaData.metas[0] : metaData.metas[0];
                    imdbId = match.imdb_id || match.id;
                  }
                  
                  if (imdbId) {
                    const subRes = await window.fetch(`https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`);
                    const subData = await subRes.json();
                    if (subData && subData.subtitles) {
                      // Öncelik Türkçe, yoksa İngilizce
                      let bestSub = subData.subtitles.find((s:any) => s.lang === "tur" || s.lang === "tr");
                      if (!bestSub) bestSub = subData.subtitles.find((s:any) => s.lang === "eng" || s.lang === "en");
                      
                      if (bestSub) {
                        const dlRes = await window.fetch(bestSub.url);
                        const subContent = await dlRes.text();
                        const { invoke } = await import("@tauri-apps/api/core");
                        await invoke("save_subtitle_file", {
                          videoPath: movie.video_path,
                          content: subContent,
                          lang: bestSub.lang || "tr"
                        });
                      }
                    }
                  }
                } catch(e) { /* Sessizce yut, taramayı bozmasın */ }
              }

            } else {
              failCount++;
            }
          } catch (err) {
            failCount++;
          }
        }));
        if (i + batchSize < targetMovies.length) await new Promise(r => setTimeout(r, 400));
      }
      setMovies(await getMovies(activeProfile || "default"));
      if (!silent) showToast(`${t.syncSuccessMsg} ${successCount}`, "🚀");
    } catch (error) { 
      if (!silent) setError(String(error)); 
    } finally { 
      setSyncing(false); 
    }
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

  const spawnFloatingEmoji = (emoji: string) => {
    const id = Date.now() + Math.random().toString();
    const left = Math.random() * 80 + 10 + '%';
    setFloatingEmojis(prev => [...prev, { id, emoji, left }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 4000);
  };

  const networkHandlerRef = useRef<Function | null>(null);

  const handleMovieClick = (movie: Movie) => {
    setSelectedMovie(movie);
    setBgVideoPlaying(false);
  };

  const playYouTubeVideo = () => {
    if(!ytInput.trim()) return;
    let ytId = ytInput;
    if (ytInput.includes('v=')) ytId = ytInput.split('v=')[1].split('&')[0];
    else if (ytInput.includes('youtu.be/')) ytId = ytInput.split('youtu.be/')[1].split('?')[0];

    const ytMovie: Movie = {
      video_path: `yt-${ytId}`,
      title: "YouTube Party Watch",
      year: new Date().getFullYear(),
      folder_path: "YouTube",
      poster_url: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
      overview: "YouTube'dan canlı senkronize video akışı.",
      runtime: 0
    };

    setYtInput("");
    setIsWizardOpen(false);
    setSelectedMovie(ytMovie);
    startPlayer(ytMovie);
  };

  const startPlayerRef = useRef<(movieOverride?: Movie) => void>(() => {});

  const {
    disconnectParty, connectParty, connectWebSocket, initPeerHost,
    broadcastEvent, handleSendChatText, handleSendChatImage, sendReaction, toggleVoiceChat, toggleScreenShare
  } = useParty({
    peerRef, connRef, wsRef, voiceCallRef, networkHandlerRef, localMicStreamRef, remoteAudioRef,
    videoRef, transcodeOffsetRef, moviesRef, selectedMovieRef, localSubsRef, activeSubIndexRef,
    isChatOpenRef, isHostRef, partyStatusRef, connModeRef, targetAddressRef, localIpRef, startPlayerRef,
    localIp, guestName, profiles, activeProfile, isHost, isMicActive, chatInput,
    setMovies, setHostName, setSelectedMovie, setIsPlaying, setIsVideoPlaying, setIsRemoteStreaming,
    setCurrentTime, setDuration, setLocalSubs, setActiveSubIndex, setPlaybackSpeed,
    setChatMessages, setUnreadCount, setChatInput, setIsHost, setPartyStatus, setConnMode,
    setTargetAddress, setPeerId, setConnectedGuests, setIsPartyMenuOpen, setShowNameModal,
    setIsMicActive, _setRemoteStream, showToast, t,
    onRemoteTheaterChange: (open) => setIsVirtualTheaterOpen(open),
    setRemoteScreenStream
  });

  const {
    togglePlay, toggleFullscreen, toggleMute, toggleVoiceBoost, handleGenerateAISubtitle,
    changeSubtitle, updateSubDelay, searchStremioSubtitles, downloadStremioSubtitle,
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
    toggleWatchlist, broadcastEvent, showToast, t,
  });

  // YENİ: Çift Tıklama ile İleri/Geri Sarma
  const handlePlayerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isRemoteStreaming && connMode === 'webrtc' && !isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    if (x < rect.width / 3) {
      handleSeekPlayer(currentTime - 10);
      showToast("⏪ 10sn Geri", "⏱️");
    } else if (x > rect.width * (2 / 3)) {
      handleSeekPlayer(currentTime + 10);
      showToast("10sn İleri ⏩", "⏱️");
    } else {
      toggleFullscreen();
    }
  };

  // YENİ: Fare Tekerleği ile Ses Kontrolü
  const handlePlayerWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newVol = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVol);
    if (videoRef.current) videoRef.current.volume = newVol;
    setIsMuted(newVol === 0);
    showToast(`Ses: %${Math.round(newVol * 100)}`, newVol === 0 ? "🔇" : "🔊");
  };

  // YENİ: Ekran Görüntüsü / GIF Alma
  const takeScreenshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Uygulanan filtreleri canvas'a da ekle
    ctx.filter = `brightness(${videoFilters.brightness}) contrast(${videoFilters.contrast}) saturate(${videoFilters.saturation})`;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    if (partyStatus === 'connected') {
      const activeName = profiles.find(p => p.id === activeProfile)?.name;
      const authorName = guestName || (isHost ? activeName || "Host" : "Misafir");
      const msg: ChatMessage = { id: Date.now().toString(), sender: "me", author: authorName, type: "image", content: dataUrl, timestamp: Date.now() };
      
      setChatMessages(prev => {
        const newChat = [...prev, msg];
        localStorage.setItem("kinflix_chat_history", JSON.stringify(newChat));
        return newChat;
      });
      broadcastEvent("chat_msg", { msg });
      showToast("Ekran görüntüsü lobiye gönderildi!", "📸");
      if (!isChatOpen) setIsChatOpen(true);
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Kinflix_${selectedMovie?.title || 'Screenshot'}_${formatTime(currentTime)}.jpg`;
      a.click();
      showToast("Ekran görüntüsü kaydedildi!", "📸");
    }
  };

  // YENİ: Altyazı Kelime Çeviri Mantığı
  const handleWordHover = async (word: string, e: React.MouseEvent) => {
    // Kelimeyi temizle (noktalama işaretlerini at)
    const cleanWord = word.replace(/[^a-zA-ZçÇğĞıİöÖşŞüÜ]/g, '').toLowerCase();
    if (!cleanWord || cleanWord.length < 2) return;

    if (isVideoPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsVideoPlaying(false);
      broadcastEvent("pause", { time: videoRef.current.currentTime });
    }

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    latestHoverWordRef.current = cleanWord;
    setHoveredWord({ word: cleanWord, translation: "Çevriliyor...", x: rect.left + rect.width / 2, y: rect.top - 10, loading: true });

    try {
      // Daha kaliteli ve stabil çeviri için Google Translate API (Ücretsiz endpoint)
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(cleanWord)}`);
      const data = await res.json();
      const translation = data[0][0][0];
      
      // Eğer kullanıcı fareyi çekmemişse (hala aynı kelimedeyse) göster
      if (latestHoverWordRef.current === cleanWord) {
        setHoveredWord({
          word: cleanWord,
          translation: translation,
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
          loading: false
        });
      }
    } catch (err) {
      if (latestHoverWordRef.current === cleanWord) {
        setHoveredWord(null);
      }
    }
  };

  useEffect(() => { startPlayerRef.current = startPlayer; }, [startPlayer]);

  // Gamepad Polling Sistemi
  useEffect(() => {
    if (!isPlaying) return;
    let frame: number;
    let prevBtns: boolean[] = [];

    const pollGamepad = () => {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        const btns = gp.buttons.map(b => b.pressed);
        if (btns[0] && !prevBtns[0]) togglePlay(); 
        if (btns[1] && !prevBtns[1]) closePlayer(); 
        if (btns[6] && !prevBtns[6]) handleSeekPlayer(currentTime - 10); 
        if (btns[7] && !prevBtns[7]) handleSeekPlayer(currentTime + 10); 
        if (btns[14] && !prevBtns[14]) handleSeekPlayer(currentTime - 10); 
        if (btns[15] && !prevBtns[15]) handleSeekPlayer(currentTime + 10); 
        prevBtns = btns;
      }
      frame = requestAnimationFrame(pollGamepad);
    };
    frame = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, currentTime]);

  const toggleFaceCam = async () => {
    if (isCamActive) {
      if (localMicStreamRef.current) localMicStreamRef.current.getTracks().forEach(t => t.stop());
      setIsCamActive(false);
      broadcastEvent("facecam_closed");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localMicStreamRef.current = stream;
        if (localCamRef.current) {
           localCamRef.current.srcObject = stream;
           localCamRef.current.play();
        }
        setIsCamActive(true);
        if (connRef.current && peerRef.current) {
          const call = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'facecam' } });
          camCallRef.current = call;
        }
      } catch (err) { alert("Kamera/Mikrofon izni reddedildi!"); }
    }
  };

  const toggleVirtualTheater = (open: boolean) => {
    setIsVirtualTheaterOpen(open);
    if (partyStatus === 'connected') broadcastEvent(open ? "enter_theater" : "exit_theater");
  };

  useEffect(() => {
    const originalHandler = networkHandlerRef.current;
    networkHandlerRef.current = async (data: any) => {
      if (originalHandler) await originalHandler(data);

      if (data.action === "floating_emoji") {
         spawnFloatingEmoji(data.emoji);
      }
      else if (data.action === "change_theme") {
         setTheaterTheme(data.theme);
      }
      else if (data.action === "facecam_closed") {
         if (remoteCamRef.current) remoteCamRef.current.srcObject = null;
      }
    };
    
    if (peerRef.current) {
       peerRef.current.on('call', (call) => {
          if (call.metadata?.type === "facecam") {
            call.answer();
            call.on("stream", (remoteStream) => {
              if (remoteCamRef.current) {
                 remoteCamRef.current.srcObject = remoteStream;
                 remoteCamRef.current.play().catch(() => {});
              }
            });
          }
       });
    }
  });

    useVoiceControl({ isActive: expVoiceControl, onCommand: (action) => { if (action === "pause" && isVideoPlaying) togglePlay(); else if (action === "play" && !isVideoPlaying) togglePlay(); else if (action === "seek_forward") handleSeekPlayer(currentTime + 15); else if (action === "seek_backward") handleSeekPlayer(Math.max(0, currentTime - 15)); else if (action === "volume_down") handleVolumeChangePlayer({ target: { value: Math.max(0, volume - 0.2) } } as any); else if (action === "volume_up") handleVolumeChangePlayer({ target: { value: Math.min(1, volume + 0.2) } } as any); }, showToast }); const theaterCompanionName = partyStatus === 'connected'
    ? (isHost ? connectedGuests[0]?.name : hostName)
    : undefined;

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white relative flex flex-col overflow-hidden">
      
      {/* UÇUŞAN EMOJİLER RENDERER */}
      <div className="fixed inset-0 z-[999999] pointer-events-none overflow-hidden">
        {floatingEmojis.map(f => (
          <div key={f.id} className="absolute bottom-0 text-5xl md:text-7xl animate-float-up drop-shadow-2xl" style={{ left: f.left }}>
            {f.emoji}
          </div>
        ))}
        <style>
          {`
            @keyframes floatUp {
              0% { transform: translateY(100vh) scale(0.5); opacity: 1; }
              50% { transform: translateY(50vh) scale(1.5) rotate(15deg); opacity: 1; }
              100% { transform: translateY(-20vh) scale(1) rotate(-15deg); opacity: 0; }
            }
            .animate-float-up { animation: floatUp 4s ease-out forwards; }
          `}
        </style>
      </div>

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

      {/* Kinflix Radyo (Spotify) Lobi Modu */}
      {(!isPlaying && partyStatus === 'connected' || activeTab === 'home') && !isPlaying && (
        <div className="fixed bottom-6 left-6 z-[150] flex flex-col items-start gap-2 animate-in fade-in slide-in-from-bottom-5">
          {showSpotify && (
            <div className="bg-black/90 p-1 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden w-[300px]">
              <iframe 
                style={{ borderRadius: '12px' }} 
                src="https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator&theme=0" 
                width="100%" 
                height="152" 
                frameBorder="0" 
                allowFullScreen={false} 
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                loading="lazy"
              ></iframe>
            </div>
          )}
          <button 
            onClick={() => setShowSpotify(!showSpotify)} 
            className="bg-green-500 hover:bg-green-400 text-black font-bold px-4 py-2 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.4)] transition hover:scale-105 flex items-center gap-2"
          >
            <span className="text-lg">🎵</span> {showSpotify ? "Radyoyu Kapat" : "Kinflix Radyo"}
          </button>
        </div>
      )}

      {/* Kim İzliyor Ekranı */}
      {!activeProfile && (!isWeb || isHost) && (
        <div className="fixed inset-0 z-[5000] bg-[#141414] flex flex-col items-center justify-center animate-in fade-in duration-500">
          <h1 className="text-4xl md:text-5xl font-medium text-white mb-10 tracking-wider text-center">{t.whoIsWatching}</h1>
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
                <span className="text-zinc-500 group-hover:text-white transition-colors text-sm md:text-lg">{t.addProfile}</span>
              </div>
            )}
          </div>

          {isCreatingProfile && (
            <div className="fixed inset-0 bg-black/90 z-[5010] flex items-center justify-center">
              <div className="bg-zinc-900 p-8 rounded-xl max-w-sm w-full shadow-2xl border border-zinc-800">
                <h2 className="text-2xl font-bold mb-4 text-white">{t.newProfile}</h2>
                <input
                  type="text"
                  placeholder={t.enterName}
                  autoFocus
                  value={newProfileName}
                  onChange={e => setNewProfileName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddProfile()}
                  className="w-full bg-black border border-zinc-700 text-white rounded p-3 mb-6 outline-none focus:border-red-600 transition"
                />
                <div className="flex gap-4">
                  <button onClick={handleAddProfile} className="flex-1 bg-white text-black font-bold py-3 rounded hover:bg-zinc-200 transition">{t.save}</button>
                  <button onClick={() => { setIsCreatingProfile(false); setNewProfileName(""); }} className="flex-1 border border-zinc-700 text-white font-bold py-3 rounded hover:bg-zinc-800 transition">{t.cancel}</button>
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
          <span className="text-yellow-300">{t.connectedHostLabel} {hostName !== "Bilinmiyor" ? hostName : targetAddress || t.localNetworkFallback}</span>
          <button onClick={() => window.location.reload()} className="ml-4 bg-black/30 hover:bg-black/50 px-3 py-1 rounded transition">{t.leaveNetworkBtn}</button>
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay />

      {updateInfo && !isWeb && (
        <div className="fixed top-0 left-0 right-0 z-[500] bg-blue-600 text-white px-6 py-3 flex items-center justify-between shadow-2xl">
          <div className="font-bold flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <p>{t.kinflixNewVersion}{updateInfo.version})</p>
              <p className="text-xs text-blue-200">{updateInfo.body}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setUpdateInfo(null)} className="px-4 py-2 bg-black/20 hover:bg-black/40 rounded transition text-sm font-bold">{t.laterBtn}</button>
            <button onClick={installUpdate} disabled={isUpdating} className="px-4 py-2 bg-white text-blue-600 hover:bg-zinc-200 rounded transition text-sm font-bold">
              {isUpdating ? t.installingUpdate : t.downloadRestartBtn}
            </button>
          </div>
        </div>
      )}

      {isWeb && !isTV && partyStatus === 'connecting' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(220,38,38,0.5)]"></div>
          <h1 className="text-3xl font-bold text-white animate-pulse mb-8">{t.connectingToRoom}</h1>
          <button
            onClick={disconnectParty}
            className="rounded-lg bg-zinc-800/80 px-6 py-3 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 hover:text-white border border-zinc-700 shadow-xl"
          >
            {t.cancelAndReturn}
          </button>
        </div>
      )}

      {isWeb && !isTV && partyStatus === 'disconnected' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight mb-8">KIN<span className="text-red-600">FLIX</span> <span className="text-2xl text-zinc-500">WEB</span></h1>
          <p className="text-zinc-400 mb-8 max-w-md">{t.webJoinDesc}</p>
          <div className="w-full max-w-md flex flex-col gap-4">
            <input
              type="text" placeholder={t.roomCodePlaceholder} value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connectParty(targetAddress)}
              className="w-full rounded-xl border-2 border-zinc-800 bg-black px-6 py-4 text-center text-xl text-white outline-none focus:border-red-600 transition font-mono uppercase tracking-widest"
            />
            <button onClick={() => connectParty(targetAddress)} className="w-full rounded-xl bg-red-600 py-4 text-xl font-bold hover:bg-red-700 transition shadow-[0_0_20px_rgba(220,38,38,0.4)]">
              {t.joinRoomBtn}
            </button>
          </div>
        </div>
      )}

      {isTV && partyStatus === 'disconnected' && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0b0b0b] px-4 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight mb-8">KIN<span className="text-red-600">FLIX</span> <span className="text-2xl text-zinc-500">TV</span></h1>
          <p className="text-zinc-400 mb-8 max-w-md">{t.tvDesc}</p>
          <div className="w-full max-w-md flex flex-col gap-4">
            <input
              autoFocus type="number" placeholder={t.tvCodePlaceholder} value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connectParty(targetAddress)}
              className="w-full rounded-xl border-2 border-zinc-800 bg-black px-6 py-4 text-center text-3xl text-white outline-none focus:border-red-600 transition font-mono tracking-widest"
            />
            <button onClick={() => connectParty(targetAddress)} className="w-full rounded-xl bg-red-600 py-4 text-xl font-bold hover:bg-red-700 transition shadow-[0_0_20px_rgba(220,38,38,0.4)] focus:ring-4 focus:ring-white">
              {t.joinRoomBtn}
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
            <button onClick={() => setActiveTab("foryou")} className={`transition hover:text-zinc-300 ${activeTab === "foryou" ? "text-white" : "text-zinc-500"}`}>{t.forYouNav}</button>
            <button onClick={() => setActiveTab("yts")} className={`transition hover:text-zinc-300 flex items-center gap-1 ${activeTab === "yts" ? "text-green-400" : "text-green-900"}`}>{t.ytsNav}</button>
            <button onClick={playRandomMovie} className="ml-4 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-800 hover:scale-105">
              {t.random}
            </button>
            <button onClick={() => setIsWizardOpen(true)} className="ml-2 flex items-center gap-2 rounded-full border border-red-900/50 bg-red-600/20 px-4 py-1.5 text-xs font-bold text-red-500 transition hover:bg-red-600/40 hover:scale-105">
              {t.findMovieNav}
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsAchievementsOpen(true)} className="flex items-center gap-2 rounded bg-yellow-600/80 px-4 py-2 text-sm font-bold text-yellow-100 backdrop-blur transition hover:bg-yellow-700">
            🏆 Başarımlar
          </button>
          <button onClick={() => setIsPartyMenuOpen(true)} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold backdrop-blur transition ${partyStatus === 'connected' ? 'bg-green-600/80 hover:bg-green-700' : 'bg-zinc-800/80 hover:bg-zinc-700'}`}>
            👥 {partyStatus === 'connected' ? (isHost ? t.roomCreated : t.guestModeShort) : t.party}
          </button>
          {isHost && movies.length > 0 && !isWeb && (
            <button onClick={() => syncMovieMetadata()} disabled={syncing} className="rounded bg-zinc-800/80 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-zinc-700 disabled:opacity-50">
              {syncing ? t.syncing : t.sync}
            </button>
          )}
          <button onClick={() => setIsStatsOpen(true)} className="flex h-9 w-9 items-center justify-center rounded bg-zinc-800/80 backdrop-blur transition hover:bg-zinc-700" title={t.statsIconTitle}>📊</button>
          <button onClick={() => setIsSettingsOpen(true)} className="flex h-9 w-9 items-center justify-center rounded bg-zinc-800/80 backdrop-blur transition hover:bg-zinc-700" title={t.settings}>⚙️</button>
        </div>
      </header>

      {(partyStatus === 'connected' || (!isWeb && !isTV)) && (
        <main className="flex-1 pb-10">
          {error && <div className="mx-10 mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-400">{t.errorPrefix} {error}</div>}
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
                  {collections.length === 0 ? <div className="text-zinc-500">{t.noCollectionsFound}</div> : (
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
                  <h2 className="mb-2 text-2xl font-bold">{t.forYouTitle}</h2>
                  <p className="text-zinc-500 text-sm mb-6">{t.forYouDesc}</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {recommendedMovies.map((movie: Movie) => <div key={movie.video_path} onClick={() => handleMovieClick(movie)}><MovieCardFallback movie={movie} /></div>)}
                  </div>
                </div>
              )}
              {activeTab === "yts" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-green-400">{t.ytsTitle}</h2>
                    <span className="text-xs text-zinc-500">{t.ytsDesc}</span>
                  </div>
                  {isFetchingYts ? <div className="text-center text-zinc-500 py-10 animate-pulse">{t.ytsLoading}</div> : (
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
                    <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.hostCode}</h3>
                    <div className="bg-black rounded-lg p-2 text-4xl font-black tracking-widest text-green-400 border border-zinc-800 flex justify-between items-center px-6">
                      <div className="flex items-center gap-3">
                        <span>{peerId || "..."}</span>
                        {peerId && (
                          <button onClick={() => { navigator.clipboard.writeText(peerId); showToast(t.roomCodeCopied, "📋"); }} className="text-xl text-zinc-500 hover:text-white transition hover:scale-110" title={t.copyRoomCodeTitle}>
                            📋
                          </button>
                        )}
                      </div>
                      <button onClick={() => {
                        localStorage.removeItem("kinflix_host_code");
                        window.location.reload();
                      }} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg font-bold border border-zinc-700 transition">
                        {t.changeCode}
                      </button>
                    </div>

                    <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-400">{t.localIp}</h3>
                    <div className="bg-black rounded-lg p-2 text-xl font-mono tracking-widest text-blue-400 border border-zinc-800 flex justify-between items-center px-4">
                      <div className="flex items-center gap-3">
                        <span>{localIp || t.loadingEllipsis}</span>
                        {localIp && localIp !== "Bilinmiyor" && (
                          <button onClick={() => { navigator.clipboard.writeText(localIp); showToast(t.ipCopied, "📋"); }} className="text-lg text-zinc-500 hover:text-white transition hover:scale-110" title={t.copyIpTitle}>
                            📋
                          </button>
                        )}
                      </div>
                      {generateLocalShortCode(localIp) && (
                        <span 
                          onClick={() => { navigator.clipboard.writeText(generateLocalShortCode(localIp)); showToast(t.tvCodeCopied, "📋"); }}
                          className="text-sm bg-blue-900/30 text-blue-300 px-3 py-1 rounded border border-blue-800/50 flex flex-col items-center cursor-pointer hover:bg-blue-800/60 transition"
                          title={t.copyTvCodeTitle}
                        >
                          <span className="text-[10px] uppercase tracking-wider text-blue-500 font-bold mb-0.5">{t.tvShortCode}</span>
                          <div className="flex items-center gap-1.5">
                            <span>{generateLocalShortCode(localIp)}</span>
                            <span className="text-xs opacity-50">📋</span>
                          </div>
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-zinc-400">{t.enterFriendCode}</h3>
                    <div className="flex gap-2">
                      <input type="text" placeholder={t.friendCodePlaceholder} value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} className="flex-1 rounded-lg border border-zinc-700 bg-black px-4 py-2 text-white outline-none focus:border-zinc-500 transition font-mono uppercase" />
                      <button onClick={() => connectParty(targetAddress)} className="rounded-lg bg-red-600 px-6 font-bold hover:bg-red-700 transition">{t.connect}</button>
                    </div>
                  </div>
                  
                  {partyStatus === 'connected' && (
                    <>
                       <button onClick={disconnectParty} className="mt-4 w-full rounded bg-red-600/20 py-3 text-red-500 font-bold hover:bg-red-600/40 border border-red-900/50 transition">
                         {t.leaveRoom}
                       </button>
                       <button onClick={() => {
                          const payload = { action: "trivia_start", qIndex: 0 };
                          broadcastEvent("trivia_start", payload);
                          window.dispatchEvent(new CustomEvent('kinflix_party_event', { detail: payload }));
                          setIsPartyMenuOpen(false);
                       }} className="mt-2 w-full rounded bg-indigo-600/20 py-3 text-indigo-400 font-bold hover:bg-indigo-600/40 border border-indigo-900/50 transition flex items-center justify-center gap-2">
                         <span>🎮</span> Sinema Trivia Başlat
                       </button>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                   <h3 className="text-2xl font-bold text-green-400 mb-2">{t.connectedSuccessfully}</h3>
                   <p className="text-zinc-400 mb-8">{t.viewingHostLibrary}</p>
                   
                   <button onClick={() => {
                     if (partyStatus === 'connected') {
                       broadcastEvent("request_catalog", { guestName: guestName || localStorage.getItem("kinflix_guest_name") || "Misafir" });
                     } else {
                       alert(t.mustBeConnectedFirst);
                     }
                   }} className="w-full rounded bg-blue-600/20 py-3 text-blue-400 font-bold hover:bg-blue-600/40 border border-blue-900/50 transition mb-4">
                     {t.syncCatalog}
                   </button>
                   
                   <button onClick={disconnectParty} className="w-full rounded bg-red-600/20 py-3 text-red-500 font-bold hover:bg-red-600/40 border border-red-900/50 transition">
                     {t.disconnect}
                   </button>
                </div>
              )}
            </div>
            
            {!isWeb && isHost && (
              <div className="w-48 flex flex-col items-center justify-center border-l border-zinc-800 pl-8">
                 <h3 className="text-sm font-bold text-zinc-400 mb-4 text-center">{t.joinFromPhone}</h3>
                 <div className="bg-white p-2 rounded-xl">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('https://kinflix.netlify.app/?room=' + peerId)}`} alt="Kinflix QR" className="w-32 h-32" />
                 </div>
                 <p className="text-xs text-zinc-500 mt-4 text-center">{t.scanQr}</p>
                 <button onClick={() => setIsPartyMenuOpen(false)} className="mt-8 text-zinc-500 hover:text-white font-bold">{t.closeBtn}</button>
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
              <h3 className="text-white font-bold mb-4">🔤 {t.subtitleAppearance}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-bold">{t.subtitleColorLabel}</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateSubSetting('color', 'text-white')} className={`flex-1 py-2 rounded-lg font-bold border transition ${subSettings.color === 'text-white' ? 'border-white bg-white text-black' : 'border-zinc-700 bg-zinc-900 text-white'}`}>{t.colorWhite}</button>
                    <button onClick={() => updateSubSetting('color', 'text-yellow-400')} className={`flex-1 py-2 rounded-lg font-bold border transition ${subSettings.color === 'text-yellow-400' ? 'border-yellow-400 bg-yellow-400 text-black' : 'border-zinc-700 bg-zinc-900 text-yellow-400'}`}>{t.colorYellow}</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-bold">{t.subtitleSizeLabel}</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateSubSetting('size', '1.8vw')} className={`flex-1 py-2 rounded-lg text-sm border transition ${subSettings.size === '1.8vw' ? 'border-red-500 bg-red-600/20' : 'border-zinc-700 bg-zinc-900'}`}>A-</button>
                    <button onClick={() => updateSubSetting('size', '2.4vw')} className={`flex-1 py-2 rounded-lg text-base border transition ${subSettings.size === '2.4vw' ? 'border-red-500 bg-red-600/20' : 'border-zinc-700 bg-zinc-900'}`}>A</button>
                    <button onClick={() => updateSubSetting('size', '3.2vw')} className={`flex-1 py-2 rounded-lg text-xl font-bold border transition ${subSettings.size === '3.2vw' ? 'border-red-500 bg-red-600/20' : 'border-zinc-700 bg-zinc-900'}`}>A+</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-bold">{t.subtitleBgLabel}</p>
                  <select value={subSettings.bg} onChange={(e) => updateSubSetting('bg', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 px-3 outline-none focus:border-red-500">
                    <option value="none">{t.bgTransparent}</option>
                    <option value="text-shadow">{t.bgShadow}</option>
                    <option value="solid">{t.bgSolid}</option>
                  </select>
                </div>
              </div>
            </div>

            {(!isHost && partyStatus === 'connected') || isWeb || isTV ? (
              <div className="text-center py-6">
                <h3 className="text-2xl font-bold text-white mb-4">{t.guestMode}</h3>
                <p className="text-zinc-400 leading-relaxed max-w-md mx-auto">{t.guestModeDesc}<br/><br/>{t.enjoyTheShow}</p>
                
                <div className="mt-8 rounded-xl border border-blue-900/50 bg-blue-950/20 p-4 max-w-xs mx-auto">
                  <h3 className="text-blue-500 font-bold mb-2">{t.systemStatus}</h3>
                  <p className="text-sm text-zinc-300">{t.systemStatusDesc}</p>
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
                    {libraries.length === 0 ? <p className="p-2 text-sm text-zinc-500">{t.noneFound}</p> : libraries.map(lib => (
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
                  <h3 className="text-white font-bold mb-3">{t.accentColor}</h3>
                  <div className="flex gap-3">
                    <button onClick={() => {setThemeColor('red'); localStorage.setItem("kinflix_theme", "red");}} className={`w-8 h-8 rounded-full bg-red-600 ${themeColor === 'red' ? 'ring-4 ring-white' : ''}`}></button>
                    <button onClick={() => {setThemeColor('blue'); localStorage.setItem("kinflix_theme", "blue");}} className={`w-8 h-8 rounded-full bg-blue-600 ${themeColor === 'blue' ? 'ring-4 ring-white' : ''}`}></button>
                    <button onClick={() => {setThemeColor('green'); localStorage.setItem("kinflix_theme", "green");}} className={`w-8 h-8 rounded-full bg-green-600 ${themeColor === 'green' ? 'ring-4 ring-white' : ''}`}></button>
                    <button onClick={() => {setThemeColor('purple'); localStorage.setItem("kinflix_theme", "purple");}} className={`w-8 h-8 rounded-full bg-purple-600 ${themeColor === 'purple' ? 'ring-4 ring-white' : ''}`}></button>
                  </div>
                </div>

                <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4"><h3 className="text-red-500 font-bold mb-2">{t.dangerZone}</h3><button onClick={async () => { if(confirm(t.confirmReset)) { await clearDatabase(); setMovies([]); setIsSettingsOpen(false); } }} className="rounded bg-red-600 px-4 py-2 text-sm font-bold transition hover:bg-red-700">{t.resetDb}</button></div>
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
            {bgVideoPlaying && !selectedMovie.video_path.startsWith("torrent-") && !selectedMovie.video_path.startsWith("yt-") && (
              <>
                <video 
                  src={tauriConvertFileSrc ? tauriConvertFileSrc(selectedMovie.video_path) : ""} 
                  muted={isBgMuted} 
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover opacity-60 animate-in fade-in duration-1000"
                  onLoadedMetadata={(e) => { 
                    e.currentTarget.currentTime = (((selectedMovie.runtime || 0) || 120) * 60) * 0.5; 
                  }}
                />
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsBgMuted(!isBgMuted); }}
                  className="absolute bottom-8 right-10 z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-zinc-500 bg-black/40 text-xl text-white backdrop-blur transition hover:scale-110 hover:border-white hover:bg-black/60 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                  title={isBgMuted ? t.soundOn : t.soundOff}
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
              {(selectedMovie.runtime || 0) > 0 && <span>{selectedMovie.runtime} {t.min}</span>}
              <span className="rounded border border-zinc-500 px-1.5 py-0.5 text-xs text-zinc-300">HD</span>
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => handleLike(selectedMovie.video_path, 1)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${likedMovies[selectedMovie.video_path] === 1 ? 'bg-white text-black' : 'bg-zinc-800 text-white'}`}>👍</button>
              <button onClick={() => handleLike(selectedMovie.video_path, -1)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${likedMovies[selectedMovie.video_path] === -1 ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white'}`}>👎</button>
            </div>
            
            {(selectedMovie.progress || 0) > 0 && (selectedMovie.is_watched || 0) === 0 && !isWeb && <div className="mt-4 flex items-center gap-3"><div className="h-1.5 w-64 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{ width: `${Math.min(((selectedMovie.progress || 0) / (((selectedMovie.runtime || 0) || 120) * 60)) * 100, 100)}%` }} /></div></div>}
            
            <div className="mt-8 flex flex-wrap gap-4">
              <button onClick={() => startPlayer()} className="flex items-center justify-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200">
                <span className="text-2xl">▶</span> {(selectedMovie.progress || 0) > 0 && (selectedMovie.is_watched || 0) === 0 && !isWeb ? t.resume : t.play}
              </button>

              <button 
                onClick={() => {
                  startPlayer();
                  setTimeout(() => {
                     toggleVirtualTheater(true);
                  }, 800); 
                }}
                className="flex items-center justify-center gap-2 rounded px-8 py-3 text-sm font-bold text-white transition backdrop-blur border bg-purple-600/20 border-purple-500/50 hover:bg-purple-600/40 hover:border-purple-400"
              >
                👓 {t.theaterModeBtn}
              </button>

                {!isWeb && !selectedMovie.video_path.startsWith("torrent-") && !selectedMovie.video_path.startsWith("yt-") && (
                  <div className="mt-4 max-w-sm w-full">
                    {convertingMoviePath === selectedMovie.video_path ? (
                      <div className="w-full bg-zinc-900/80 rounded-xl p-4 border border-zinc-700 backdrop-blur">
                        <div className="flex justify-between text-xs font-bold mb-2">
                          <span className="text-blue-400 animate-pulse">{t.convertingToX264}</span>
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
                            showToast(t.conversionStartedToast, "⏳");
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('convert_video', { path: selectedMovie.video_path });
                          } catch (err) {
                            setConvertingMoviePath(null);
                            showToast(t.conversionFailedToast, "❌");
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
              
            </div>

            <div className="mt-10 flex flex-col md:flex-row gap-10">
              <div className="flex-[2]"><p className="text-lg leading-relaxed text-zinc-300">{selectedMovie.overview || t.noOverview}</p></div>
              <div className="flex-1 flex flex-col gap-3 text-sm">
                {selectedMovie.genres && <p><span className="text-zinc-500">{t.genresLabel}</span> <span className="text-zinc-300">{selectedMovie.genres}</span></p>}
                {selectedMovie.director && (
                  <p><span className="text-zinc-500">{t.directorLabel}</span> {selectedMovie.director.split(',').map((dir, i, arr) => (
                    <span key={i}><span onClick={() => handlePersonClick(dir.trim())} className="text-zinc-300 hover:text-white hover:underline cursor-pointer transition">{dir.trim()}</span>{i < arr.length - 1 ? ', ' : ''}</span>
                  ))}</p>
                )}
                {selectedMovie.actors && (
                  <p><span className="text-zinc-500">{t.castLabel}</span> {selectedMovie.actors.split(',').map((actor, i, arr) => (
                    <span key={i}><span onClick={() => handlePersonClick(actor.trim())} className="text-zinc-300 hover:text-white hover:underline cursor-pointer transition">{actor.trim()}</span>{i < arr.length - 1 ? ', ' : ''}</span>
                  ))}</p>
                )}
                {selectedMovie.collection_name && <p><span className="text-zinc-500">{t.franchiseLabel}</span> <span className="text-zinc-300">{selectedMovie.collection_name}</span></p>}
              </div>
            </div>
            
            {sameCollectionMovies.length > 0 && (
              <div className="mt-16">
                <MovieRow title={t.sameCollection} data={sameCollectionMovies} onMovieClick={handleMovieClick} />
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

      {/* "BANA FİLM BUL" SİHİRBAZI VE HIZLI YOUTUBE MODALI */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 backdrop-blur-md px-4 animate-in fade-in zoom-in-95">
          <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 relative">
            <button onClick={() => setIsWizardOpen(false)} className="absolute top-6 right-6 text-2xl text-zinc-500 hover:text-white transition">✕</button>
            <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">{t.wizardHeading}</h2>
            <p className="text-zinc-400 mb-8">{t.wizardDesc}</p>

            <div className="mb-8 border-b border-zinc-800 pb-8">
              <h3 className="text-sm font-bold text-red-500 mb-2 uppercase tracking-wider">🎥 YouTube Party Watch</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="YouTube Video Linkini Yapıştır (Örn: https://youtu.be/...)" 
                  value={ytInput} 
                  onChange={(e) => setYtInput(e.target.value)} 
                  className="flex-1 rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-red-500 transition" 
                />
                <button 
                  onClick={playYouTubeVideo} 
                  className="rounded-lg bg-red-600 px-6 font-bold hover:bg-red-700 transition flex items-center gap-2"
                >
                  Oynat ▶
                </button>
              </div>
            </div>

            {!wizardResult && !isWizardSpinning && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase">{t.wizardDurationLabel}</label>
                  <div className="flex gap-2">
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'short'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'short' ? 'border-red-500 bg-red-600/20 text-red-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.durationShort}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'medium'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'medium' ? 'border-red-500 bg-red-600/20 text-red-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.durationMedium}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'long'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'long' ? 'border-red-500 bg-red-600/20 text-red-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.durationLong}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, duration: 'any'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.duration === 'any' ? 'border-white bg-zinc-800 text-white' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.anyOption}</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase">{t.wizardYearLabel}</label>
                  <div className="flex gap-2">
                    <button onClick={() => setWizardFilters({...wizardFilters, year: 'new'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === 'new' ? 'border-blue-500 bg-blue-600/20 text-blue-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.yearNew}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, year: '2010s'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === '2010s' ? 'border-blue-500 bg-blue-600/20 text-blue-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.year2010s}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, year: 'old'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === 'old' ? 'border-blue-500 bg-blue-600/20 text-blue-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.yearOld}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, year: 'any'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.year === 'any' ? 'border-white bg-zinc-800 text-white' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.anyOption}</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase">{t.wizardRatingLabel}</label>
                  <div className="flex gap-2">
                    <button onClick={() => setWizardFilters({...wizardFilters, rating: 'high'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.rating === 'high' ? 'border-yellow-500 bg-yellow-600/20 text-yellow-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.ratingHigh}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, rating: 'mid'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.rating === 'mid' ? 'border-yellow-500 bg-yellow-600/20 text-yellow-500' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.ratingMid}</button>
                    <button onClick={() => setWizardFilters({...wizardFilters, rating: 'any'})} className={`flex-1 py-3 rounded-lg border font-bold transition ${wizardFilters.rating === 'any' ? 'border-white bg-zinc-800 text-white' : 'border-zinc-700 bg-black text-zinc-300'}`}>{t.anyOption}</button>
                  </div>
                </div>

                <button onClick={handleWizardFind} className="w-full mt-6 bg-white text-black font-extrabold text-xl py-4 rounded-xl hover:bg-zinc-200 transition shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                  {t.findMovieBtn}
                </button>
              </div>
            )}

            {isWizardSpinning && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h3 className="text-xl font-bold animate-pulse text-zinc-300">{t.scanningLibrary}</h3>
              </div>
            )}

            {wizardResult && !isWizardSpinning && (
              <div className="flex flex-col items-center animate-in zoom-in duration-500">
                <h3 className="text-xl text-green-400 font-bold mb-6">{t.mustWatchThis}</h3>
                <div className="w-48 cursor-pointer hover:scale-105 transition" onClick={() => { setIsWizardOpen(false); setSelectedMovie(wizardResult); }}>
                  <MovieCardFallback movie={wizardResult} />
                </div>
                <div className="flex gap-4 mt-8 w-full">
                  <button onClick={() => { setIsWizardOpen(false); setSelectedMovie(wizardResult); startPlayer(wizardResult); }} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition">{t.openNowWizardBtn}</button>
                  <button onClick={handleWizardFind} className="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition border border-zinc-700">{t.tryAgainBtn}</button>
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
              <p className="text-zinc-400 text-lg md:text-xl font-medium mt-4">{t.actorDiscoveryDesc}</p>
            </div>
          </div>

          <div className="max-w-7xl mx-auto w-full mt-16">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <span className="w-8 h-1 bg-red-600 rounded"></span> {t.filmographyHeading}
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
            <h2 className="text-2xl font-bold mb-2">{t.askNameHeading}</h2>
            <p className="text-zinc-400 text-sm mb-6">{t.askNameDesc}</p>
            <input
              type="text" placeholder={t.namePlaceholder}
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
              {t.continueBtn}
            </button>
          </div>
          
        </div>
      )}

      {/* İSTATİSTİKLER MODALI */}
      {isStatsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 animate-in fade-in zoom-in-95">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-600/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="mb-8 flex items-center justify-between relative z-10">
              <h2 className="text-3xl font-extrabold text-white">{t.statsTitle}</h2>
              <button onClick={() => setIsStatsOpen(false)} className="text-3xl text-zinc-500 hover:text-white transition">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4 relative z-10">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center shadow-lg">
                <p className="text-4xl font-black text-white">{userStats.watchedCount}</p>
                <p className="text-xs text-zinc-500 mt-2 font-bold uppercase tracking-wider">{t.statsWatched}</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center shadow-lg">
                <p className="text-4xl font-black text-red-500">{userStats.hours}s</p>
                <p className="text-xs text-zinc-500 mt-2 font-bold uppercase tracking-wider">{t.statsTime}</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center shadow-lg col-span-2">
                <p className="text-3xl font-black text-white truncate px-2">{userStats.favGenre}</p>
                <p className="text-xs text-zinc-500 mt-2 font-bold uppercase tracking-wider">{t.statsFavGenre}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SOHBET VE LOBİ PENCERESİ AÇMA BUTONU */}
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

      {/* SOHBET VE LOBİ PENCERESİ EKRANI */}
      {!isTV && isChatOpen && partyStatus === 'connected' && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-950 border-l border-zinc-800 z-[250] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center shadow-md">
            <h3 className="font-bold text-white flex items-center gap-2">{t.partyLobbyHeading} <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span></h3>
            
            <div className="flex gap-2">
              <button onClick={toggleScreenShare} className="flex items-center justify-center w-8 h-8 rounded-full transition bg-zinc-700 hover:bg-zinc-600" title="Ekranı Paylaş">
                💻
              </button>
              <button onClick={toggleFaceCam} className={`flex items-center justify-center w-8 h-8 rounded-full transition ${isCamActive ? 'bg-blue-500 hover:bg-blue-600 animate-pulse' : 'bg-zinc-700 hover:bg-zinc-600'}`} title="Kamerayı Aç">
                {isCamActive ? '📸' : '📷'}
              </button>
              <button onClick={toggleVoiceChat} className={`flex items-center justify-center w-8 h-8 rounded-full transition ${isMicActive ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                {isMicActive ? '🎙️' : '🎤'}
              </button>
            </div>
            
            <button onClick={() => setIsChatOpen(false)} className="text-zinc-400 hover:text-white transition ml-2">✕</button>
          </div>
          
          <div className="bg-zinc-950 p-3 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 font-bold mb-2 uppercase">{t.whoIsInRoom}</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-yellow-400 font-bold">
                👑 {isHostRef.current ? (profiles.find(p => p.id === activeProfile)?.name || t.youHostFallback) : hostName}
              </div>
              
              {connectedGuests.length > 0 ? (
                connectedGuests.map((guest, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-zinc-300 pl-4 border-l-2 border-zinc-700">
                    👤 {guest.name}
                  </div>
                ))
              ) : isHostRef.current ? (
                <div className="text-xs text-zinc-600 italic pl-4">{t.nobodyJoinedYet}</div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-zinc-300 pl-4 border-l-2 border-zinc-700">
                   👤 {guestName || localStorage.getItem("kinflix_guest_name") || t.youFallback}
                </div>
              )}
            </div>
          </div>
          
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
                <button 
                  key={emo} 
                  onClick={() => {
                     spawnFloatingEmoji(emo);
                     if (partyStatus === 'connected') broadcastEvent("floating_emoji", { emoji: emo });
                  }} 
                  className="hover:scale-125 transition drop-shadow-md"
                >
                  {emo}
                </button>
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

      {/* FACECAM BUBBLE (GÖRÜNTÜLÜ SOHBET) EKRANI */}
      {(isCamActive || remoteCamRef.current?.srcObject) && (
        <div className="fixed top-24 right-8 z-[150] flex flex-col gap-4 pointer-events-none">
          {remoteCamRef.current?.srcObject && (
            <div className="w-32 h-32 md:w-48 md:h-48 bg-zinc-900 rounded-full border-2 border-red-500 overflow-hidden shadow-2xl animate-in zoom-in">
               <video ref={remoteCamRef} autoPlay playsInline className="w-full h-full object-cover" />
            </div>
          )}
          {isCamActive && (
            <div className="w-32 h-32 md:w-48 md:h-48 bg-zinc-900 rounded-full border-2 border-blue-500 overflow-hidden shadow-2xl animate-in zoom-in">
               <video ref={localCamRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            </div>
          )}
        </div>
      )}

      {/* ANA VİDEO OYNATICI ARAYÜZÜ */}
      {isPlaying && selectedMovie && (
        <div 
          ref={playerContainerRef} 
          onMouseMove={handleMouseMove} 
          onClick={() => {if(showSubMenu) setShowSubMenu(false); if(showSpeedMenu) setShowSpeedMenu(false);}} 
          onDoubleClick={handlePlayerDoubleClick}
          onWheel={handlePlayerWheel}
          className={`fixed inset-0 z-[100] bg-black flex flex-col group transition-all duration-1000 ${showControls ? "controls-visible" : "controls-hidden"}`}
          style={{ boxShadow: isPlaying ? `inset 0 0 250px ${ambilightColor}` : 'none' }}
        >
          {/* 3D SİNEMA VE YOUTUBE İFRAME YÖNETİMİ */}
          {isVirtualTheaterOpen ? (
             <VirtualTheater 
               videoElement={videoRef.current} 
               onClose={() => toggleVirtualTheater(false)} 
               activeSubIndex={activeSubIndex} 
               localSubs={localSubs} 
               currentTime={currentTime} 
               duration={duration} 
               subSettings={subSettings} 
               isVideoPlaying={isVideoPlaying} 
               onTogglePlay={togglePlay} 
               onSeek={handleSeekPlayer} 
               formatTime={formatTime} 
               companionName={theaterCompanionName}
               theme={theaterTheme}
               t={t} 
             />
          ) : selectedMovie.video_path.startsWith('yt-') ? (
             <div className="absolute inset-0 w-full h-full bg-black z-0 flex items-center justify-center">
                <iframe
                   src={`https://www.youtube.com/embed/${selectedMovie.video_path.split('-')[1]}?autoplay=1&enablejsapi=1&controls=1`}
                   className="w-full h-full"
                   frameBorder="0"
                   allow="autoplay; fullscreen"
                />
             </div>
          ) : null}

          {/* ASIL VİDEO OYNATICI */}
          <video
            ref={videoRef} 
            crossOrigin="anonymous" 
            src={getSafeVideoSource()} 
            autoPlay 
            playsInline
            onClick={togglePlay}
            onTimeUpdate={(e) => { 
              if (isRemoteStreaming && !isHostRef.current) return;
              const cTime = e.currentTarget.currentTime + transcodeOffsetRef.current;
              setCurrentTime(cTime);

              // YENİ: Otomatik İntro Atlama Mantığı
              if (autoSkipIntro && cTime > 10 && cTime < 12 && !isRemoteStreaming && !isWeb && !selectedMovieRef.current?.video_path.startsWith("yt-")) {
                 handleSeekPlayer(cTime + 85);
                 showToast("İntro otomatik atlandı!", "⏭️");
              }

              if (isHostRef.current && partyStatusRef.current === 'connected') {
                if (Math.floor(cTime) !== lastSyncTimeRef.current) {
                  lastSyncTimeRef.current = Math.floor(cTime);
                  const safeDuration = (e.currentTarget.duration && e.currentTarget.duration !== Infinity) 
                    ? e.currentTarget.duration 
                    : ((selectedMovieRef.current?.runtime || 120) * 60);
                  broadcastEvent("sync_time", { time: cTime, duration: safeDuration });
                }
              }

              // YENİ: Kupa Sistemi Takibi
                if (cTime > 0 && e.currentTarget.duration && (e.currentTarget.duration - cTime) < 2) {
                 if (!(window as any)._movieFinishedTracked) {
                    (window as any)._movieFinishedTracked = true;
                    const unlocked = checkAchievements("movie_finish", selectedMovieRef.current);
                    unlocked.forEach(() => showToast(`🏆 Yeni Başarım Açıldı!`, "✨"));
                 }
              }
              if (Math.floor(cTime) > 0 && Math.floor(cTime) % 60 === 0 && Math.floor(cTime) !== (window as any)._lastTrackedSec) {
                 (window as any)._lastTrackedSec = Math.floor(cTime);
                 const unlocked = checkAchievements("watch_tick", 60);
                 unlocked.forEach(() => showToast(`🏆 Yeni Başarım Açıldı!`, "✨"));
              }
            }}
            onLoadedMetadata={(e) => { 
              if (isRemoteStreaming && !isHostRef.current) return;
              const actualDuration = (e.currentTarget.duration && e.currentTarget.duration > 0 && e.currentTarget.duration !== Infinity) 
                 ? e.currentTarget.duration 
                 : (selectedMovieRef.current?.runtime || 120) * 60;
              setDuration(actualDuration); 
              
              if ((selectedMovie.progress || 0) > 0 && !isWeb && !isRemoteStreaming && !selectedMovie.video_path.startsWith("torrent-")) {
                if (transcodeOffsetRef.current === 0) {
                  e.currentTarget.currentTime = selectedMovie.progress!;
                }
              }
            }}
            className="h-full w-full object-contain cursor-pointer absolute inset-0"
            style={{ 
              opacity: (isVirtualTheaterOpen || selectedMovie.video_path.startsWith('yt-')) ? '0.01' : '1',
              filter: `brightness(${videoFilters.brightness}) contrast(${videoFilters.contrast}) saturate(${videoFilters.saturation}) ${
                expLUT === 'matrix' ? 'sepia(100%) hue-rotate(90deg) saturate(200%) brightness(80%)' :
                expLUT === 'madmax' ? 'sepia(50%) saturate(200%) contrast(120%) hue-rotate(-15deg)' :
                expLUT === 'sincity' ? 'grayscale(100%) contrast(200%)' :
                expLUT === 'cyberpunk' ? 'saturate(300%) hue-rotate(45deg) contrast(150%)' : ''
              }`
            }}
          />

          {remoteScreenStream && (
            <video 
              ref={(el) => { if (el) { el.srcObject = remoteScreenStream; el.play().catch(()=>{}); } }}
              autoPlay 
              playsInline 
              className="absolute inset-0 w-full h-full object-contain bg-black z-[90]"
            />
          )}

          <XRayOverlay videoRef={videoRef} tmdbId={selectedMovie?.tmdb_id || null} title={selectedMovie?.title} year={selectedMovie?.year} isPaused={!isPlaying && showControls} />
          <TriviaGame 
            broadcastEvent={(action, payload) => {
              broadcastEvent(action, payload);
              window.dispatchEvent(new CustomEvent('kinflix_party_event', { detail: { action, ...payload } }));
            }} 
            isHost={isHost} 
            localName={isHost ? (profiles.find(p => p.id === activeProfile)?.name || "Host") : guestName} 
          />
          <AchievementsModal isOpen={isAchievementsOpen} onClose={() => setIsAchievementsOpen(false)} />
          <ClipperModal isOpen={isClipperOpen} onClose={() => setIsClipperOpen(false)} videoRef={videoRef} />
          <SoundtrackRadar isOpen={isSoundtrackOpen} onClose={() => setIsSoundtrackOpen(false)} movieTitle={selectedMovie?.title} />

          <SocialTimeMachine isActive={expSocial} currentTime={currentTime} duration={duration} />
          <FourthWallEngine isActive={expFourthWall} isPlaying={isVideoPlaying} genre={selectedMovie?.genres || ''} />
          <BrainRotOverlay isActive={expBrainRot} />

          {/* ALTYAZILAR */}
          {activeSubIndex >= 0 && localSubs[activeSubIndex] && !selectedMovie.video_path.startsWith('yt-') && (
            <div className={`absolute left-0 right-0 z-[100000] flex flex-col items-center justify-end pointer-events-none transition-all duration-300 ${showControls ? 'bottom-32' : 'bottom-12'}`}>
              {localSubs[activeSubIndex].cues
                .filter(c => currentTime >= c.start && currentTime <= c.end)
                .map((c, i) => {
                  const lines = c.text.split('\n');
                  const lineWordCounts = lines.map(l => l.split(' ').length);
                  const totalWords = lineWordCounts.reduce((a, b) => a + b, 0);
                  const isTikTok = subSettings.style === 'tiktok';
                  const isKinetic = subSettings.style === 'kinetic';
                  const progress = Math.max(0, Math.min(1, (currentTime - c.start) / (c.end - c.start)));
                  const globalActiveIndex = Math.floor(progress * totalWords);
                  const isLoud = isTikTok && c.text === c.text.toUpperCase() && c.text.match(/[a-zA-Z]/) !== null;

                  return (
                  <div key={i} className="text-center mb-1">
                    {lines.map((line, j) => {
                      const words = line.split(' ');
                      const startGlobalIndex = lineWordCounts.slice(0, j).reduce((a, b) => a + b, 0);

                      return (
                      <div 
                        key={j} 
                        className={`inline-block font-bold leading-tight ${subSettings.color} pointer-events-auto ${isTikTok && isLoud ? 'animate-shake text-red-500' : ''}`} 
                        style={{ 
                          fontSize: isTikTok && isLoud ? `calc(${subSettings.size} * 1.3)` : subSettings.size,
                          textShadow: subSettings.bg === 'text-shadow' ? (isTikTok && isLoud ? '0px 0px 15px red' : '0px 0px 6px black, 0px 0px 12px black') : 'none',
                          backgroundColor: subSettings.bg === 'solid' ? 'rgba(0,0,0,0.8)' : 'transparent',
                          padding: subSettings.bg === 'solid' ? '2px 10px' : '0',
                          borderRadius: subSettings.bg === 'solid' ? '8px' : '0',
                          transform: isKinetic ? `scale(${kineticAudioScale})` : 'none',
                          filter: isKinetic && kineticAudioScale > 1.1 ? `blur(${(kineticAudioScale - 1) * 3}px) drop-shadow(0 0 10px ${subSettings.color.replace('text-', '')})` : 'none',
                          transition: 'transform 50ms ease-out, filter 50ms ease-out'
                        }}
                        onMouseLeave={() => { latestHoverWordRef.current = null; setHoveredWord(null); }}
                      >
                        {words.map((word, k) => {
                          const myGlobalIndex = startGlobalIndex + k;
                          const isActive = isTikTok && myGlobalIndex === globalActiveIndex;
                          const isPast = isTikTok && myGlobalIndex < globalActiveIndex;

                          return (
                          <span 
                            key={k} 
                            onMouseEnter={(e) => handleWordHover(word, e)}
                            className={`cursor-help transition-all duration-100 inline-block ${isTikTok ? (isActive ? 'scale-110 text-yellow-400 font-black drop-shadow-md' : isPast ? 'opacity-90' : 'opacity-50') : 'hover:text-yellow-400'}`}
                            style={{ marginRight: isTikTok ? '0.3em' : '0' }}
                          >
                            {word}{isTikTok ? '' : ' '}
                          </span>
                        )})}
                      </div>
                    )})}
                  </div>
                )})}
            </div>
          )}

          {isRemoteStreaming && connMode === 'webrtc' && !remoteStream && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none">
              <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(220,38,38,0.5)]"></div>
              <p className="text-white text-xl font-bold animate-pulse">{t.waitingForStream}</p>
            </div>
          )}

          {/* SIRADAKİ FİLM UI */}
          {duration > 0 && duration - currentTime <= 15 && !isRemoteStreaming && !isTV && !selectedMovie.video_path.startsWith("torrent-") && !selectedMovie.video_path.startsWith("yt-") && (sameCollectionMovies[0] || recommendedMovies[0]) && (
             <div className="absolute bottom-32 right-10 z-[100000] bg-black/80 border border-zinc-700 p-4 rounded-xl shadow-2xl backdrop-blur-md animate-in slide-in-from-right w-80">
               <p className="text-zinc-400 text-[10px] font-bold mb-3 uppercase tracking-widest">{t.upNextStarting}</p>
               <div className="flex gap-4">
                 <div className="w-16 h-24 bg-zinc-800 rounded flex-shrink-0">
                   <img src={(sameCollectionMovies[0] || recommendedMovies[0]).poster_url || ""} className="w-full h-full object-cover rounded"/>
                 </div>
                 <div className="flex flex-col justify-center w-full">
                   <p className="text-white font-bold text-sm line-clamp-2">{(sameCollectionMovies[0] || recommendedMovies[0]).title}</p>
                   
                   <div className="w-full h-1 bg-zinc-700 mt-2 rounded overflow-hidden">
                     <div className="h-full bg-red-600 transition-all duration-1000 ease-linear" style={{width: `${((15 - (duration - currentTime)) / 15) * 100}%`}}></div>
                   </div>
                   
                   <p className="text-xs text-zinc-400 mt-1">{Math.ceil(duration - currentTime)} {t.secondsLeft}</p>

                   <div className="flex gap-2 mt-2">
                     <button onClick={(e) => { 
                       e.stopPropagation(); 
                       closePlayer().then(() => setTimeout(() => startPlayer(sameCollectionMovies[0] || recommendedMovies[0]), 500)); 
                     }} className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 rounded transition">
                       {t.openNowBtn}
                     </button>
                   </div>
                 </div>
               </div>
             </div>
          )}

          {currentTime > 10 && currentTime < 120 && !isRemoteStreaming && !isWeb && !selectedMovie.video_path.startsWith("yt-") && (
             <div className="absolute bottom-32 right-10 z-[100000] flex flex-col items-end gap-2 animate-in slide-in-from-right">
               <button onClick={(e) => { e.stopPropagation(); handleSeekPlayer(currentTime + 85); }} className="bg-black/80 border border-zinc-500 text-white font-bold px-6 py-3 rounded hover:bg-white hover:text-black transition-all hover:scale-105 shadow-2xl backdrop-blur">
                 ⏭️ {t.skipIntro || "İntroyu Atla"}
               </button>
               <label className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded border border-zinc-700 cursor-pointer text-xs text-zinc-300 hover:text-white transition backdrop-blur shadow-lg">
                 <input 
                   type="checkbox" 
                   checked={autoSkipIntro} 
                   onChange={(e) => { 
                     setAutoSkipIntro(e.target.checked); 
                     localStorage.setItem("kinflix_auto_skip", String(e.target.checked)); 
                     if(e.target.checked) showToast("İntrolar artık otomatik atlanacak", "✅");
                   }} 
                   className="accent-white cursor-pointer"
                 />
                 Otomatik Atla
               </label>
             </div>
          )}

          {/* VİDEO KONTROL ÇUBUĞU */}
          <div className={`absolute bottom-0 left-0 right-0 z-[100000] bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
            <button onClick={closePlayer} className="absolute bottom-[90vh] left-6 text-4xl text-white hover:text-red-500 transition drop-shadow-lg">✕</button>

            {!isTV && partyStatus === 'connected' && (
              <button onClick={(e) => {e.stopPropagation(); setIsChatOpen(!isChatOpen);}} className="absolute bottom-[90vh] right-6 flex items-center gap-2 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur transition shadow-xl border border-blue-500">
                💬 {t.chatBtn} {unreadCount > 0 ? `(${unreadCount})` : ''}
              </button>
            )}

            {isRemoteStreaming && (
              <div className="absolute bottom-[90vh] right-[150px] bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-full animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.7)]">
                {connMode === 'webrtc' ? t.liveStreamBadge : t.networkStreamBadge}
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
              <span 
                className="text-sm font-medium w-16 text-center drop-shadow-md cursor-pointer hover:text-white transition select-none"
                onClick={(e) => { e.stopPropagation(); setRuntimeFormat(prev => prev === 'min' ? 'hour' : 'min'); }}
              >
                {formatTime(currentTime)}
              </span>
              
              <div 
                className="relative w-full h-1.5 bg-zinc-700/80 backdrop-blur rounded-lg cursor-pointer group hover:h-2 transition-all"
                onMouseMove={handleProgressMouseMove}
                onMouseLeave={() => setHoverTime(null)}
                onClick={(e) => { if(isRemoteStreaming && connMode === 'webrtc' && !isHost) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left; handleSeekPlayer((x / rect.width) * duration); }}
              >
                <div className="absolute top-0 left-0 h-full bg-red-600 rounded-lg shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{width: `${(currentTime/duration)*100}%`}}></div>
                {hoverTime !== null && !isRemoteStreaming && !isTV && !selectedMovie.video_path.startsWith('yt-') && (
                  <div className="absolute bottom-6 -translate-x-1/2 bg-black border border-zinc-700 rounded overflow-hidden shadow-2xl z-50 flex flex-col items-center pointer-events-none" style={{ left: hoverX }}>
                    <video ref={previewVideoRef} src={getSafeVideoSource()} className="w-40 h-[90px] object-cover" muted />
                    <span className="text-xs font-bold p-1 bg-black/80 w-full text-center">{formatTime(hoverTime)}</span>
                  </div>
                )}
              </div>
              
              <span 
                className="text-sm font-medium text-zinc-400 w-16 text-center drop-shadow-md cursor-pointer hover:text-white transition select-none"
              >
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button onClick={togglePlay} disabled={isRemoteStreaming && connMode === 'webrtc' && !isHost} className={`text-4xl transition drop-shadow-lg ${isRemoteStreaming && connMode === 'webrtc' && !isHost ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}`}>{isVideoPlaying ? "⏸" : "▶"}</button>
                <div className="flex items-center gap-2 group/vol relative drop-shadow-lg">
                  <button onClick={toggleMute} className="text-2xl hover:text-white transition w-8 text-center text-zinc-300">{isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</button>
                  <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={handleVolumeChangePlayer} className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-300 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white" />
                </div>
                <h2 className="text-xl font-bold truncate max-w-md ml-2 drop-shadow-md">{selectedMovie.title}</h2>
              </div>

              <div className="flex items-center gap-6 relative drop-shadow-lg">
                
                {/* YENİ: GERÇEK SAAT GÖSTERGESİ */}
                <span className="text-zinc-400 font-mono text-sm tracking-wider mr-2 hidden md:block">
                  🕒 {realTime}
                </span>

                {isVirtualTheaterOpen && (
                   <select 
                     value={theaterTheme}
                     onChange={(e: any) => {
                        setTheaterTheme(e.target.value);
                        if (partyStatus === 'connected') broadcastEvent('change_theme', { theme: e.target.value });
                     }}
                     className="bg-black/50 border border-zinc-500 rounded px-2 py-1 text-sm font-bold outline-none hover:border-white transition"
                   >
                     <option value="vip">Tema: VIP Salon</option>
                     <option value="space">Tema: Uzay Boşluğu</option>
                     <option value="retro">Tema: 90'lar Retro</option>
                   </select>
                )}

                <div className="relative">
                  <button onClick={(e) => {e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); setShowSubMenu(false);}} className="text-base font-bold text-zinc-300 hover:text-white transition w-8">{playbackSpeed}x</button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-12 right-0 w-24 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl z-50">
                      {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                        <button key={rate} disabled={isRemoteStreaming && connMode === 'webrtc' && !isHost} onClick={() => changePlaybackSpeed(rate)} className={`w-full text-center px-4 py-2 text-sm hover:bg-zinc-800 ${playbackSpeed === rate ? "text-red-500 font-bold" : "text-white"} ${isRemoteStreaming && connMode === 'webrtc' && !isHost ? "opacity-50 cursor-not-allowed" : ""}`}>{rate}x</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`flex items-center gap-4 transition-all duration-300 overflow-hidden ${showExtraControls ? 'max-w-[400px] opacity-100 px-2' : 'max-w-0 opacity-0 px-0'}`}>
                  <button 
                    onClick={toggleVoiceBoost} 
                    className={`text-xl font-bold transition group relative mt-1 ${isVoiceBoosted ? 'text-blue-500' : 'text-zinc-300 hover:text-white'}`}
                    title={t.voiceBoostTitle}
                  >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>
                    </svg>
                    {isVoiceBoosted && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>}
                  </button>

                  <button onClick={(e) => {e.stopPropagation(); setIsSoundtrackOpen(true);}} className="text-xl font-bold text-zinc-300 hover:text-emerald-400 transition hover:scale-110" title="Soundtrack Radar (Şarkıyı Bul)">🎵</button>

                  <button onClick={(e) => {e.stopPropagation(); window.dispatchEvent(new CustomEvent('kinflix_party_event', { detail: { action: 'toggle_xray' } }));}} className="text-xl font-bold text-zinc-300 hover:text-white transition hover:scale-110" title="X-Ray (Oyuncular)">🔍</button>

                  <button onClick={(e) => {e.stopPropagation(); setIsClipperOpen(true);}} className="text-xl font-bold text-zinc-300 hover:text-white transition hover:scale-110" title="Meme / Klip Al (Kinflix Clipper)">✂️</button>

                  <button onClick={(e) => {e.stopPropagation(); takeScreenshot();}} className="text-xl font-bold text-zinc-300 hover:text-white transition hover:scale-110" title="Ekran Görüntüsü Al">📸</button>

                  <button onClick={(e) => {e.stopPropagation(); setShowVideoSettings(!showVideoSettings); setShowSubMenu(false); setShowSpeedMenu(false);}} className="text-xl font-bold text-zinc-300 hover:text-white transition" title="Görüntü Ayarları">🎨</button>
                </div>

                <button 
                  onClick={(e) => {e.stopPropagation(); setShowExtraControls(!showExtraControls);}} 
                  className={`text-zinc-500 hover:text-white transition transform ${showExtraControls ? 'rotate-180' : ''}`}
                  title="Ekstra Araçlar"
                >
                  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1.5em" width="1.5em" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"></path>
                  </svg>
                </button>
                
                {/* YENİ: Video Görüntü Ayarları Menüsü */}
                {showVideoSettings && (
                  <div className="absolute bottom-12 right-12 w-64 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-2xl z-50 flex flex-col gap-4">
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Görüntü Ayarları</div>
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1"><span>Parlaklık</span> <span>{videoFilters.brightness}x</span></div>
                      <input type="range" min="0.1" max="3" step="0.1" value={videoFilters.brightness} onChange={(e) => setVideoFilters({...videoFilters, brightness: parseFloat(e.target.value)})} className="w-full accent-white" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1"><span>Kontrast</span> <span>{videoFilters.contrast}x</span></div>
                      <input type="range" min="0.1" max="3" step="0.1" value={videoFilters.contrast} onChange={(e) => setVideoFilters({...videoFilters, contrast: parseFloat(e.target.value)})} className="w-full accent-white" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1"><span>Doygunluk</span> <span>{videoFilters.saturation}x</span></div>
                      <input type="range" min="0" max="3" step="0.1" value={videoFilters.saturation} onChange={(e) => setVideoFilters({...videoFilters, saturation: parseFloat(e.target.value)})} className="w-full accent-white" />
                    </div>
                    <button onClick={() => setVideoFilters({brightness: 1, contrast: 1, saturation: 1})} className="text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded mt-2">Sıfırla</button>
                    
                    <hr className="border-zinc-700 my-2" />
                    <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1">
                      <span>🧪</span> Deneysel (Experimental)
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label onClick={() => setExpFourthWall(!expFourthWall)} className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-10 h-5 rounded-full p-1 transition-colors ${expFourthWall ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${expFourthWall ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <span className="text-xs font-bold text-zinc-300 group-hover:text-white transition">Matrix Modu (Dördüncü Duvar)</span>
                      </label>
                      
                      <label onClick={() => setExpSocial(!expSocial)} className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-10 h-5 rounded-full p-1 transition-colors ${expSocial ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${expSocial ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <span className="text-xs font-bold text-zinc-300 group-hover:text-white transition">Sosyal Zaman Makinesi</span>
                      </label>
                      <label onClick={() => setExpBrainRot(!expBrainRot)} className="flex items-center gap-2 cursor-pointer group mt-2">
                        <div className={`w-10 h-5 rounded-full p-1 transition-colors ${expBrainRot ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${expBrainRot ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <span className="text-xs font-bold text-zinc-300 group-hover:text-white transition">🧠 Gen-Z Modu</span>
                      </label>
                      <label onClick={() => setExpVoiceControl(!expVoiceControl)} className="flex items-center gap-2 cursor-pointer group mt-2">
                        <div className={`w-10 h-5 rounded-full p-1 transition-colors ${expVoiceControl ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${expVoiceControl ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <span className="text-xs font-bold text-zinc-300 group-hover:text-white transition">🎤 Sesli Komut (Jarvis)</span>
                      </label>

                      <div>
                        <div className="text-xs text-zinc-400 mb-1">Gerçek Zamanlı LUT Filtresi</div>
                        <select 
                          value={expLUT} 
                          onChange={(e) => setExpLUT(e.target.value)} 
                          className="w-full bg-zinc-950 border border-zinc-700 text-xs text-white rounded p-1.5 outline-none cursor-pointer"
                        >
                          <option value="none">Kapalı</option>
                          <option value="matrix">Matrix (Yeşil Tonlu)</option>
                          <option value="madmax">Mad Max (Turuncu/Mavi)</option>
                          <option value="sincity">Sin City (Siyah Beyaz/Kontrast)</option>
                          <option value="cyberpunk">Cyberpunk 2077 (Neon)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <button onClick={(e) => {e.stopPropagation(); setShowSubMenu(!showSubMenu); setShowSpeedMenu(false); setShowVideoSettings(false);}} className="text-xl font-bold text-zinc-300 hover:text-white">CC</button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVirtualTheater(!isVirtualTheaterOpen);
                  }}
                  className={`text-2xl transition mt-1 ${isVirtualTheaterOpen ? 'text-purple-500 hover:text-purple-400' : 'text-zinc-300 hover:text-white'}`}
                  title={t.theaterModeBtn}
                >
                  👓
                </button>

                {!isTV && <button onClick={togglePip} className="text-2xl text-zinc-300 hover:text-white transition" title="Small Window">◱</button>}
                <button onClick={toggleFullscreen} className="text-2xl text-zinc-300 hover:text-white">⛶</button>
                
                {/* CC (ALTYAZI) MENÜSÜ İÇİNDEKİ STREMİO/Aİ KISMI GERİ GELDİ */}
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
                    
                    <div className="bg-zinc-800 px-4 py-2 mt-1 text-xs font-bold text-zinc-400 uppercase tracking-wider">Stil Ayarları</div>
                    <div className="p-2 flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); updateSubSetting('style', 'classic'); }} className={`flex-1 py-1.5 rounded text-[10px] font-bold ${subSettings.style === 'classic' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>Klasik</button>
                      <button onClick={(e) => { e.stopPropagation(); updateSubSetting('style', 'tiktok'); }} className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${subSettings.style === 'tiktok' ? 'bg-[#00f2fe] text-black shadow-[0_0_10px_rgba(0,242,254,0.5)]' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>TikTok <span>💥</span></button>
                      <button onClick={(e) => { e.stopPropagation(); updateSubSetting('style', 'kinetic'); }} className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${subSettings.style === 'kinetic' ? 'bg-[#8b5cf6] text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>Kinetic <span>🎶</span></button>
                    </div>

                    {!isTV && (
                      <>
                        <div className="bg-zinc-800 px-4 py-2 mt-1 text-xs font-bold text-zinc-400 uppercase tracking-wider">{t.findFromInternet}</div>
                        <div className="p-2">
                          
                          <div className="flex gap-2 mb-2">
                            <select 
                               value={subSearchLang} 
                               onChange={(e) => setSubSearchLang(e.target.value)}
                               onClick={(e) => e.stopPropagation()}
                               className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-300 rounded p-1.5 flex-1 outline-none cursor-pointer"
                            >
                               <option value="tur">Türkçe</option>
                               <option value="eng">İngilizce</option>
                               <option value="spa">İspanyolca</option>
                               <option value="fre">Fransızca</option>
                               <option value="ger">Almanca</option>
                               <option value="all">Tüm Diller</option>
                            </select>
                            <input 
                               type="text" 
                               value={subSearchQuery}
                               onChange={(e) => setSubSearchQuery(e.target.value)}
                               placeholder="Farklı ara (isim / tt0000000)"
                               className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-300 rounded p-1.5 flex-[2] outline-none"
                               onClick={(e) => e.stopPropagation()}
                               onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>

                          {osResults.length === 0 && !isSearchingOS && (
                            <button onClick={(e) => {e.stopPropagation(); searchStremioSubtitles(subSearchLang, subSearchQuery)}} className="w-full rounded bg-blue-600/20 py-2 text-xs font-bold text-blue-500 hover:bg-blue-600/40 transition mb-2">🔍 İnternette Ara</button>
                          )}
                          
                          <button 
                            onClick={handleGenerateAISubtitle} 
                            disabled={isGeneratingSub}
                            className="flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 mb-2 rounded font-bold text-xs transition disabled:opacity-50"
                          >
                            {isGeneratingSub ? "⏳ Dinleniyor..." : "🤖 AI ile Üret"}
                          </button>
                          
                          {isSearchingOS && <div className="text-center text-sm text-zinc-400 py-2">{t.searchingStremio}</div>}
                          {osError && <div className="text-center text-xs text-red-500 py-2 font-bold bg-red-950/30 rounded mb-2">{osError}</div>}
                          
                          {osResults.length > 0 && <button onClick={(e) => {e.stopPropagation(); setOsResults([]); setSubSearchQuery("");}} className="w-full text-center text-[10px] text-zinc-500 hover:text-white mb-1">Sonuçları Gizle</button>}
                          
                          <div className="max-h-40 overflow-y-auto custom-scrollbar">
                            {osResults.map((res: any) => {
                              const isDownloading = downloadingId === res.id;
                              return (
                                <button key={res.id} disabled={isDownloading} onClick={(e) => {e.stopPropagation(); downloadStremioSubtitle(res)}} className={`w-full text-left px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800 rounded truncate ${isDownloading ? 'opacity-50' : ''}`} title={res.id}>
                                  {isDownloading ? "⏳ İndiriliyor..." : `⬇ [${res.lang.toUpperCase()}] ${res.id}`}
                                </button>
                              );
                            })}
                          </div>
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

      {/* YENİ: Altyazı Çeviri Tooltipi */}
      {hoveredWord && (
        <div 
          className="fixed z-[999999] bg-black/90 text-white px-4 py-2 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] border border-zinc-700 pointer-events-none transform -translate-x-1/2 -translate-y-[120%] flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
          style={{ left: hoveredWord.x, top: hoveredWord.y }}
        >
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-1 border-b border-zinc-700 pb-1 w-full text-center">{hoveredWord.word}</span>
          <span className={`text-base font-bold whitespace-nowrap ${hoveredWord.loading ? 'animate-pulse text-yellow-500' : 'text-white'}`}>{hoveredWord.translation}</span>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/90 border-b border-r border-zinc-700 rotate-45"></div>
        </div>
      )}
    </div>
  );
}

export default App;
