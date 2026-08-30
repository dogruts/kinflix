import { useEffect, useState } from "react";

const TRIVIA_QUESTIONS = [
  { q: "Hangi film 'I'll be back' repliğiyle efsaneleşmiştir?", opts: ["Die Hard", "Terminator", "Rambo", "Rocky"], ans: 1 },
  { q: "Matrix filminde Neo hangi hapı seçmiştir?", opts: ["Mavi", "Kırmızı", "Sarı", "Yeşil"], ans: 1 },
  { q: "Yüzüklerin Efendisi serisinde kaç tane yüzük vardır?", opts: ["1", "3", "9", "20"], ans: 3 },
  { q: "İlk Oscar kazanan animasyon filmi hangisidir?", opts: ["Toy Story", "Shrek", "Aslan Kral", "Kayıp Balık Nemo"], ans: 1 },
  { q: "Christopher Nolan'ın rüyalar içinde rüya gördüren filmi?", opts: ["Interstellar", "Memento", "Inception", "Tenet"], ans: 2 }
];

export default function TriviaGame({ broadcastEvent, isHost, localName }: { broadcastEvent: (action: string, payload?: any) => void, isHost: boolean, localName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const handleEvent = (e: any) => {
      const data = e.detail;
      if (data.action === "trivia_start") {
        setIsOpen(true);
        setQIndex(data.qIndex);
        setMyAnswer(null);
        setShowAnswer(false);
        if (data.qIndex === 0) setScores({}); // Yeni oyun
      }
      else if (data.action === "trivia_answer") {
        setScores(prev => ({ ...prev, [data.guestName]: (prev[data.guestName] || 0) + (data.isCorrect ? 10 : 0) }));
        if (isHost && !data._relayed) {
          broadcastEvent("trivia_answer", { ...data, _relayed: true });
        }
      }
      else if (data.action === "trivia_show_answer") {
        setShowAnswer(true);
      }
      else if (data.action === "trivia_close") {
        setIsOpen(false);
      }
    };
    window.addEventListener('kinflix_party_event', handleEvent);
    return () => window.removeEventListener('kinflix_party_event', handleEvent);
  }, []);

  const handleNext = () => {
    const nextQ = (qIndex + 1) % TRIVIA_QUESTIONS.length;
    broadcastEvent("trivia_start", { qIndex: nextQ });
    setQIndex(nextQ); setMyAnswer(null); setShowAnswer(false);
  };

  const handleShowAnswer = () => {
    broadcastEvent("trivia_show_answer");
    setShowAnswer(true);
  };

  const handleClose = () => {
    broadcastEvent("trivia_close");
    setIsOpen(false);
  };

  const submitAnswer = (idx: number) => {
    if (myAnswer !== null || showAnswer) return;
    setMyAnswer(idx);
    const isCorrect = idx === TRIVIA_QUESTIONS[qIndex].ans;
    broadcastEvent("trivia_answer", { guestName: localName, isCorrect });
    // Kendi skorumu hemen güncelle
    setScores(prev => ({ ...prev, [localName]: (prev[localName] || 0) + (isCorrect ? 10 : 0) }));
  };

  if (!isOpen) return null;

  const q = TRIVIA_QUESTIONS[qIndex];
  const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in zoom-in-95">
      <div className="w-full max-w-2xl bg-zinc-900 border-2 border-indigo-500/50 rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.2)] flex flex-col md:flex-row overflow-hidden">
        
        {/* Soru Alanı */}
        <div className="flex-1 p-8 flex flex-col relative">
          <button onClick={handleClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition">✖</button>
          
          <h2 className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-4">Soru {qIndex + 1} / {TRIVIA_QUESTIONS.length}</h2>
          <h1 className="text-xl md:text-2xl font-bold text-white mb-8">{q.q}</h1>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {q.opts.map((opt, idx) => {
              let btnClass = "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white";
              if (myAnswer === idx) btnClass = "bg-indigo-600 border-indigo-500 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900";
              if (showAnswer) {
                if (idx === q.ans) btnClass = "bg-green-600 border-green-500 text-white font-bold shadow-[0_0_20px_rgba(22,163,74,0.4)]";
                else if (myAnswer === idx) btnClass = "bg-red-600 border-red-500 text-white opacity-50";
                else btnClass = "bg-zinc-800/50 border-zinc-800 text-zinc-500 opacity-50";
              }
              
              return (
                <button 
                  key={idx} 
                  onClick={() => submitAnswer(idx)}
                  disabled={myAnswer !== null || showAnswer}
                  className={`border rounded-xl p-4 text-left transition-all duration-300 disabled:cursor-default ${btnClass}`}
                >
                  <span className="font-bold opacity-50 mr-2">{['A','B','C','D'][idx]}</span> {opt}
                </button>
              );
            })}
          </div>
          
          {isHost && (
            <div className="flex gap-3 mt-auto pt-4 border-t border-zinc-800/50">
               {!showAnswer ? (
                  <button onClick={handleShowAnswer} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded transition">Cevabı Göster</button>
               ) : (
                  <button onClick={handleNext} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded transition">Sonraki Soru</button>
               )}
            </div>
          )}
        </div>
        
        {/* Puan Tablosu */}
        <div className="w-full md:w-64 bg-zinc-950 p-6 border-t md:border-t-0 md:border-l border-zinc-800/50 flex flex-col">
          <h3 className="text-zinc-400 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
            🏆 Liderlik Tablosu
          </h3>
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
            {sortedScores.length === 0 ? (
               <p className="text-zinc-600 text-sm italic">Henüz cevap yok...</p>
            ) : (
              sortedScores.map(([name, score], i) => (
                <div key={name} className="flex items-center justify-between bg-zinc-900/50 rounded p-2 border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤'}</span>
                    <span className="text-zinc-200 font-medium text-sm truncate max-w-[100px]">{name}</span>
                  </div>
                  <span className="text-indigo-400 font-bold">{score}</span>
                </div>
              ))
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
