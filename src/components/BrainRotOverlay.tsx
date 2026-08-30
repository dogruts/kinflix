import { useState, useEffect } from 'react';

interface Props {
  isActive: boolean;
}

const BRAIN_ROT_VIDEOS = [
  "n_O2l24DlyU", // Subway Surfers
  "aKwbk3j6T3Q", // Minecraft Parkour
  "t705_V-RDcQ"  // GTA V
];

export default function BrainRotOverlay({ isActive }: Props) {
  const [videoId, setVideoId] = useState(BRAIN_ROT_VIDEOS[0]);

  useEffect(() => {
    if (isActive) {
      setVideoId(BRAIN_ROT_VIDEOS[Math.floor(Math.random() * BRAIN_ROT_VIDEOS.length)]);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="fixed bottom-32 right-10 z-[200000] w-48 h-80 bg-black border-2 border-zinc-800 rounded-xl overflow-hidden shadow-2xl pointer-events-none animate-in slide-in-from-right duration-500">
      <iframe
        className="w-full h-full scale-[1.5]"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1`}
        frameBorder="0"
        allow="autoplay; encrypted-media"
      />
    </div>
  );
}

