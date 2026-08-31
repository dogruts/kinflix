import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
// @ts-ignore
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import { isWeb } from "../utils/platform";
import { parseSrtToCues } from "../utils/helpers";
import { updateMovieProgress, type Movie } from "../database";
import type { SubtitleTrack } from "../types/app";

type PartyStatus = "disconnected" | "connecting" | "connected";
type ConnMode = "none" | "webrtc" | "ip";

export interface UsePlayerParams {
  // refs
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  playerContainerRef: MutableRefObject<HTMLDivElement | null>;
  previewVideoRef: MutableRefObject<HTMLVideoElement | null>;
  transcodeOffsetRef: MutableRefObject<number>;
  audioCtxRef: MutableRefObject<any>;
  sourceNodeRef: MutableRefObject<any>;
  compressorRef: MutableRefObject<any>;
  torrentClient: MutableRefObject<any>;
  hideControlsTimeout: MutableRefObject<number | null>;
  callRef: MutableRefObject<MediaConnection | null>;
  peerRef: MutableRefObject<Peer | null>;
  connRef: MutableRefObject<DataConnection | null>;
  isHostRef: MutableRefObject<boolean>;
  partyStatusRef: MutableRefObject<PartyStatus>;
  connModeRef: MutableRefObject<ConnMode>;
  targetAddressRef: MutableRefObject<string>;

  // state values
  isPlaying: boolean;
  isVideoPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  showSpeedMenu: boolean;
  hoverTime: number | null;
  showSubMenu: boolean;
  activeSubIndex: number;
  localSubs: SubtitleTrack[];
  isVoiceBoosted: boolean;
  isConverting: boolean;
  isGeneratingSub: boolean;
  selectedMovie: Movie | null;
  isRemoteStreaming: boolean;
  runtimeFormat: "min" | "hour";
  isChatOpen: boolean;
  activeProfile: string;
  tauriConvertFileSrc: any;

  // setters
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setIsVideoPlaying: Dispatch<SetStateAction<boolean>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setVolume: Dispatch<SetStateAction<number>>;
  setIsMuted: Dispatch<SetStateAction<boolean>>;
  setPlaybackSpeed: Dispatch<SetStateAction<number>>;
  setShowSpeedMenu: Dispatch<SetStateAction<boolean>>;
  setHoverTime: Dispatch<SetStateAction<number | null>>;
  setHoverX: Dispatch<SetStateAction<number>>;
  setShowControls: Dispatch<SetStateAction<boolean>>;
  setActiveSubIndex: Dispatch<SetStateAction<number>>;
  setShowSubMenu: Dispatch<SetStateAction<boolean>>;
  setLocalSubs: Dispatch<SetStateAction<SubtitleTrack[]>>;
  setOsResults: Dispatch<SetStateAction<any[]>>;
  setIsSearchingOS: Dispatch<SetStateAction<boolean>>;
  setDownloadingId: Dispatch<SetStateAction<string | null>>;
  setOsError: Dispatch<SetStateAction<string | null>>;
  setIsVoiceBoosted: Dispatch<SetStateAction<boolean>>;
  setConvertingMoviePath: Dispatch<SetStateAction<string | null>>;
  setConvertProgress: Dispatch<SetStateAction<number>>;
  setIsConverting: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingSub: Dispatch<SetStateAction<boolean>>;
  setSelectedMovie: Dispatch<SetStateAction<Movie | null>>;
  setIsRemoteStreaming: Dispatch<SetStateAction<boolean>>;
  setMovies: Dispatch<SetStateAction<Movie[]>>;

  toggleWatchlist: (movie: Movie) => Promise<void>;
  broadcastEvent: (action: string, payload?: any) => void;
  showToast: (text: string, icon?: string) => void;
  t: Record<string, string>;
}

