import { useState, RefObject } from 'react';

export default function ClipperModal({ 
  isOpen, 
  onClose, 
  videoRef 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!isOpen) return null;

  const handleRecord = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    setIsRecording(true);
    setProgress(0);

    // Geri sar (son 5 saniyeyi alacağız)
    const startTime = Math.max(0, video.currentTime - 5);
    video.currentTime = startTime;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas'tan akış al
    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: BlobPart[] = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kinflix_meme_${Date.now()}.webm`;
      a.click();
      setIsRecording(false);
      onClose();
    };

    video.play();
    mediaRecorder.start();

    let animationId: number;
    const draw = () => {
      if (video.currentTime >= startTime + 5 || video.paused || video.ended) {
        mediaRecorder.stop();
        video.pause();
        cancelAnimationFrame(animationId);
        return;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Yazıyı Ekle (Meme stili)
      if (text.trim() !== "") {
        ctx.font = "bold 60px Impact, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        
        const x = canvas.width / 2;
        const y = canvas.height - 50;
        
        ctx.strokeText(text.toUpperCase(), x, y);
        ctx.fillText(text.toUpperCase(), x, y);
      }
      
      setProgress(((video.currentTime - startTime) / 5) * 100);
      animationId = requestAnimationFrame(draw);
    };

    draw();
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 animate-in fade-in">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 relative">
        <button onClick={onClose} disabled={isRecording} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition">✖</button>
        
        <h2 className="text-2xl font-black text-white flex items-center gap-2 mb-4">
          <span>✂️</span> Kinflix Clipper
        </h2>
        <p className="text-zinc-400 text-sm mb-6">Videodaki son 5 saniyeyi alıp Meme (Klip) olarak kaydeder.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Videonun Üzerine Yazılacak Yazı (Opsiyonel)</label>
            <input 
              type="text" 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Örn: Ben olur gibi..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition"
              disabled={isRecording}
            />
          </div>

          <button 
            onClick={handleRecord}
            disabled={isRecording}
            className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition overflow-hidden relative"
            style={{
              backgroundColor: isRecording ? '#18181b' : '#dc2626',
              color: isRecording ? '#a1a1aa' : 'white',
              border: isRecording ? '1px solid #3f3f46' : 'none'
            }}
          >
            {isRecording ? (
              <>
                <div className="absolute left-0 top-0 bottom-0 bg-red-600/30 transition-all duration-100" style={{ width: `${progress}%` }}></div>
                <span className="relative z-10 flex items-center gap-2"><div className="w-4 h-4 border-2 border-zinc-500 border-t-red-500 rounded-full animate-spin"></div> Kaydediliyor... (%{Math.floor(progress)})</span>
              </>
            ) : (
              <>🎬 Son 5 Saniyeyi Kaydet (.webm)</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

