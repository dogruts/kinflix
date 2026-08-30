import { useState, useEffect, useRef } from 'react';

type Reaction = {
  id: number;
  text: string;
  username: string;
  top: number; // Y ekseni yüzdesi (0-100)
  duration: number; // Ekranda kalma süresi (hız)
};

const SHOCK_COMMENTS = [
  "Oha rüya mıydı?!", "Yok artık!!", "Hasss...", "Bunu beklemiyordum!",
  "Nasıl yani???", "Beynim yandı şu an", "WTF WTF WTF", "Senariste helal olsun",
  "Tüylerim diken diken oldu...", "Ağlıyorum şu an 😭", "İnanılmaz bir ters köşe",
  "Sinema tarihi böyle bir sahne görmedi", "10/10 masterclass", "Ağzım açık izliyorum"
];

const NAMES = ["MovieNerd99", "cinephile_tr", "xX_dark_Xx", "ahmet1990", "filmgurmesi", "NolanFan", "Neo", "Trinity_22"];

export default function SocialTimeMachine({
  isActive,
  currentTime,
  duration
}: {
  isActive: boolean;
  currentTime: number;
  duration: number;
}) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const reactionIdCounter = useRef(0);
  const lastExplosionTime = useRef(0);

  useEffect(() => {
    if (!isActive || duration <= 0) {
      setReactions([]);
      return;
    }

    // Sahte "Ters Köşe" noktaları (Filmin %25, %50, %75 ve %90'ında chat patlaması olur)
    const milestones = [
      duration * 0.25,
      duration * 0.50,
      duration * 0.75,
      duration * 0.90
    ];

    const currentMilestone = milestones.find(m => Math.abs(currentTime - m) < 5); // 5 saniyelik pencere

    if (currentMilestone && currentTime - lastExplosionTime.current > 60) {
      lastExplosionTime.current = currentTime;
      
      // Chat Patlaması (Danmaku) tetikle
      let explosionCount = 0;
      const interval = setInterval(() => {
        if (explosionCount > 25) {
          clearInterval(interval);
          return;
        }
        
        const newReaction: Reaction = {
          id: reactionIdCounter.current++,
          text: SHOCK_COMMENTS[Math.floor(Math.random() * SHOCK_COMMENTS.length)],
          username: NAMES[Math.floor(Math.random() * NAMES.length)],
          top: 10 + Math.random() * 70, // Ekranın %10 ile %80'i arası
          duration: 6 + Math.random() * 4 // 6-10 saniye arası ekranda kalma
        };

        setReactions(prev => [...prev, newReaction]);
        
        // Yorumu süresi bitince DOM'dan sil
        setTimeout(() => {
          setReactions(prev => prev.filter(r => r.id !== newReaction.id));
        }, newReaction.duration * 1000);

        explosionCount++;
      }, 300); // Her 300ms'de bir yorum at

      return () => clearInterval(interval);
    }

    // Normal, seyrek yorumlar
    if (Math.random() < 0.01) { // %1 ihtimalle her saniye 1 yorum
        const newReaction: Reaction = {
            id: reactionIdCounter.current++,
            text: ["İyi film", "Sıkıcı ilerliyor", "Müzikler efsane", "Görüntü yönetmeni şov yapmış"][Math.floor(Math.random() * 4)],
            username: NAMES[Math.floor(Math.random() * NAMES.length)],
            top: 10 + Math.random() * 70,
            duration: 8 + Math.random() * 4
          };
  
          setReactions(prev => [...prev, newReaction]);
          setTimeout(() => {
            setReactions(prev => prev.filter(r => r.id !== newReaction.id));
          }, newReaction.duration * 1000);
    }

  }, [isActive, currentTime, duration]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden pointer-events-none">
      {reactions.map(r => (
        <div 
          key={r.id} 
          className="absolute whitespace-nowrap text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center gap-2"
          style={{
            top: `${r.top}%`,
            right: '-20%', // Ekranın sağından başlar
            animation: `danmaku ${r.duration}s linear forwards`,
            fontSize: '1.2vw'
          }}
        >
          <span className="text-zinc-400 text-[0.8vw]">@{r.username}</span>
          <span>{r.text}</span>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes danmaku {
          0% { transform: translateX(0); opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { transform: translateX(-150vw); opacity: 0; }
        }
      `}} />
    </div>
  );
}

