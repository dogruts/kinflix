// src/App.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
// @ts-ignore
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window || '__TAURI__' in window);
const isTV = typeof navigator !== 'undefined' && /(Web0S|NetCast|SmartTV|Tizen)/i.test(navigator.userAgent);
const isWeb = !isTauri; 

import { getMovieMetadata } from "./tmdb";
import {
  initializeDatabase, getMovies, saveMovie, updateMovieMetadata, updateMovieProgress,
  getSetting, setSetting, removeLibraryFolder, removeMovie, clearDatabase, setWatchlist, type Movie,
} from "./database";

const MovieCardFallback = ({ movie }: { movie: Movie }) => (
  <div className="w-full h-full aspect-[2/3] relative group bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-500 transition-all duration-300 shadow-lg cursor-pointer">
    {movie.poster_url ? (
      <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
    ) : (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 p-3 text-center">
        <span className="text-4xl mb-3 opacity-50">🎬</span>
        <span className="text-zinc-300 text-sm font-bold tracking-wider leading-snug px-1 line-clamp-3">
          {movie.title}
        </span>
      </div>
    )}
    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
      <h3 className="text-white font-bold text-sm line-clamp-2 leading-tight mb-1">{movie.title}</h3>
      {movie.year ? <span className="text-zinc-400 text-xs font-semibold">{movie.year}</span> : null}
      {/* YENİ: movie.progress için güvenlik kontrolü (undefined hatasını önler) */}
      {(movie.progress || 0) > 5 && (movie.is_watched || 0) === 0 && (
        <div className="w-full h-1 bg-zinc-700 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-red-600" style={{ width: `${Math.min(((movie.progress || 0) / ((movie.runtime || 120) * 60)) * 100, 100)}%` }}></div>
        </div>
      )}
    </div>
    {movie.rating != null && movie.rating > 0 && (
      <div className="absolute top-2 right-2 bg-black/80 text-yellow-500 text-[11px] font-bold px-1.5 py-0.5 rounded border border-yellow-900/50 backdrop-blur shadow-xl z-10 flex items-center gap-1">
        ⭐ {movie.rating.toFixed(1)}
      </div>
    )}
  </div>
);