export function usePlayer(p: UsePlayerParams) {
  const {
    videoRef, playerContainerRef, previewVideoRef, transcodeOffsetRef, audioCtxRef, sourceNodeRef,
    compressorRef, torrentClient, hideControlsTimeout, callRef, peerRef, connRef,
    isHostRef, partyStatusRef, connModeRef, targetAddressRef,
    isPlaying, isVideoPlaying, currentTime, duration, volume, isMuted, showSpeedMenu,
    hoverTime, showSubMenu, localSubs, isVoiceBoosted,
    selectedMovie, isRemoteStreaming, runtimeFormat, isChatOpen, activeProfile, tauriConvertFileSrc,
    setIsPlaying, setIsVideoPlaying, setCurrentTime, setVolume, setIsMuted, setPlaybackSpeed,
    setShowSpeedMenu, setHoverTime, setHoverX, setShowControls, setActiveSubIndex, setShowSubMenu,
    setLocalSubs, setOsResults, setIsSearchingOS, setDownloadingId, setOsError, setIsVoiceBoosted,
    setConvertingMoviePath, setConvertProgress, setIsConverting, setIsGeneratingSub, setSelectedMovie,
    setIsRemoteStreaming, setMovies,
    toggleWatchlist, broadcastEvent, showToast, t,
  } = p;

  const togglePlay = (e?: any) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;

    const cTime = videoRef.current.currentTime + transcodeOffsetRef.current;

    if (videoRef.current.paused) {
      videoRef.current.play().catch(()=>{});
      setIsVideoPlaying(true);
      broadcastEvent("play", { time: cTime }); // Herkese başlat emri
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
      broadcastEvent("pause", { time: cTime }); // Herkese durdur emri
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && playerContainerRef.current) { playerContainerRef.current.requestFullscreen(); }
    else if (document.fullscreenElement) { document.exitFullscreen(); }
  };

  const handleSeek = (timeVal: number) => {
    if(isRemoteStreaming) return;
    if (videoRef.current) videoRef.current.currentTime = timeVal;
    setCurrentTime(timeVal);
    broadcastEvent("seek", { time: timeVal });
  };

  const toggleMute = () => {
    if(videoRef.current) { videoRef.current.muted = !isMuted; setIsMuted(!isMuted); }
  };

  const toggleVoiceBoost = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;

    try {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContext();
        sourceNodeRef.current = audioCtxRef.current.createMediaElementSource(videoRef.current);
        compressorRef.current = audioCtxRef.current.createDynamicsCompressor();

        compressorRef.current.threshold.value = -30;
        compressorRef.current.knee.value = 10;
        compressorRef.current.ratio.value = 12;
        compressorRef.current.attack.value = 0.003;
        compressorRef.current.release.value = 0.25;
      }

      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      if (!isVoiceBoosted) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current.connect(compressorRef.current);
        compressorRef.current.connect(audioCtxRef.current.destination);
        setIsVoiceBoosted(true);
        showToast(t.voiceBoostOnToast, "🚀");
      } else {
        sourceNodeRef.current.disconnect();
        compressorRef.current.disconnect();
        sourceNodeRef.current.connect(audioCtxRef.current.destination);
        setIsVoiceBoosted(false);
        showToast(t.voiceBoostOffToast, "🔇");
      }
    } catch (error) {
      console.error("Web Audio API Hatası:", error);
      showToast(t.voiceBoostUnsupported, "❌");
    }
  };

  const handleGenerateAISubtitle = async () => {
    if (!selectedMovie) return;
    setIsGeneratingSub(true);
    showToast(t.aiListeningToast, "🤖");

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const srtPath = await invoke('generate_ai_subtitle', { video_path: selectedMovie.video_path });

      showToast(t.aiSubtitleSuccessToast, "✅");

      const srtText = await invoke<string>('read_text_file', { path: srtPath });

      const newSub = {
         id: "ai_sub_" + Date.now().toString(),
         url: srtPath as string,
         label: `🤖 ${t.aiGeneratedLabel}`,
         lang: t.aiGeneratedLabel,
         path: srtPath as string,
         srtContent: srtText,
         offset: 0,
         cues: parseSrtToCues(srtText, 0)
      };

      setLocalSubs(prev => [...prev, newSub as any]);
      setActiveSubIndex(localSubs.length);

    } catch (err: any) {
      if (typeof err === "string" && err.includes("Whisper yapay zeka modeli bulunamadı")) {
        alert(err);
      } else {
        showToast(t.genericErrorPrefix + err, "❌");
      }
    } finally {
      setIsGeneratingSub(false);
    }
  };

  useEffect(() => {
    if (isWeb) return;

    let unlisten: any;
    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('convert-progress', (event: any) => {
          setConvertingMoviePath(event.payload.path);
          setConvertProgress(event.payload.progress);

          if (event.payload.progress >= 100) {
            setConvertingMoviePath(null);
            showToast(t.convertCompleteToast, "✅");
          }
        });
      } catch (e) {
        console.error("Event listener kurulamadı", e);
      }
    };

    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'b':
          e.preventDefault();
          toggleVoiceBoost();
          break;
        case 'arrowright':
          e.preventDefault();
          if (videoRef.current) handleSeek(videoRef.current.currentTime + 10);
          break;
        case 'arrowleft':
          e.preventDefault();
          if (videoRef.current) handleSeek(videoRef.current.currentTime - 10);
          break;
        case 'arrowup': {
          e.preventDefault();
          const newVolUp = Math.min(volume + 0.1, 1);
          setVolume(newVolUp);
          if (videoRef.current) videoRef.current.volume = newVolUp;
          break;
        }
        case 'arrowdown': {
          e.preventDefault();
          const newVolDown = Math.max(volume - 0.1, 0);
          setVolume(newVolDown);
          if (videoRef.current) videoRef.current.volume = newVolDown;
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, isVoiceBoosted]);

  useEffect(() => {
    torrentClient.current = new WebTorrent();
    return () => {
      if (torrentClient.current) torrentClient.current.destroy();
    };
  }, []);

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

  const convertToX264 = async () => {
    if (!selectedMovie || isWeb) return;
    setIsConverting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      alert(t.convertStartAlert);
      const newPath = await invoke<string>("convert_to_x264", { videoPath: selectedMovie.video_path });
      alert(`${t.convertDonePrefix}${newPath}${t.convertDoneSuffix}`);
    } catch (err) {
      alert(t.convertErrorAlert + err);
    } finally {
      setIsConverting(false);
    }
  };

  const changeSubtitle = (idx: number) => {
    setActiveSubIndex(idx);
    setShowSubMenu(false);
    if (selectedMovie) localStorage.setItem("kinflix_sub_" + selectedMovie.video_path, idx.toString());
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

  const searchStremioSubtitles = async (targetLang: string, queryOverride?: string) => {
    if (!selectedMovie) return;
    setIsSearchingOS(true);
    setOsError(null);
    try {
      let cleanQuery = queryOverride || selectedMovie.title.replace(/\b(1080p|720p|480p|2160p|4k|bluray|x264|x265|hevc|dual|remux|webrip|hdrip|hdtv|yify|yts)\b.*/i, '').replace(/(\[.*?\]|\(.*?\))/g, '').replace(/[-_.]/g, ' ').trim();
      const metaUrl = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(cleanQuery)}.json`;
      const metaRes = await fetch(metaUrl);
      if(!metaRes.ok) throw new Error("Cinemeta çöktü");
      const metaData = await metaRes.json();

      let imdbId = null;
      if (metaData.metas && metaData.metas.length > 0) {
        const match = selectedMovie.year ? metaData.metas.find((m:any) => m.year == selectedMovie.year) || metaData.metas[0] : metaData.metas[0];
        imdbId = match.imdb_id || match.id;
      }
      if (!imdbId) { setOsError(t.movieNotFoundOnCinemeta); setIsSearchingOS(false); return; }

      const subRes = await fetch(`https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`);
      if(!subRes.ok) throw new Error("Addon çöktü");
      const subData = await subRes.json();

      if (subData.subtitles && subData.subtitles.length > 0) {
        // hedef dile göre filtrele, yoksa hepsini getir
        const filtered = targetLang === 'all' ? subData.subtitles : subData.subtitles.filter((s:any) => s.lang === targetLang || s.id.includes(targetLang));
        if(filtered.length === 0) { setOsError(t.subNotFound); setOsResults([]); }
        else { setOsResults(filtered.slice(0, 15)); }
      } else { setOsError(t.subNotFound); }
    } catch (err: any) { setOsError(t.connError); }
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
          showToast(t.subtitleSavedToast, "💾");
        } catch(e) { console.error("Kayıt hatası", e); }
      }

      setLocalSubs(prev => {
        const newSubs = [...prev, { id: `stremio_${sub.id}`, url: "", label: `🌐 ${sub.lang.toUpperCase()} - Stremio`, srtContent: content, offset: 0, cues }];
        setActiveSubIndex(newSubs.length - 1);
        if (selectedMovie) localStorage.setItem("kinflix_sub_" + selectedMovie.video_path, (newSubs.length - 1).toString());
        if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs: newSubs, activeIndex: newSubs.length - 1 }); }
        return newSubs;
      });
      setOsResults([]);
    } catch (err) { setOsError(t.subtitleDownloadFailed); } finally { setDownloadingId(null); }
  };

  const streamYtsMovie = (ytsMovie: any) => {
    if (!ytsMovie.torrents || ytsMovie.torrents.length === 0) {
      showToast(t.noSourceForTorrent, "❌");
      return;
    }

    const bestTorrent = ytsMovie.torrents.find((tor: any) => tor.quality === "1080p") || ytsMovie.torrents[0];
    const magnetURI = `magnet:?xt=urn:btih:${bestTorrent.hash}&dn=${encodeURIComponent(ytsMovie.title)}&tr=udp://open.demonii.com:1337/announce&tr=udp://tracker.openbittorrent.com:80`;

    showToast(t.connectingToPeers, "🏴‍☠️");

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
        showToast(t.connectionEstablishedToast, "⚡");
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

    if (!isHostRef.current && partyStatusRef.current === 'connected' && connModeRef.current === 'webrtc') {
      showToast(t.webrtcOnlyHostAlert, "⚠️");
      return;
    }

    setIsRemoteStreaming(!isHostRef.current && partyStatusRef.current === 'connected');

    if (isHostRef.current && partyStatusRef.current === 'connected') {
      broadcastEvent("load", { movie: movieToPlay });
    }

    if (!isWeb && !movieToPlay.video_path.startsWith("torrent-") && isHostRef.current) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const srtFiles = await invoke<string[]>("get_local_subtitles", { video_path: movieToPlay.video_path });
        const subs: SubtitleTrack[] = [];
        for (let i = 0; i < srtFiles.length; i++) {
          const path = srtFiles[i];
          const content = await invoke<string>("read_text_file", { path });
          const fileName = path.split(/[/\\]/).pop() || `${t.localSubtitleLabel} ${i + 1}`;
          const label = `📂 ${fileName.replace(/\.srt$/i, '')}`;
          subs.push({ id: `local_${i}`, url: "", label, srtContent: content, offset: 0, cues: parseSrtToCues(content, 0) });
        }
        setLocalSubs(subs);

        const savedIdxStr = localStorage.getItem("kinflix_sub_" + movieToPlay.video_path);
        const activeIdx = savedIdxStr && !isNaN(parseInt(savedIdxStr)) ? Math.min(parseInt(savedIdxStr), subs.length - 1) : (subs.length > 0 ? 0 : -1);
        setActiveSubIndex(activeIdx);

        if (partyStatusRef.current === 'connected') { broadcastEvent("sync_subs", { subs, activeIndex: activeIdx }); }
      } catch (error) {}
    }

    setOsResults([]); setOsError(null); setSelectedMovie(movieToPlay); setIsPlaying(true); setIsVideoPlaying(true); setPlaybackSpeed(1);

    if (connModeRef.current === 'webrtc' && isHostRef.current && partyStatusRef.current === 'connected' && !movieToPlay.video_path.startsWith("torrent-") && !movieToPlay.video_path.startsWith("yt-")) {
      const handlePlaying = async () => {
        if (connRef.current && videoRef.current && peerRef.current) {
           if (callRef.current) { callRef.current.close(); }

           const isHevcFile = /265|hevc/i.test(movieToPlay.video_path);
           if (isHevcFile) {
             const useScreenShare = window.confirm(t.hevcConfirmDialog);
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
         torrentClient.current.torrents.forEach((tor: any) => tor.destroy());
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
        showToast(t.watchlistRemovedToast, "✅");
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

  const handleSeekPlayer = (timeVal: number) => {
    // DÜZELTME 1: "if(isRemoteStreaming) return;" kısıtlaması SİLİNDİ! Artık misafir de barı sürükleyebilir.

    const isHevc = /265|hevc/i.test(selectedMovie?.video_path || "");
    const isTranscodingForHost = isHostRef.current && connModeRef.current === 'webrtc' && isHevc;
    const isTranscodingForGuest = !isHostRef.current && connModeRef.current === 'ip' && isHevc;

    if (isTranscodingForHost || isTranscodingForGuest) {
      transcodeOffsetRef.current = timeVal;
      if (videoRef.current) {
         const baseUrl = targetAddressRef.current.startsWith("http") ? targetAddressRef.current : `http://${targetAddressRef.current}:8765`;
         const targetUrl = isTranscodingForHost ? "http://127.0.0.1:8765" : baseUrl;
         videoRef.current.src = `${targetUrl}/transcode?path=${encodeURIComponent(selectedMovie!.video_path)}&start=${Math.floor(timeVal)}`;
         videoRef.current.play().catch(()=>{});
      }
    } else {
      if (videoRef.current) videoRef.current.currentTime = timeVal;
    }

    setCurrentTime(timeVal);
    // Yaptığımız sarma işlemini anında odadaki herkese (Host dahil) gönderiyoruz
    broadcastEvent("seek", { time: timeVal });
  };

  const handleVolumeChangePlayer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if(val > 0) setIsMuted(false);
    if(videoRef.current) videoRef.current.volume = val;
  };

  const changePlaybackSpeed = (rate: number) => {
    setPlaybackSpeed(rate); setShowSpeedMenu(false);
    if(videoRef.current) videoRef.current.playbackRate = rate;
    if (isHostRef.current && partyStatusRef.current === 'connected') { broadcastEvent("rate_change", { rate }); }
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

  const getSafeVideoSource = () => {
    if (!selectedMovie || selectedMovie.video_path.startsWith("torrent-") || selectedMovie.video_path.startsWith("yt-")) return "";
    const isHevc = /265|hevc/i.test(selectedMovie.video_path);

    // MİSAFİR - HTTP MODU
    if (isRemoteStreaming && connModeRef.current === 'ip') {
      const baseUrl = targetAddressRef.current.startsWith("http") ? targetAddressRef.current : `http://${targetAddressRef.current}:8765`;
      return isHevc
        ? `${baseUrl}/transcode?path=${encodeURIComponent(selectedMovie.video_path)}`
        : `${baseUrl}/video?path=${encodeURIComponent(selectedMovie.video_path)}&quality=720p`;
    }

    // MİSAFİR - WEBRTC MODU (Video PeerJS'den gelir, src boştur)
    if (isRemoteStreaming && connModeRef.current === 'webrtc') return "";
    if (isWeb) return "";

    // HOST - P2P/WEBRTC MODU (HAYAT KURTARAN DOKUNUŞ BURADA)
    if (partyStatusRef.current === 'connected' && connModeRef.current === 'webrtc') {
      if (isHevc) {
        // Eğer film HEVC ise, Host kendi yerel sunucusundan transcode edilmiş (x264) halini izler.
        // Böylece tarayıcı bu x264 görüntüyü captureStream() ile misafire sorunsuzca, siyah ekran olmadan gönderir!
        return `http://127.0.0.1:8765/transcode?path=${encodeURIComponent(selectedMovie.video_path)}`;
      }
      return `http://127.0.0.1:8765/video?path=${encodeURIComponent(selectedMovie.video_path)}`;
    }

    // HOST - NORMAL İZLEME (Oda yoksa)
    return tauriConvertFileSrc ? tauriConvertFileSrc(selectedMovie.video_path) : "";
  };

  return {
    togglePlay, toggleFullscreen, handleSeek, toggleMute, toggleVoiceBoost, handleGenerateAISubtitle,
    convertToX264, changeSubtitle, updateSubDelay, searchStremioSubtitles, downloadStremioSubtitle,
    streamYtsMovie, startPlayer, closePlayer, formatTime, handleProgressMouseMove, handleSeekPlayer,
    handleVolumeChangePlayer, changePlaybackSpeed, togglePip, handleMouseMove, getSafeVideoSource,
  };
}
