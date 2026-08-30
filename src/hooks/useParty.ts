import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";
import { isTV, isWeb } from "../utils/platform";
import { generateRoomCode, parseSrtToCues } from "../utils/helpers";
import type { Movie } from "../database";
import type { ChatMessage, SubtitleTrack } from "../types/app";

type PartyStatus = "disconnected" | "connecting" | "connected";
type ConnMode = "none" | "webrtc" | "ip";

export interface UsePartyParams {
  // refs (owned by App.tsx, shared with usePlayer where noted)
  peerRef: MutableRefObject<Peer | null>;
  connRef: MutableRefObject<DataConnection | null>;
  wsRef: MutableRefObject<WebSocket | null>;
  voiceCallRef: MutableRefObject<MediaConnection | null>;
  networkHandlerRef: MutableRefObject<Function | null>;
  localMicStreamRef: MutableRefObject<MediaStream | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  transcodeOffsetRef: MutableRefObject<number>;
  moviesRef: MutableRefObject<Movie[]>;
  selectedMovieRef: MutableRefObject<Movie | null>;
  localSubsRef: MutableRefObject<SubtitleTrack[]>;
  activeSubIndexRef: MutableRefObject<number>;
  isChatOpenRef: MutableRefObject<boolean>;
  isHostRef: MutableRefObject<boolean>;
  partyStatusRef: MutableRefObject<PartyStatus>;
  connModeRef: MutableRefObject<ConnMode>;
  targetAddressRef: MutableRefObject<string>;
  localIpRef: MutableRefObject<string>;
  startPlayerRef: MutableRefObject<(movieOverride?: Movie) => void>;

  // state values read by party logic
  localIp: string;
  guestName: string;
  profiles: { id: string, name: string, color: string, avatar: string }[];
  activeProfile: string;
  isHost: boolean;
  isMicActive: boolean;
  chatInput: string;

  // setters
  setMovies: Dispatch<SetStateAction<Movie[]>>;
  setHostName: Dispatch<SetStateAction<string>>;
  setSelectedMovie: Dispatch<SetStateAction<Movie | null>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setIsVideoPlaying: Dispatch<SetStateAction<boolean>>;
  setIsRemoteStreaming: Dispatch<SetStateAction<boolean>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setLocalSubs: Dispatch<SetStateAction<SubtitleTrack[]>>;
  setActiveSubIndex: Dispatch<SetStateAction<number>>;
  setPlaybackSpeed: Dispatch<SetStateAction<number>>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setIsHost: Dispatch<SetStateAction<boolean>>;
  setPartyStatus: Dispatch<SetStateAction<PartyStatus>>;
  setConnMode: Dispatch<SetStateAction<ConnMode>>;
  setTargetAddress: Dispatch<SetStateAction<string>>;
  setPeerId: Dispatch<SetStateAction<string>>;
  setConnectedGuests: Dispatch<SetStateAction<{ id: string, name: string }[]>>;
  setIsPartyMenuOpen: Dispatch<SetStateAction<boolean>>;
  setShowNameModal: Dispatch<SetStateAction<boolean>>;
  setIsMicActive: Dispatch<SetStateAction<boolean>>;
  _setRemoteStream: Dispatch<SetStateAction<MediaStream | null>>;

  showToast: (text: string, icon?: string) => void;
  onRemoteTheaterChange: (open: boolean) => void;
}