const HeroBanner = ({ movies, onPlay, onInfo, t }: { movies: Movie[], onPlay: (m: Movie) => void, onInfo: (m: Movie) => void, t: any }) => {
  const heroMovies = useMemo(() => shuffleArray(movies.filter((m: Movie) => m.backdrop_url)).slice(0, 10), [movies]);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (heroMovies.length <= 1) return;
    const interval = setInterval(() => setHeroIndex(prev => (prev + 1) % heroMovies.length), 8000);
    return () => clearInterval(interval);
  }, [heroMovies]);

  const heroMovie = heroMovies[heroIndex] || movies[0];
  if (!heroMovie) return null;

  return (
    <div className="relative -mt-24 mb-10 h-[70vh] w-full transition-all duration-1000 ease-in-out">
      {heroMovie.backdrop_url ? <img src={heroMovie.backdrop_url} key={heroMovie.video_path} className="h-full w-full object-cover opacity-80 animate-in fade-in duration-1000" /> : <div className="h-full w-full bg-zinc-900" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/20 to-[#0b0b0b]/40" />
      <div className="absolute bottom-20 left-10 z-10 max-w-2xl drop-shadow-2xl">
        <h1 className="text-6xl font-extrabold md:text-7xl">{heroMovie.title}</h1>
        <p className="mt-4 line-clamp-3 text-lg font-medium text-zinc-300">{heroMovie.overview}</p>
        <div className="mt-6 flex gap-4">
          <button onClick={() => onPlay(heroMovie)} className="flex items-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200"><span className="text-2xl">▶</span> {(heroMovie.progress || 0) > 0 ? t.resume : t.play}</button>
          <button onClick={() => onInfo(heroMovie)} className="flex items-center gap-2 rounded bg-zinc-500/50 px-8 py-3 text-xl font-bold text-white backdrop-blur transition hover:bg-zinc-500/70">{t.info}</button>
        </div>
      </div>
    </div>
  );
};

const dict = {
  tr: {
    home: "Ana Sayfa", library: "Tüm Filmler", collections: "Koleksiyonlar", watchlistTab: "İzlenecekler", sync: "TMDB Güncelle", addLib: "+ Kütüphane Ekle",
    syncing: "Eşitleniyor...", scanning: "Taranıyor...", settings: "Ayarlar", emptyLib: "Kütüphanen Bomboş", clickToStart: "Başlamak İçin Tıkla", 
    emptyWatchlist: "İzlenecekler listeniz şu an boş.", continue: "Kaldığın Yerden Devam Et", newReleases: "Yeni Çıkanlar", topRated: "En Yüksek Puanlılar",
    watchlist: "İzlenecekler Listem", toWatch: "Sonra İzle", inWatchlist: "Listede", search: "Film, Oyuncu, Yönetmen Ara...", allGenres: "Tüm Türler", sort: "Sırala",
    sortAZ: "A - Z", sortNew: "En Yeni Yıl", sortRating: "En Yüksek Puan", play: "Oynat", resume: "Devam Et", info: "ⓘ Daha Fazla Bilgi", similar: "Benzer Filmler",
    noOverview: "Bu film için herhangi bir özet bulunamadı.", apiToken: "TMDB API Token", libCount: "Kütüphaneler", remove: "KALDIR", dangerZone: "Tehlikeli Bölge", 
    resetDb: "Veritabanını Sıfırla", language: "Arayüz Dili", subs: "Altyazılar", subOff: "Kapalı", searchSubTr: "Altyazı (TR)", searchSubEn: "Altyazı (EN)",
    party: "Party Watch", joinLabel: "Odaya Katıl (Kod veya IP):", connect: "Bağlan", connected: "Bağlantı Başarılı!", disconnected: "Bağlı Değil",
    random: "🎲 Rastgele", chatMsg: "Mesaj yaz...", send: "Gönder",
    // YENİ DİL ANAHTARLARI
    min: "dk", h: "s", m: "dk",
    forYouTitle: "✨ Sana Özel Algoritma", forYouDesc: "Beğendiğin filmlerin ağırlık grafiğine göre senin için seçilenler.",
    ytsTitle: "🏴‍☠️ YTS Dünyası", ytsDesc: "P2P Torrent Streaming", ytsLoading: "Korsan ağlara bağlanılıyor...",
    sameCollection: "🎬 Aynı Serideki Filmler", upNext: "Sıradaki Öneri", startNow: "Hemen Başlat ▶", skipIntro: "İntroyu Atla (85s) ❯",
    whoIsWatching: "Kim İzliyor?", newProfile: "Yeni Profil", addProfile: "Profil Ekle", enterName: "İsim girin...", save: "Kaydet", cancel: "İptal",
    statsTitle: "📊 İstatistiklerin", statsWatched: "İzlenen Film", statsTime: "İzleme Süresi", statsFavGenre: "En Sevdiğin Tür",
    chatBtn: "SOHBET", partyChat: "Party Chat", hostCode: "Sabit İnternet Oda Kodu (Host):", changeCode: "🔄 Kodu Değiştir", 
    localIp: "Yerel IP (Aynı Ev / Wi-Fi İçin):", tvShortCode: "TV Kısa Kodu", enterFriendCode: "Arkadaşının Kodunu Gir:", leaveRoom: "Ağı Kapat ve Odadan Ayrıl", 
    disconnect: "Odadan Ayrıl / Bağlantıyı Kes", syncCatalog: "🔄 Kataloğu Senkronize Et", joinFromPhone: "Telefondan Katıl", scanQr: "Kameranı okutarak anında odaya gir.", 
    guestMode: "Misafir Modundasınız 🎭", guestModeDesc: "Oda kurucusunun (Host) kütüphanesini görüntülüyorsunuz. Bütün film verileri doğrudan Host'tan size aktarılıyor.", 
    systemStatus: "Sistem Durumu", desktopUpdates: "Masaüstü Güncellemeleri", checkUpdates: "Sürüm Kontrolü Yap", checkingUpdates: "⏳ Kontrol Ediliyor...",
    updateFound: "🎉 Yeni güncelleme bulundu!", upToDate: "✅ Uygulamanız güncel.", updateError: "❌ Güncelleme sunucusuna bağlanılamadı.",
    convertStarted: "⏳ Çevriliyor...", convertToX264: "🔄 Web İçin Optimize Et (x264)", findFromInternet: "İnternetten Bul (STREMIO)", 
    searchingStremio: "Stremio'da Aranıyor...", subNotFound: "Altyazı bulunamadı.", downloading: "⏳ İndiriliyor...", connError: "Bağlantı Hatası", 
    connectingToRoom: "Odaya Bağlanılıyor...", cancelAndReturn: "✕ İptal Et ve Geri Dön", tvDesc: "Televizyon kumandası ile yerel ağı (Kısa TV Kodu) veya IP adresini girerek bağlan."
  },
  en: {
    home: "Home", library: "All Movies", collections: "Collections", watchlistTab: "Watchlist", sync: "Sync TMDB", addLib: "+ Add Library",
    syncing: "Syncing...", scanning: "Scanning...", settings: "Settings", emptyLib: "Your Library is Empty", clickToStart: "Click to Start", 
    emptyWatchlist: "Your watchlist is empty.", continue: "Continue Watching", newReleases: "New Releases", topRated: "Top Rated",
    watchlist: "My Watchlist", toWatch: "Watch Later", inWatchlist: "In Watchlist", search: "Search Movies, Actors, Directors...", allGenres: "All Genres", sort: "Sort By",
    sortAZ: "A - Z", sortNew: "Newest", sortRating: "Highest Rated", play: "Play", resume: "Resume", info: "ⓘ More Info", similar: "Similar Movies",
    noOverview: "No overview found for this movie.", apiToken: "TMDB API Token", libCount: "Libraries", remove: "REMOVE", dangerZone: "Danger Zone", 
    resetDb: "Reset Database", language: "Interface Language", subs: "Subtitles", subOff: "Off", searchSubTr: "Search Sub (TR)", searchSubEn: "Search Sub (EN)",
    party: "Party Watch", joinLabel: "Join Room (Code or IP):", connect: "Connect", connected: "Connected!", disconnected: "Disconnected",
    random: "🎲 Random", chatMsg: "Type a message...", send: "Send",
    // NEW ENG KEYS
    min: "m", h: "h", m: "m",
    forYouTitle: "✨ For You", forYouDesc: "Movies selected for you based on the weighted graph of your liked genres.",
    ytsTitle: "🏴‍☠️ YTS Discovery", ytsDesc: "P2P Torrent Streaming", ytsLoading: "Connecting to peer networks...",
    sameCollection: "🎬 In Same Collection", upNext: "Up Next", startNow: "Start Now ▶", skipIntro: "Skip Intro (85s) ❯",
    whoIsWatching: "Who's Watching?", newProfile: "New Profile", addProfile: "Add Profile", enterName: "Enter name...", save: "Save", cancel: "Cancel",
    statsTitle: "📊 Your Stats", statsWatched: "Movies Watched", statsTime: "Time Watched", statsFavGenre: "Favorite Genre",
    chatBtn: "CHAT", partyChat: "Party Chat", hostCode: "Internet Room Code (Host):", changeCode: "🔄 Change Code", 
    localIp: "Local IP (For Same Wi-Fi):", tvShortCode: "TV Short Code", enterFriendCode: "Enter Friend's Code:", leaveRoom: "Close Network & Leave", 
    disconnect: "Disconnect / Leave Room", syncCatalog: "🔄 Sync Catalog", joinFromPhone: "Join from Phone", scanQr: "Scan QR with camera to join.", 
    guestMode: "Guest Mode 🎭", guestModeDesc: "Viewing the Host's library. All movie data is streamed directly from the Host.", 
    systemStatus: "System Status", desktopUpdates: "Desktop Updates", checkUpdates: "Check for Updates", checkingUpdates: "⏳ Checking...",
    updateFound: "🎉 Update available!", upToDate: "✅ App is up to date.", updateError: "❌ Failed to connect to update server.",
    convertStarted: "⏳ Converting...", convertToX264: "🔄 Optimize for Web (x264)", findFromInternet: "Find Online (STREMIO)", 
    searchingStremio: "Searching Stremio...", subNotFound: "Subtitle not found.", downloading: "⏳ Downloading...", connError: "Connection Error", 
    connectingToRoom: "Connecting to Room...", cancelAndReturn: "✕ Cancel & Return", tvDesc: "Enter Local IP or TV Short Code using your remote."
  }
};

type SortOption = "title_asc" | "year_desc" | "rating_desc";
type TabState = "home" | "library" | "collections" | "watchlist" | "yts" | "foryou";
type Lang = "tr" | "en";
type ParsedCue = { start: number; end: number; text: string };
type SubtitleTrack = { id: string; url: string; label: string; srtContent: string; offset: number; cues: ParsedCue[] };

type ChatMessage = { 
  id: string; 
  sender: "me" | "peer"; 
  author?: string; 
  type: "text" | "image"; 
  content: string; 
  timestamp: number;
  reactions?: Record<string, number>; 
};

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const generateLocalShortCode = (ip: string) => {
  if (!ip) return "";
  const parts = ip.split('.');
  if (parts.length === 4) {
    const val = parseInt(parts[2]) * 256 + parseInt(parts[3]);
    const valStr = val.toString().padStart(5, '0');
    if (ip.startsWith("192.168.")) return `9${valStr}`;
    if (ip.startsWith("10.0.")) return `8${valStr}`;
  }
  return "";
};

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

const parseSrtToCues = (content: string, offsetSeconds: number = 0) => {
  const cues: ParsedCue[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
  
  let currentCue: Partial<ParsedCue> = {};
  let textLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("WEBVTT")) continue; 
    
    if (!line) {
      if (currentCue.start !== undefined && currentCue.end !== undefined && textLines.length > 0) {
         currentCue.text = textLines.join('\n');
         cues.push(currentCue as ParsedCue);
      }
      currentCue = {};
      textLines = [];
      continue;
    }
    
    const match = timeRegex.exec(line);
    if (match) {
      const parseTime = (h:string, m:string, s:string, ms:string) => 
        parseInt(h)*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000 + offsetSeconds;
        
      currentCue.start = parseTime(match[1], match[2], match[3], match[4]);
      currentCue.end = parseTime(match[5], match[6], match[7], match[8]);
    } else if (currentCue.start !== undefined) {
       textLines.push(line.replace(/<[^>]+>/g, '')); 
    }
  }
  if (currentCue.start !== undefined && currentCue.end !== undefined && textLines.length > 0) {
    currentCue.text = textLines.join('\n');
    cues.push(currentCue as ParsedCue);
  }
  return cues;
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

  // "Bana Film Bul" Sihirbazı State'leri
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
    }, 1500); // 1.5 Saniye Rulet Animasyonu
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

  

  // 1. Altyazı Özelleştirme Stateleri
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

  // 2. Oyuncu/Yönetmen Keşif Modalı State'i
  const [personModal, setPersonModal] = useState<{name: string, photoUrl: string | null} | null>(null);

  const handlePersonClick = async (name: string) => {
    setPersonModal({ name, photoUrl: null });
    // TMDB Token varsa oyuncunun fotoğrafını arka planda çek
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
  const [isBgMuted, setIsBgMuted] = useState(true); // YENİ: Arkaplan ses kontrol state'i

  useEffect(() => {
    if (selectedMovie && !isPlaying) {
      setIsBgMuted(true); // Yeni filme tıklandığında ses her zaman varsayılan olarak kapalı (güvenli) başlasın
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

  // YTS ve Profil Stateleri
  const [ytsMovies, setYtsMovies] = useState<any[]>([]);
  const [isFetchingYts, setIsFetchingYts] = useState(false);
  
  const torrentClient = useRef<any>(null);

  useEffect(() => {
    torrentClient.current = new WebTorrent();
    return () => {
      if (torrentClient.current) torrentClient.current.destroy();
    };
  }, []);

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

  // YENİ: libraryMovies, recommendedMovies, YTS Effect DOĞRU YERDE!
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

// YTS.mx API Çağrısı (Türkiye Engeli İçin Yedekli Mirror Sistemi)
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
              return; // İlk çalışan mirror'da veriyi al ve döngüden çık
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
    const handleTvRemote = (e: KeyboardEvent) => {
      if (!isPlaying || !videoRef.current || isChatOpen) return; 
      switch(e.key) {
        case "ArrowRight": handleSeek(currentTime + 10); break;
        case "ArrowLeft": handleSeek(currentTime - 10); break;
        case "Enter": togglePlay(); break;
        case "ArrowUp":
          setVolume(v => { const newVol = Math.min(1, v + 0.1); if(videoRef.current) videoRef.current.volume = newVol; return newVol; });
          break;
        case "ArrowDown":
          setVolume(v => { const newVol = Math.max(0, v - 0.1); if(videoRef.current) videoRef.current.volume = newVol; return newVol; });
          break;
      }
    };
    window.addEventListener("keydown", handleTvRemote);
    return () => window.removeEventListener("keydown", handleTvRemote);
  }, [isPlaying, isChatOpen, currentTime]);

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

  const disconnectParty = () => {
    if (connRef.current) { connRef.current.close(); connRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    
    localStorage.removeItem("kinflix_last_session");
    setPartyStatus("disconnected");
    partyStatusRef.current = "disconnected"; 
    setConnMode("none");
    setIsPartyMenuOpen(false);
    
    if (isWeb || isTV) {
      setMovies([]);
      setSelectedMovie(null);
      setIsPlaying(false);
      setTargetAddress("");
    } 
    
    setTimeout(() => {
      initPeerHost(); 
    }, 500);
  };

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
      let successCount = 0;
      let failCount = 0;
      const batchSize = 5;

      for (let i = 0; i < storedMovies.length; i += batchSize) {
        const batch = storedMovies.slice(i, i + batchSize);
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
        
        if (i + batchSize < storedMovies.length) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
      setMovies(await getMovies(activeProfile || "default"));
      alert(`✅ TMDB Eşitleme Tamamlandı!\n\n✔ Başarılı: ${successCount}\n❌ Başarısız/Bulunamadı: ${failCount}`);
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

  const convertToX264 = async () => {
    if (!selectedMovie || isWeb) return;
    setIsConverting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      alert("Dönüştürme başladı. Bu işlem bilgisayarının hızına göre 10-20 dakika sürebilir. Arka planda devam ediyor.");
      const newPath = await invoke<string>("convert_to_x264", { videoPath: selectedMovie.video_path });
      alert(`✅ Çeviri Tamamlandı!\nYeni Dosya: ${newPath}\nKütüphaneyi yeniden tara (Klasör ekler gibi aynı klasörü tekrar seç).`);
    } catch (err) {
      alert("❌ Hata: " + err);
    } finally {
      setIsConverting(false);
    }
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
      const newCues = parseSrtToCues(sub.srtContent, newOffset);
      newSubs[index] = { ...sub, offset: newOffset, cues: newCues };
      if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs: newSubs, activeIndex: index }); }
      return newSubs;
    });
  };

  const searchStremioSubtitles = async (targetLang: "tur" | "eng") => {
    if (!selectedMovie) return;
    setIsSearchingOS(true);
    setOsError(null);
    try {
      let cleanQuery = selectedMovie.title.replace(/\b(1080p|720p|480p|2160p|4k|bluray|x264|x265|hevc|dual|remux|webrip|hdrip|hdtv|yify|yts)\b.*/i, '').replace(/(\[.*?\]|\(.*?\))/g, '').replace(/[-_.]/g, ' ').trim();
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
      const cues = parseSrtToCues(content, 0); 
      
      if (!isWeb && !selectedMovie?.video_path.startsWith("torrent-")) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("save_subtitle_file", { 
            videoPath: selectedMovie!.video_path, 
            content: content, 
            lang: sub.lang 
          });
          showToast("Altyazı filme kaydedildi!", "💾");
        } catch(e) { console.error("Kayıt hatası", e); }
      }

      setLocalSubs(prev => {
        const newSubs = [...prev, { id: `stremio_${sub.id}`, url: "", label: `🌐 ${sub.lang.toUpperCase()} - Stremio`, srtContent: content, offset: 0, cues }];
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
    const authorName = guestName || (isHost ? "Host" : "Misafir");
    const msg: ChatMessage = { id: Date.now().toString(), sender: "me", author: authorName, type: "text", content: chatInput, timestamp: Date.now() };
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
      const authorName = guestName || (isHost ? "Host" : "Misafir");
      const msg: ChatMessage = { id: Date.now().toString(), sender: "me", author: authorName, type: "image", content: base64, timestamp: Date.now() };
      saveChatMessage(msg);
      broadcastEvent("chat_msg", { msg });
    };
    reader.readAsDataURL(file);
  };

  const sendReaction = (msgId: string, emoji: string) => {
    setChatMessages(prev => {
      const newChat = prev.map(m => {
        if (m.id === msgId) {
          const reactions = { ...(m.reactions || {}) };
          reactions[emoji] = (reactions[emoji] || 0) + 1;
          return { ...m, reactions };
        }
        return m;
      });
      localStorage.setItem("kinflix_chat_history", JSON.stringify(newChat));
      return newChat;
    });
    broadcastEvent("chat_reaction", { msgId, emoji });
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

  const networkHandlerRef = useRef<Function | null>(null);
  
  useEffect(() => {
    networkHandlerRef.current = async (data: any) => {
      const hostMode = isHostRef.current;
      
      if (data.action === "network_info" && !hostMode && connModeRef.current === 'webrtc') {
        const hostIp = data.localIp;
        if (hostIp && hostIp !== "Bilinmiyor") {
          const httpBaseUrl = `http://${hostIp}:8765`;
          fetch(`${httpBaseUrl}/movies`, { cache: "no-store" }).then(res => {
            if (res.ok) {
              console.log("🔥 Kinflix Zekası: Aynı evde bulunuldu! WebRTC kapatılıp Yerel Ağa geçiliyor...");
              connectWebSocket(hostIp);
            }
          }).catch(() => {});
        }
      }
      else if (data.action === "request_catalog" && hostMode) {
        showToast("Bir misafir odaya bağlandı!", "👋");
        broadcastEvent("catalog", { catalog: moviesRef.current });
        
        if (selectedMovieRef.current) {
           broadcastEvent("load", { movie: selectedMovieRef.current });
           
           if (localSubsRef.current.length > 0) {
             broadcastEvent("sync_subs", {
               subs: localSubsRef.current,
               activeIndex: activeSubIndexRef.current
             });
           }
           
           setTimeout(() => {
              if (videoRef.current) {
                 broadcastEvent("seek", { time: videoRef.current.currentTime });
                 broadcastEvent(videoRef.current.paused ? "pause" : "play", { time: videoRef.current.currentTime });
              }
           }, 1500); 
        }
      }
      else if (data.action === "catalog" && !hostMode) {
        setMovies(data.catalog);
      }
      else if (data.action === "request_movie" && hostMode) {
        startPlayer(data.movie);
      }
      else if (data.action === "load" && !hostMode) { 
        setSelectedMovie(data.movie); 
        setIsPlaying(true); 
        setIsRemoteStreaming(true); 
      }
      else if (data.action === "left_movie" && hostMode) {
        showToast("Misafir oynatıcıyı kapattı.", "🛑");
      }
      else if (data.action === "sync_time" && !hostMode) {
        if (connModeRef.current === 'webrtc') {
          setCurrentTime(data.time);
          if (data.duration && !isNaN(data.duration) && isFinite(data.duration)) {
            setDuration(data.duration);
          }
        }
      }
      else if (data.action === "chat_msg") {
        const receivedMsg = data.msg as ChatMessage;
        receivedMsg.sender = "peer"; 
        saveChatMessage(receivedMsg);
        if (!isChatOpenRef.current) setUnreadCount(prev => prev + 1);
      }
      else if (data.action === "chat_reaction") {
        setChatMessages(prev => {
          const newChat = prev.map(m => {
            if (m.id === data.msgId) {
              const reactions = { ...(m.reactions || {}) };
              reactions[data.emoji] = (reactions[data.emoji] || 0) + 1;
              return { ...m, reactions };
            }
            return m;
          });
          localStorage.setItem("kinflix_chat_history", JSON.stringify(newChat));
          return newChat;
        });
      }
      else if (data.action === "voice_chat_closed") { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null; }
      else if (data.action === "sync_subs" && !hostMode) {
        const guestSubs = data.subs.map((sub: any) => { 
           return { ...sub, cues: parseSrtToCues(sub.srtContent, sub.offset) }; 
        });
        setLocalSubs(guestSubs); setActiveSubIndex(data.activeIndex);
      }
      else if (data.action === "change_sub_index" && !hostMode) { setActiveSubIndex(data.activeIndex); }
      else if (data.action === "rate_change" && !hostMode) {
        if (videoRef.current) videoRef.current.playbackRate = data.rate;
        setPlaybackSpeed(data.rate);
      }
      else if (videoRef.current && !hostMode) { 
        if (data.action === "play") { videoRef.current.currentTime = data.time; videoRef.current.play().catch(()=>{}); setIsVideoPlaying(true); } 
        else if (data.action === "pause") { videoRef.current.currentTime = data.time; videoRef.current.pause(); setIsVideoPlaying(false); } 
        else if (data.action === "seek") { videoRef.current.currentTime = data.time; setCurrentTime(data.time); }
      }
    };
  });

  const connectParty = (target: string) => {
    setPartyStatus("connecting");
    partyStatusRef.current = "connecting"; 

    if (!isHostRef.current) {
      localStorage.setItem("kinflix_last_session", JSON.stringify({ target, time: Date.now() }));
    }
    
    setChatMessages([]);
    localStorage.removeItem("kinflix_chat_history");

    if (!target) { setPartyStatus("disconnected"); partyStatusRef.current = "disconnected"; return; }
    
    const cleanTarget = target.trim(); 
    
    setTimeout(() => {
      if (partyStatusRef.current === 'connecting') {
        console.log("Bağlantı zaman aşımı.");
        disconnectParty();
        alert("❌ Odaya bağlanılamadı! Host uygulamayı kapatmış, kod değişmiş veya internet WebRTC'yi engelliyor olabilir.\nAynı evdeyseniz TV Kısa Kodunu kullanın.");
      }
    }, 15000);

    const isIp = cleanTarget.includes(".") || cleanTarget.startsWith("http") || cleanTarget === "localhost";
    
    if (!isIp) {
      if (cleanTarget.startsWith("9") && cleanTarget.length === 6 && !isNaN(Number(cleanTarget))) {
        const val = parseInt(cleanTarget.slice(1));
        const ip = `192.168.${Math.floor(val / 256)}.${val % 256}`;
        setConnMode("ip"); connModeRef.current = "ip";
        connectWebSocket(ip); return;
      } else if (cleanTarget.startsWith("8") && cleanTarget.length === 6 && !isNaN(Number(cleanTarget))) {
        const val = parseInt(cleanTarget.slice(1));
        const ip = `10.0.${Math.floor(val / 256)}.${val % 256}`;
        setConnMode("ip"); connModeRef.current = "ip";
        connectWebSocket(ip); return;
      } else if (cleanTarget.length === 6) {
        setConnMode("webrtc"); connModeRef.current = "webrtc";
        const targetId = `kinflix-room-${cleanTarget.toUpperCase()}`;
        connectPeerJS(targetId); return;
      }
    }

    if (isIp) { 
      setConnMode("ip"); connModeRef.current = "ip";
      connectWebSocket(cleanTarget); 
    } else { 
      disconnectParty();
      alert("Geçersiz 6 haneli kod veya IP adresi girdiniz.");
    }
  };

  const connectPeerJS = (targetId: string) => {
    if (!peerRef.current || peerRef.current.destroyed) {
      initPeerHost();
    }
    
    const doConnect = () => {
      if (!peerRef.current) return;
      const conn = peerRef.current.connect(targetId);
      connRef.current = conn;
      
      conn.on('open', () => { 
        setPartyStatus("connected"); partyStatusRef.current = "connected";
        setIsHost(false); isHostRef.current = false;
        setIsPartyMenuOpen(false); 

        if (!localStorage.getItem("kinflix_guest_name")) {
          setShowNameModal(true);
        }
        
        setTimeout(() => {
          if (connRef.current?.open) {
            connRef.current.send({ action: "request_catalog" });
            setTimeout(() => connRef.current?.send({ action: "request_catalog" }), 2000);
          }
        }, 500);
      });
      
      conn.on('error', () => { 
        if (partyStatusRef.current === 'connecting') {
          setPartyStatus("disconnected"); partyStatusRef.current = "disconnected";
        }
      });
      
      conn.on('data', (data) => {
        if (networkHandlerRef.current) networkHandlerRef.current(data);
      });
    };

    if (peerRef.current!.open) {
      doConnect();
    } else {
      peerRef.current!.on('open', doConnect);
    }
  };

  const connectWebSocket = async (address: string) => {
    if (wsRef.current) wsRef.current.close();
    const hostStatus = (address === localIp || address === "127.0.0.1") && !isWeb; 
    
    setIsHost(hostStatus); isHostRef.current = hostStatus;
    
    let wsUrl = address.startsWith("http") ? address.replace("http://", "ws://").replace("https://", "wss://") + "/ws" : `ws://${address}:8765/ws`;
    
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { 
      setPartyStatus("connected"); partyStatusRef.current = "connected";
      setTargetAddress(address); 
      setIsPartyMenuOpen(false); 

      if (!hostStatus && !localStorage.getItem("kinflix_guest_name")) {
        setShowNameModal(true);
      }
      
      setTimeout(() => {
        if (!hostStatus && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "request_catalog" }));
        }
      }, 500);
    };
    
    ws.onerror = () => { setPartyStatus("disconnected"); partyStatusRef.current = "disconnected"; };
    ws.onmessage = (e) => { 
      try { 
        const data = JSON.parse(e.data); 
        if (networkHandlerRef.current) networkHandlerRef.current(data); 
      } catch(err) {} 
    };
    ws.onclose = () => { if (partyStatusRef.current !== 'disconnected') { setPartyStatus("disconnected"); partyStatusRef.current = "disconnected"; } };
    wsRef.current = ws;
  };

  const initPeerHost = () => {
    setChatMessages([]);
    localStorage.removeItem("kinflix_chat_history");

    if (peerRef.current) return;

    let savedCode = localStorage.getItem("kinflix_host_code");
    if (!savedCode || isWeb) {
      savedCode = generateRoomCode();
      if (!isWeb) localStorage.setItem("kinflix_host_code", savedCode);
    }

    const customId = isWeb ? undefined : `kinflix-room-${savedCode}`; 
    const peer = customId ? new Peer(customId) : new Peer(); 
    
    peer.on('error', (err: any) => {
      console.error("PeerJS Hatası:", err);
      if (err.type === 'unavailable-id' && !isWeb) {
        localStorage.removeItem("kinflix_host_code");
        initPeerHost();
        return;
      }
      if (err.type === 'peer-unavailable' || err.type === 'network') {
        disconnectParty();
        alert("❌ Hata: Karşı taraf bulunamadı veya kod geçersiz!");
      }
    });

    peer.on('open', (id) => { setPeerId(isWeb ? id : savedCode!); });
    
    peer.on('connection', (conn) => {
      setPartyStatus("connected"); partyStatusRef.current = "connected";
      setConnMode("webrtc"); connModeRef.current = "webrtc";
      connRef.current = conn; 
      
      conn.on('close', () => {
        if (isHostRef.current) showToast("Misafir odadan ayrıldı.", "🚪");
      });

      if (!isWeb) {
        setIsHost(true); isHostRef.current = true;
        conn.on('open', () => { 
          if (localIpRef.current && localIpRef.current !== "Bilinmiyor") {
             conn.send({ action: "network_info", localIp: localIpRef.current });
          }
        });
      }
      
      conn.on('data', (data) => {
        if (networkHandlerRef.current) networkHandlerRef.current(data);
      });
    });
    
    peer.on('call', (call) => {
      console.log("📞 INCOMING PEER CALL:", call.metadata);

      if (call.metadata?.type === "movie") {
        console.log("🎬 Incoming movie stream");
        call.answer();
        call.on("stream", (videoStream) => {
          console.log("🎥 MOVIE STREAM RECEIVED");
          _setRemoteStream(videoStream);
          setIsRemoteStreaming(true);
        });
        call.on("error", (err) => {
          console.error("🎬 MOVIE CALL ERROR:", err);
        });
        return;
      }

      if (call.metadata?.type === "voice_chat") {
        call.answer();
        call.on("stream", (audioStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = audioStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        });
        return;
      }
    });
    peerRef.current = peer;
  };

  const broadcastEvent = (action: string, payload: any = {}) => {
    if (connModeRef.current === 'webrtc' && connRef.current?.open) { connRef.current.send({ action, ...payload }); } 
    else if (connModeRef.current === 'ip' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ action, ...payload })); }
  };

  const handleMovieClick = (movie: Movie) => {
    if (!isHostRef.current && partyStatusRef.current === 'connected') { 
      broadcastEvent("request_movie", { movie }); 
    } else { 
      setSelectedMovie(movie); 
    }
  };

  const [tauriConvertFileSrc, setTauriConvertFileSrc] = useState<any>(null);
  useEffect(() => {
    if (!isWeb) { import("@tauri-apps/api/core").then(({ convertFileSrc }) => setTauriConvertFileSrc(() => convertFileSrc)); }
  }, []);

  const getSafeVideoSource = () => {
    if (!selectedMovie || selectedMovie.video_path.startsWith("torrent-")) return ""; 
    const isHevc = /265|hevc/i.test(selectedMovie.video_path);
    
    if (isRemoteStreaming && connModeRef.current === 'ip') {
      const baseUrl = targetAddressRef.current.startsWith("http") ? targetAddressRef.current : `http://${targetAddressRef.current}:8765`;
      return isHevc 
        ? `${baseUrl}/transcode?path=${encodeURIComponent(selectedMovie.video_path)}`
        : `${baseUrl}/video?path=${encodeURIComponent(selectedMovie.video_path)}&quality=720p`;
    }
    
    if (isRemoteStreaming && connModeRef.current === 'webrtc') return "";
    
    if (isWeb) return "";

    if (partyStatusRef.current === 'connected' && connModeRef.current === 'webrtc') {
      return `http://127.0.0.1:8765/video?path=${encodeURIComponent(selectedMovie.video_path)}`;
    }

    return tauriConvertFileSrc ? tauriConvertFileSrc(selectedMovie.video_path) : "";
  };

  useEffect(() => {
    if (videoRef.current && isRemoteStreaming && connModeRef.current === 'webrtc' && remoteStream) {
      videoRef.current.src = ""; 
      videoRef.current.srcObject = remoteStream;
      videoRef.current.play().catch(e => {
        console.log("Otomatik oynatma engellendi, tıklama bekleniyor:", e);
        setIsVideoPlaying(false);
      });
    }
  }, [remoteStream, isRemoteStreaming, selectedMovie]);

  const streamYtsMovie = (ytsMovie: any) => {
    if (!ytsMovie.torrents || ytsMovie.torrents.length === 0) {
      showToast("Bu film için uygun kaynak bulunamadı.", "❌");
      return;
    }
  
    const bestTorrent = ytsMovie.torrents.find((t: any) => t.quality === "1080p") || ytsMovie.torrents[0];
    const magnetURI = `magnet:?xt=urn:btih:${bestTorrent.hash}&dn=${encodeURIComponent(ytsMovie.title)}&tr=udp://open.demonii.com:1337/announce&tr=udp://tracker.openbittorrent.com:80`;
  
    showToast("Korsan ağa bağlanılıyor, eşler aranıyor...", "🏴‍☠️");
  
    const fakeMovie: Movie = {
      video_path: `torrent-${ytsMovie.id}`,
      title: ytsMovie.title,
      year: ytsMovie.year,
      folder_path: "YTS",
      poster_url: ytsMovie.large_cover_image,
      backdrop_url: ytsMovie.background_image,
      overview: ytsMovie.summary,
      rating: ytsMovie.rating,
      genres: ytsMovie.genres?.join(", "),
      runtime: ytsMovie.runtime
    };
  
    setSelectedMovie(fakeMovie);
    setIsPlaying(true);
    setIsVideoPlaying(true);
  
    if (torrentClient.current) {
      torrentClient.current.add(magnetURI, (torrent: any) => {
        showToast("Bağlantı kuruldu, video yükleniyor...", "⚡");
        const file = torrent.files.find((f: any) => f.name.endsWith('.mp4'));
        if (file && videoRef.current) {
          file.renderTo(videoRef.current);
        }
      });
    }
  };

  const startPlayer = async (movieOverride?: Movie) => {
    const movieToPlay = movieOverride || selectedMovie;
    if (!movieToPlay) return;
    setIsRemoteStreaming(false);

    if (isHostRef.current && partyStatusRef.current === 'connected') { 
      broadcastEvent("load", { movie: movieToPlay }); 
    }

    if (!isWeb && !movieToPlay.video_path.startsWith("torrent-")) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const srtFiles = await invoke<string[]>("get_local_subtitles", { video_path: movieToPlay.video_path });
        const subs: SubtitleTrack[] = [];
        for (let i = 0; i < srtFiles.length; i++) {
          const path = srtFiles[i];
          const content = await invoke<string>("read_text_file", { path });
          const fileName = path.split(/[/\\]/).pop() || `Yerel Altyazı ${i + 1}`;
          const label = `📂 ${fileName.replace(/\.srt$/i, '')}`;
          subs.push({ id: `local_${i}`, url: "", label, srtContent: content, offset: 0, cues: parseSrtToCues(content, 0) });
        }
        setLocalSubs(subs);
        const activeIdx = subs.length > 0 ? 0 : -1;
        setActiveSubIndex(activeIdx); 
        if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs, activeIndex: activeIdx }); }
      } catch (error) {}
    }
    
    setOsResults([]); setOsError(null); setSelectedMovie(movieToPlay); setIsPlaying(true); setIsVideoPlaying(true); setPlaybackSpeed(1);
    
    if (connModeRef.current === 'webrtc' && isHostRef.current && partyStatusRef.current === 'connected' && !movieToPlay.video_path.startsWith("torrent-")) {
      const handlePlaying = async () => {
        if (connRef.current && videoRef.current && peerRef.current) {
           if (callRef.current) { callRef.current.close(); }
           
           const isHevcFile = /265|hevc/i.test(movieToPlay.video_path);
           if (isHevcFile) {
             const useScreenShare = window.confirm("Bu film H265 (HEVC) formatında!\n\nTAMAM: Ekranı Paylaş (Siyah ekran sorununu çözer)\nİPTAL: Normal devam et");
             if (useScreenShare) {
               try {
                 const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: { suppressLocalAudioPlayback: false } } as any);
                 callRef.current = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'movie' } });
               } catch (err) {
                 const stream = (videoRef.current as any).captureStream();
                 callRef.current = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'movie' } });
               }
             } else {
               const stream = (videoRef.current as any).captureStream();
               callRef.current = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'movie' } });
             }
           } else {
             const stream = (videoRef.current as any).captureStream();
             callRef.current = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: 'movie' } });
           }
        }
        videoRef.current?.removeEventListener('playing', handlePlaying);
      };
      
      setTimeout(() => {
        videoRef.current?.addEventListener('playing', handlePlaying);
      }, 50);
    }
  };

  const closePlayer = async () => {
    if (!isHostRef.current && partyStatusRef.current === 'connected') {
      broadcastEvent("left_movie");
    }

    if (selectedMovie?.video_path.startsWith("torrent-")) {
      if (torrentClient.current) {
         torrentClient.current.torrents.forEach((t: any) => t.destroy());
      }
    }

    if (selectedMovie && currentTime > 5 && !isRemoteStreaming && !isWeb && !selectedMovie.video_path.startsWith("torrent-")) {
      const timeToSave = Math.floor(currentTime);
      const isCompleted = duration > 0 && (currentTime / duration) > 0.90; 
      const newIsWatched = isCompleted ? 1 : (selectedMovie.is_watched || 0);
      const newWatchCount = isCompleted ? (selectedMovie.watch_count || 0) + 1 : (selectedMovie.watch_count || 0);

      await updateMovieProgress(activeProfile || "default", selectedMovie.video_path, timeToSave, newIsWatched, newWatchCount);
      setMovies(prev => prev.map(m => m.video_path === selectedMovie.video_path ? { ...m, progress: timeToSave, is_watched: newIsWatched, watch_count: newWatchCount, updated_at: new Date().toISOString() } : m));
      
      if (isCompleted && selectedMovie.watchlist) {
        await toggleWatchlist(selectedMovie);
        showToast("Film bitti, listeden çıkarıldı.", "✅");
      }
      
      setSelectedMovie(prev => prev ? { ...prev, progress: timeToSave, is_watched: newIsWatched, watch_count: newWatchCount } : null);
    }
    setLocalSubs([]); setIsPlaying(false); setCurrentTime(0);
    
    if (callRef.current) callRef.current.close();
    if (document.fullscreenElement) document.exitFullscreen();
  };

