import { useEffect, useState } from "react";

export type Achievement = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  isUnlocked: boolean;
  progress?: number; // 0-100
  maxProgress?: number;
};

export function checkAchievements(action: string, data?: any) {
  let statsStr = localStorage.getItem("kinflix_stats");
  let stats = statsStr ? JSON.parse(statsStr) : {
    moviesFinished: 0,
    horrorWatched: 0,
    totalWatchSeconds: 0,
    lateNightWatches: 0,
  };

  let unlockedNow: string[] = [];

  const addUnlock = (id: string) => {
    let unlStr = localStorage.getItem("kinflix_unlocked") || "[]";
    let unl = JSON.parse(unlStr);
    if (!unl.includes(id)) {
      unl.push(id);
      localStorage.setItem("kinflix_unlocked", JSON.stringify(unl));
      unlockedNow.push(id);
      window.dispatchEvent(new CustomEvent('kinflix_achievement', { detail: id }));
    }
  };

  if (action === "movie_finish") {
    stats.moviesFinished += 1;
    if (stats.moviesFinished >= 1) addUnlock("first_blood");
    
    if (data?.genre?.toLowerCase().includes("korku") || data?.genre?.toLowerCase().includes("horror")) {
      stats.horrorWatched += 1;
      if (stats.horrorWatched >= 3) addUnlock("vampire_hunter");
    }

    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 5) {
      stats.lateNightWatches += 1;
      if (stats.lateNightWatches >= 1) addUnlock("night_owl");
    }
  }
  
  if (action === "watch_tick") {
    // data is seconds
    stats.totalWatchSeconds += (data || 0);
    if (stats.totalWatchSeconds >= 100 * 3600) addUnlock("cinephile");
  }

  localStorage.setItem("kinflix_stats", JSON.stringify(stats));
  return unlockedNow;
}

export function getAchievementsList(): Achievement[] {
  let unlStr = localStorage.getItem("kinflix_unlocked") || "[]";
  let unl = JSON.parse(unlStr);
  
  let statsStr = localStorage.getItem("kinflix_stats");
  let stats = statsStr ? JSON.parse(statsStr) : { moviesFinished: 0, horrorWatched: 0, totalWatchSeconds: 0, lateNightWatches: 0 };

  return [
    { id: "first_blood", title: "İlk Kan", desc: "Kinflix'te ilk filmini bitirdin.", icon: "🍿", isUnlocked: unl.includes("first_blood"), progress: stats.moviesFinished, maxProgress: 1 },
    { id: "vampire_hunter", title: "Vampir Avcısı", desc: "3 adet korku filmi bitirdin.", icon: "🦇", isUnlocked: unl.includes("vampire_hunter"), progress: stats.horrorWatched, maxProgress: 3 },
    { id: "night_owl", title: "Gece Kuşu", desc: "Gece 02:00'den sonra bir film bitirdin.", icon: "🦉", isUnlocked: unl.includes("night_owl"), progress: stats.lateNightWatches, maxProgress: 1 },
    { id: "cinephile", title: "Cinephile", desc: "Toplam 100 saat izleme süresine ulaştın.", icon: "💎", isUnlocked: unl.includes("cinephile"), progress: Math.floor(stats.totalWatchSeconds / 3600), maxProgress: 100 },
  ];
}

export default function AchievementsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [list, setList] = useState<Achievement[]>([]);

  useEffect(() => {
    if (isOpen) setList(getAchievementsList());
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 animate-in fade-in">
      <div className="w-full max-w-2xl bg-zinc-900 border border-yellow-600/30 rounded-2xl shadow-[0_0_50px_rgba(202,138,4,0.15)] flex flex-col overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition z-10">✖</button>
        
        <div className="bg-gradient-to-r from-yellow-900/20 to-zinc-900 p-8 border-b border-zinc-800">
           <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 flex items-center gap-3">
             <span className="text-4xl text-yellow-500">🏆</span> Kupa Koleksiyonu
           </h2>
           <p className="text-zinc-400 text-sm mt-2 font-medium">Kilidi açılan başarımlar profilinde parlar!</p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
          {list.map(ach => (
            <div key={ach.id} className={`p-4 rounded-xl border transition-all duration-300 ${ach.isUnlocked ? 'bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.1)]' : 'bg-zinc-900 border-zinc-800 opacity-60 grayscale'}`}>
              <div className="flex gap-4 items-center">
                 <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 ${ach.isUnlocked ? 'bg-yellow-900/50 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'bg-zinc-800 border-zinc-700'}`}>
                   {ach.isUnlocked ? ach.icon : '🔒'}
                 </div>
                 <div className="flex-1">
                    <h3 className={`font-bold ${ach.isUnlocked ? 'text-yellow-400' : 'text-zinc-400'}`}>{ach.title}</h3>
                    <p className="text-xs text-zinc-500 mt-1">{ach.desc}</p>
                 </div>
              </div>
              
              {!ach.isUnlocked && ach.maxProgress && (
                <div className="mt-4 bg-zinc-800 rounded-full h-1.5 w-full overflow-hidden">
                  <div className="bg-zinc-600 h-full" style={{ width: `${Math.min(100, ((ach.progress || 0) / ach.maxProgress) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