export function useParty(p: UsePartyParams) {
  const {
    peerRef, connRef, wsRef, voiceCallRef, networkHandlerRef, localMicStreamRef, remoteAudioRef,
    videoRef, transcodeOffsetRef, moviesRef, selectedMovieRef, localSubsRef, activeSubIndexRef,
    isChatOpenRef, isHostRef, partyStatusRef, connModeRef, targetAddressRef, localIpRef, startPlayerRef,
    localIp, guestName, profiles, activeProfile, isHost, isMicActive, chatInput,
    setMovies, setHostName, setSelectedMovie, setIsPlaying, setIsVideoPlaying, setIsRemoteStreaming,
    setCurrentTime, setDuration, setLocalSubs, setActiveSubIndex, setPlaybackSpeed,
    setChatMessages, setUnreadCount, setChatInput, setIsHost, setPartyStatus, setConnMode,
    setTargetAddress, setPeerId, setConnectedGuests, setIsPartyMenuOpen, setShowNameModal,
    setIsMicActive, _setRemoteStream, showToast, onRemoteTheaterChange,
  } = p;

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
      if (!isWeb) connectWebSocket("127.0.0.1");
    }, 500);
  };

  const broadcastEvent = (action: string, payload: any = {}) => {
    if (connRef.current?.open) { connRef.current.send({ action, ...payload }); }
    if (wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ action, ...payload })); }
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
    const activeName = profiles.find(p => p.id === activeProfile)?.name;
    const authorName = guestName || (isHost ? activeName || "Host" : "Misafir");
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
      const activeName = profiles.find(p => p.id === activeProfile)?.name;
      const authorName = guestName || (isHost ? activeName || "Host" : "Misafir");
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
        if (data.guestName) {
           setConnectedGuests(prev => {
              if (!prev.find(g => g.name === data.guestName)) return [...prev, {id: Date.now().toString(), name: data.guestName}];
              return prev;
           });
           showToast(`${data.guestName} odaya bağlandı!`, "👋");
        } else {
           showToast("Bir misafir odaya bağlandı!", "👋");
        }

        const activeProfileName = profiles.find(p => p.id === activeProfile)?.name || "Host";
        broadcastEvent("catalog", { catalog: moviesRef.current, hostName: activeProfileName });

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
        if (data.hostName) setHostName(data.hostName);
      }
      else if (data.action === "request_movie" && hostMode) {
        startPlayerRef.current(data.movie);
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
        // HOST'UN SÜRESİNİ ZORLA KABUL ET (Böylece bar asla taşmaz!)
        setCurrentTime(data.time);
        if (data.duration && !isNaN(data.duration) && isFinite(data.duration)) {
          setDuration(data.duration);
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
      else if (data.action === "enter_theater") { onRemoteTheaterChange(true); }
      else if (data.action === "exit_theater") { onRemoteTheaterChange(false); }

      // DÜZELTME 1: Misafir de oynatma hızını değiştirebilsin diye !hostMode kısıtlaması kalktı
      else if (data.action === "rate_change") {
        if (videoRef.current) videoRef.current.playbackRate = data.rate;
        setPlaybackSpeed(data.rate);
      }

      // DÜZELTME 2: Misafirlerin play/pause/seek komutları için !hostMode kısıtlaması KALDIRILDI!
      else if (videoRef.current && (data.action === "play" || data.action === "pause" || data.action === "seek")) {
        if (data.action === "play") {
          videoRef.current.play().catch(()=>{});
          setIsVideoPlaying(true);
        }
        else if (data.action === "pause") {
          videoRef.current.pause();
          setIsVideoPlaying(false);
        }
        else if (data.action === "seek") {
           setCurrentTime(data.time);
           const isHevc = /265|hevc/i.test(selectedMovieRef.current?.video_path || "");

           const isTranscodingForHost = isHostRef.current && connModeRef.current === 'webrtc' && isHevc;
           const isTranscodingForGuest = !isHostRef.current && connModeRef.current === 'ip' && isHevc;

           if (isTranscodingForHost || isTranscodingForGuest) {
             const baseUrl = targetAddressRef.current.startsWith("http") ? targetAddressRef.current : `http://${targetAddressRef.current}:8765`;
             const targetUrl = isTranscodingForHost ? "http://127.0.0.1:8765" : baseUrl;

             transcodeOffsetRef.current = data.time;
             videoRef.current.src = `${targetUrl}/transcode?path=${encodeURIComponent(selectedMovieRef.current!.video_path)}&start=${Math.floor(data.time)}`;
             videoRef.current.play().catch(()=>{});
           } else {
             videoRef.current.currentTime = data.time;
           }
        }
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
            connRef.current.send({ action: "request_catalog", guestName: guestName || localStorage.getItem("kinflix_guest_name") || "Misafir" });
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
          wsRef.current.send(JSON.stringify({ action: "request_catalog", guestName: guestName || localStorage.getItem("kinflix_guest_name") || "Misafir" }));
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
      if (call.metadata?.type === "movie") {
        call.answer();
        call.on("stream", (videoStream) => {
          _setRemoteStream(videoStream);
          setIsRemoteStreaming(true);
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

  return {
    disconnectParty, connectParty, connectPeerJS, connectWebSocket, initPeerHost,
    broadcastEvent, saveChatMessage, handleSendChatText, handleSendChatImage, sendReaction, toggleVoiceChat,
  };
}