const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "00:00";
    const totalSeconds = Math.floor(time);
    
    if (runtimeFormat === 'hour') {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return h > 0 
        ? `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
        : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    } else {
      const totalMins = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${totalMins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isRemoteStreaming || !duration || selectedMovie?.video_path.startsWith("torrent-")) return; 
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

const MovieRow = ({ title, data }: { title: string, data: Movie[] }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    if (data.length === 0) return null;

    const showArrows = data.length > 5;
    const loopData = showArrows ? [...data, ...data, ...data] : data;

    useEffect(() => {
      if (rowRef.current && showArrows) {
        rowRef.current.scrollLeft = rowRef.current.scrollWidth / 3;
      }
    }, [showArrows, data.length]);

    const scroll = (direction: "left" | "right") => {
      if (rowRef.current) {
        const { clientWidth } = rowRef.current;
        const scrollAmount = clientWidth * 0.8;
        rowRef.current.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
      }
    };

    const handleScrollEvent = () => {
      if (!rowRef.current || !showArrows) return;
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      const singleSetWidth = scrollWidth / 3;
      
      // Kusursuz "Sonsuz Kaydırma" İllüzyonu
      if (scrollLeft < singleSetWidth * 0.5) {
        rowRef.current.scrollLeft += singleSetWidth;
      } else if (scrollLeft > singleSetWidth * 2.5 - clientWidth) {
        rowRef.current.scrollLeft -= singleSetWidth;
      }
    };

    return (
      <div className="mb-10 relative group">
        <h2 className="mb-4 text-xl font-bold text-white md:text-2xl">{title}</h2>
        {showArrows && <button onClick={() => scroll("left")} className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/80 p-2 text-4xl text-white opacity-0 transition group-hover:opacity-100 md:flex items-center justify-center hover:scale-110 hover:text-red-500 backdrop-blur rounded-r h-full max-h-40">❮</button>}
        <div 
          ref={rowRef} 
          onScroll={handleScrollEvent}
          className="flex gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {loopData.map((movie, idx) => (
            <div 
              key={movie.video_path + idx} 
              tabIndex={0} 
              className="w-40 flex-shrink-0 sm:w-48 xl:w-56 focus:scale-110 focus:-translate-y-2 focus:z-50 focus:ring-4 focus:ring-white outline-none rounded-lg transition-all duration-300" 
              onClick={() => handleMovieClick(movie)}
              onKeyDown={(e) => e.key === 'Enter' && handleMovieClick(movie)}
            >
              <MovieCardFallback movie={movie} />
            </div>
          ))}
        </div>
        {showArrows && <button onClick={() => scroll("right")} className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/80 p-2 text-4xl text-white opacity-0 transition group-hover:opacity-100 md:flex items-center justify-center hover:scale-110 hover:text-red-500 backdrop-blur rounded-l h-full max-h-40">❯</button>}
      </div>
    );
  };

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

      {/* Netflix Stili Kim İzliyor Ekranı */}
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
                      <span>{peerId || "..."}</span>
                      <button onClick={() => {
                        localStorage.removeItem("kinflix_host_code");
                        window.location.reload();
                      }} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg font-bold border border-zinc-700 transition">
                        🔄 Kodu Değiştir
                      </button>
                    </div>
                    
                    <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-400">Yerel IP (Aynı Ev / Wi-Fi İçin):</h3>
                    <div className="bg-black rounded-lg p-2 text-xl font-mono tracking-widest text-blue-400 border border-zinc-800 flex justify-between items-center px-4">
                      <span>{localIp || "Yükleniyor..."}</span>
                      {generateLocalShortCode(localIp) && (
                        <span className="text-sm bg-blue-900/30 text-blue-300 px-3 py-1 rounded border border-blue-800/50 flex flex-col items-center">
                          <span className="text-[10px] uppercase tracking-wider text-blue-500 font-bold mb-0.5">TV Kısa Kodu</span>
                          <span>{generateLocalShortCode(localIp)}</span>
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
            
            {/* KAYDIRILSA BİLE ÜSTTE SABİT KALAN BAŞLIK VE KAPATMA BUTONU */}
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

            {/* YENİ: Altyazı Özelleştirme */}
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
                  muted={isBgMuted} // YENİ: Ses durumu state'e bağlandı
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover opacity-60 animate-in fade-in duration-1000"
                  onLoadedMetadata={(e) => { 
                    e.currentTarget.currentTime = ((selectedMovie.runtime || 120) * 60) * 0.5; 
                  }}
                  onTimeUpdate={(e) => {
                    const startTime = ((selectedMovie.runtime || 120) * 60) * 0.5;
                    // 15 Saniye ilerlediyse başa (ortaya) sar
                    if (e.currentTarget.currentTime >= startTime + 15) {
                      e.currentTarget.currentTime = startTime; 
                    }
                  }}
                />
                
                {/* YENİ: Arkaplan Sesi Aç/Kapat Butonu */}
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
          </div>         <div className="relative z-10 -mt-56 max-w-5xl px-10 pb-20">
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
                <MovieRow title="🎬 Aynı Serideki Filmler" data={sameCollectionMovies} />
              </div>
            )}
            {similarMovies.length > 0 && (
              <div className="mt-16">
                <MovieRow title={t.similar} data={similarMovies} />
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

      {!isTV && isChatOpen && partyStatus === 'connected' && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-950 border-l border-zinc-800 z-[250] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center shadow-md">
            <h3 className="font-bold text-white flex items-center gap-2">💬 Party Chat <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span></h3>
            <button onClick={toggleVoiceChat} className={`flex items-center justify-center w-8 h-8 rounded-full transition ${isMicActive ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
              {isMicActive ? '🎙️' : '🎤'}
            </button>
            <button onClick={() => setIsChatOpen(false)} className="text-zinc-400 hover:text-white transition ml-2">✕</button>
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
              if (isRemoteStreaming && connModeRef.current === 'webrtc') return;

              const cTime = e.currentTarget.currentTime;
              setCurrentTime(cTime);

              if (isHostRef.current && partyStatusRef.current === 'connected') {
                if (Math.floor(cTime) !== lastSyncTimeRef.current) {
                  lastSyncTimeRef.current = Math.floor(cTime);
                  broadcastEvent("sync_time", { time: cTime, duration: e.currentTarget.duration });
                }
              }
            }}
            onLoadedMetadata={(e) => { 
              if (isRemoteStreaming && connModeRef.current === 'webrtc') return;

              setDuration(e.currentTarget.duration); 
              
              if ((selectedMovie.progress || 0) > 0 && !isWeb && !isRemoteStreaming && !selectedMovie.video_path.startsWith("torrent-")) {
                e.currentTarget.currentTime = selectedMovie.progress!;
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

{/* SIFIRDAN YAZILMIŞ OTOMATİK GEÇİŞ SİSTEMİ */}
          {duration > 0 && duration - currentTime <= 15 && !isRemoteStreaming && !isTV && !selectedMovie.video_path.startsWith("torrent-") && (sameCollectionMovies[0] || recommendedMovies[0]) && (
             <div className="absolute bottom-32 right-10 z-[120] bg-black/80 border border-zinc-700 p-4 rounded-xl shadow-2xl backdrop-blur-md animate-in slide-in-from-right w-80">
               <p className="text-zinc-400 text-[10px] font-bold mb-3 uppercase tracking-widest">Sıradaki Film Başlıyor</p>
               <div className="flex gap-4">
                 <div className="w-16 h-24 bg-zinc-800 rounded flex-shrink-0">
                   <img src={(sameCollectionMovies[0] || recommendedMovies[0]).poster_url || ""} className="w-full h-full object-cover rounded"/>
                 </div>
                 <div className="flex flex-col justify-center w-full">
                   <p className="text-white font-bold text-sm line-clamp-2">{(sameCollectionMovies[0] || recommendedMovies[0]).title}</p>
                   
                   {/* Geri Sayım Çubuğu */}
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
                   
                   {/* Süre sıfırlandığında otomatik tetikleyici */}
                   {Math.ceil(duration - currentTime) === 0 && (
                     <img src="" onError={() => closePlayer().then(() => setTimeout(() => startPlayer(sameCollectionMovies[0] || recommendedMovies[0]), 500))} className="hidden" />
                   )}
                 </div>
               </div>
             </div>
          )}

          {currentTime > 10 && currentTime < 120 && !isRemoteStreaming && !isWeb && (
             <button onClick={(e) => { e.stopPropagation(); handleSeek(currentTime + 85); }} className="absolute bottom-32 right-10 z-50 bg-black/60 border border-zinc-500 text-white font-bold px-6 py-3 rounded hover:bg-white hover:text-black transition-all hover:scale-105 shadow-2xl">
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

{/* Oynatıcı Süre Çubuğu (Tıklanabilir Format Geçişi) */}
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
                onClick={(e) => { if(isRemoteStreaming) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left; handleSeek((x / rect.width) * duration); }}
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

{/* YENİ: TV'ye Yansıt Butonu */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if(isWeb) { showToast("Web modunda TV'ye yansıtılamaz.", "❌"); return; }
                    showToast("Yerel ağdaki TV'ler taranıyor...", "📺");
                    // İleride Rust backend'ine eklenecek komut:
                    // invoke("cast_to_tv", { url: `http://${localIpRef.current}:8765/video?path=${selectedMovie.video_path}` });
                  }} 
                  className="text-2xl text-zinc-300 hover:text-white transition group/cast relative mt-1" 
                  title="Cast to TV"
                >
                  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><line x1="2" y1="20" x2="2.01" y2="20"></line>
                  </svg>
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
                    <MovieRow title={t.continue} data={continueWatching} />
                    <MovieRow title={t.watchlist} data={watchListMovies} />
                    <MovieRow title={t.newReleases} data={newReleases} />
                    <MovieRow title={t.topRated} data={topRated} />
                    {homeGenres.map(item => <MovieRow key={item.genre} title={`${item.genre}`} data={item.movies} />)}
                  </div>
                </div>
              )}
              {activeTab === "collections" && (
                <div className="animate-in fade-in duration-500 px-10 pt-4">
                  <h2 className="mb-6 text-2xl font-bold">{t.collections}</h2>
                  {collections.length === 0 ? <div className="text-zinc-500">Herhangi bir koleksiyon bulunamadı.</div> : (
                    <div>
                      {collections.map(item => <MovieRow key={item.name} title={`🎬 ${item.name}`} data={item.movies} />)}
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
    </div>
  );
}

export default App;