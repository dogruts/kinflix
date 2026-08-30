import { useEffect, useRef, MutableRefObject } from 'react';

interface Props {
  isActive: boolean;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  showToast?: (msg: string) => void;
}

export function useVoiceControl({ isActive, videoRef, showToast }: Props) {
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isActive) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (showToast) showToast("Tarayıcınız sesli komutları desteklemiyor.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.toLowerCase().trim();
      
      if (!videoRef.current) return;

      const v = videoRef.current;

      if (command.includes('durdur') || command.includes('bekle')) {
        v.pause();
        if (showToast) showToast("🎤 Kinflix: Duraklatıldı");
      } 
      else if (command.includes('başlat') || command.includes('oynat') || command.includes('devam')) {
        v.play().catch(()=>{});
        if (showToast) showToast("🎤 Kinflix: Oynatılıyor");
      }
      else if (command.includes('ileri') || command.includes('geç')) {
        v.currentTime = Math.min(v.duration, v.currentTime + 15);
        if (showToast) showToast("🎤 Kinflix: 15sn ileri sarıldı");
      }
      else if (command.includes('geri')) {
        v.currentTime = Math.max(0, v.currentTime - 15);
        if (showToast) showToast("🎤 Kinflix: 15sn geri sarıldı");
      }
      else if (command.includes('sesi kıs') || command.includes('kıs')) {
        v.volume = Math.max(0, v.volume - 0.2);
        if (showToast) showToast("🎤 Kinflix: Ses kısıldı");
      }
      else if (command.includes('sesi aç') || command.includes('yükselt')) {
        v.volume = Math.min(1, v.volume + 0.2);
        if (showToast) showToast("🎤 Kinflix: Ses yükseltildi");
      }
    };

    recognition.onend = () => {
      // Keep it listening continuously
      if (isActive && recognitionRef.current) {
        try { recognition.start(); } catch(e) {}
      }
    };

    recognition.onerror = (e: any) => {
      console.warn("Speech recognition error:", e.error);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      if (showToast) showToast("🎤 Sesli asistan dinliyor...");
    } catch (e) {}

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [isActive, videoRef, showToast]);
}

