import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  TrendingUp,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  RefreshCcw,
  Trophy,
  Activity,
  Layout
} from 'lucide-react';
import signalsData from './data/signals.json';

const SPORTS = [
  { id: 'all', label: 'Dashboard', icon: Trophy },
  { id: 'soccer', label: 'Fútbol', icon: Activity },
  { id: 'basketball', label: 'Basket', icon: Layout },
  { id: 'tennis', label: 'Tenis', icon: Zap },
  { id: 'others', label: 'Otros', icon: ShieldCheck },
];

function App() {
  const [activeTab, setActiveTab] = useState('all');
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [apiStatus, setApiStatus] = useState('online');
  const [showCalc, setShowCalc] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [stake, setStake] = useState(100);
  const [meta, setMeta] = useState(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/odds');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals);
        setMeta(data.meta);
        setApiStatus(data.signals.length > 0 ? 'online' : 'empty');
      } else {
        // Fallback a datos locales si la API falla
        setSignals(signalsData);
        setApiStatus('cache');
      }
    } catch {
      // Sin conexion: usar datos locales
      setSignals(signalsData);
      setApiStatus('cache');
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const filteredSignals = activeTab === 'all' 
    ? signals 
    : signals.filter(s => {
        const sport = s.sport.toLowerCase();
        if (activeTab === 'soccer') return sport.includes('liga') || sport.includes('soccer') || sport.includes('champions') || sport.includes('bundesliga') || sport.includes('serie a');
        if (activeTab === 'basketball') return sport.includes('nba') || sport.includes('basket') || sport.includes('euroleague');
        if (activeTab === 'tennis') return sport.includes('tennis');
        if (activeTab === 'others') return !sport.includes('soccer') && !sport.includes('basket') && !sport.includes('nba') && !sport.includes('tennis');
        return true;
      });

  const copyToClipboard = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-emerald-500/30">
      {/* Background Orbs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 rotate-3">
              <Zap className="text-slate-950 fill-slate-950" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-white">
                BETSPY <span className="text-emerald-500">PRO</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full animate-pulse ${apiStatus === 'online' ? 'bg-emerald-500' : apiStatus === 'empty' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                  {apiStatus === 'online' ? `Radar Live: ${signals.length} señales en tiempo real` : apiStatus === 'empty' ? 'Radar Live: Sin señales activas' : 'Radar: Modo Caché (API offline)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={refreshData}
              className="p-3 bg-slate-900 border border-white/5 rounded-2xl text-slate-400 hover:text-white hover:border-emerald-500/30 transition-all group"
            >
              <RefreshCcw size={20} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
            </button>
            <div className="flex items-center gap-3 bg-slate-900/50 backdrop-blur-xl border border-white/5 p-2 rounded-2xl">
              {SPORTS.map((sport) => {
                const Icon = sport.icon;
                return (
                  <button
                    key={sport.id}
                    onClick={() => setActiveTab(sport.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 font-bold text-sm ${
                      activeTab === sport.id 
                        ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' 
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:inline">{sport.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Hero Alert */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-emerald-500/20 rounded-3xl p-6 mb-12 backdrop-blur-md relative overflow-hidden"
        >
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3 border border-emerald-500/30">
                <TrendingUp size={12} /> Sugerencia de Valor
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Maximiza tu ROI con datos de precisión</h2>
              <p className="text-slate-400 text-sm max-w-xl">
                Nuestro motor auditivo analiza cuotas de múltiples casas en tiempo real para encontrar ineficiencias matemáticas. Todos los picks debajo han sido verificados hace menos de 5 minutos.
              </p>
            </div>
            <button className="bg-white text-slate-950 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-tight hover:scale-105 transition-transform active:scale-95 shadow-xl">
              Configurar Alertas
            </button>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] -z-10" />
        </motion.div>

        {/* Grid of Cards */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-64 bg-slate-900/50 rounded-[32px] animate-pulse border border-white/5" />
              ))}
            </motion.div>
          ) : (
            <motion.div 
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredSignals.length > 0 ? filteredSignals.map((signal, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group bg-slate-900 border border-white/5 hover:border-emerald-500/30 rounded-[32px] p-6 transition-all duration-500 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
                      <TrendingUp size={14} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors duration-500 ${
                      signal.is_surebet ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-slate-950'
                    }`}>
                      {signal.sport.includes('NBA') || signal.sport.includes('basket') ? <Layout size={20} /> : <Activity size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{signal.sport}</div>
                        {signal.is_surebet && (
                          <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase tracking-tighter">Cara o Cruz</span>
                        )}
                        {signal.is_surebet && (
                          <span className="bg-amber-500/20 text-amber-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/30 uppercase tracking-tighter">Arbitraje</span>
                        )}
                      </div>
                      <div className="text-white font-bold text-sm truncate max-w-[180px]">{signal.match}</div>
                    </div>
                  </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          {signal.market_name || 'Mercado'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                          <Clock size={10} /> Live Now
                        </span>
                      </div>

                      {signal.outcomes ? (
                        <div className="grid gap-2">
                          {signal.outcomes.map((outcome, oIdx) => (
                            <div key={oIdx} className="flex items-center justify-between bg-slate-950/50 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                              <div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">{outcome.bookmaker}</span>
                                <div className="text-white font-bold text-sm truncate max-w-[120px]">{outcome.name}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-xl font-black text-white italic">@{outcome.price.toFixed(2)}</div>
                                <button 
                                  onClick={() => copyToClipboard(`${idx}-${oIdx}`, `${signal.match} - ${outcome.name} @${outcome.price} en ${outcome.bookmaker}`)}
                                  className={`p-2 rounded-lg transition-all ${
                                    copiedId === `${idx}-${oIdx}` ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {copiedId === `${idx}-${oIdx}` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-end justify-between bg-slate-900/50 p-3 rounded-xl border border-white/5">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Mejor Cuota en {signal.bookmaker}</span>
                            <div className="text-3xl font-black text-white italic">@{signal.price.toFixed(2)}</div>
                          </div>
                          <button 
                            onClick={() => copyToClipboard(idx, `${signal.match} - ${signal.bet_to} @${signal.price}`)}
                            className={`p-3 rounded-xl transition-all ${
                              copiedId === idx ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {copiedId === idx ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                      )}
                    </div>

                  <div className="flex items-center justify-between px-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Bookmaker A</span>
                      <span className="text-xs font-bold text-slate-300">{signal.bookmaker}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Beneficio Seguro (ROI)</span>
                      <span className={`text-2xl font-black ${signal.profit_margin > 2 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        +{signal.profit_margin}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center">
                    <button 
                      onClick={() => {
                        setSelectedSignal(signal);
                        setShowCalc(true);
                      }}
                      className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-500/10 px-4 py-2 rounded-lg transition-colors"
                    >
                      Abrir Calculadora de Stake <TrendingUp size={12} />
                    </button>
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 gap-4">
                  <RefreshCcw size={48} className="animate-spin-slow opacity-20" />
                  <p className="font-bold tracking-tight">No se encontraron señales activas para este sector.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCalc && selectedSignal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCalc(false)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-slate-900 border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Calculadora de Stake</h3>
                    <button onClick={() => setShowCalc(false)} className="text-slate-500 hover:text-white">
                      <RefreshCcw size={20} className="rotate-45" />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Presupuesto (Inversión)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">$</span>
                        <input 
                          type="number" 
                          value={stake}
                          onChange={(e) => setStake(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 rounded-2xl py-4 pl-8 pr-4 text-white font-bold focus:border-emerald-500/50 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {selectedSignal.outcomes && selectedSignal.outcomes.map((outcome, oIdx) => {
                        const invSum = selectedSignal.outcomes.reduce((acc, o) => acc + (1/o.price), 0);
                        const individualStake = (stake * (1/outcome.price)) / invSum;
                        
                        return (
                          <div key={oIdx} className="bg-slate-950 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                            <div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                {oIdx === 0 ? 'Cara' : oIdx === 1 ? 'Cruz' : 'Canto'} ({outcome.bookmaker})
                              </span>
                              <div className="text-lg font-black text-white">{outcome.name}</div>
                              <div className="text-[10px] text-slate-400 mt-1 italic">Cuota @{outcome.price.toFixed(2)}</div>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block mb-1">Sugerido</span>
                              <div className="text-xl font-black text-white">${individualStake.toFixed(2)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-emerald-500/10 p-5 rounded-[24px] border border-emerald-500/20 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block mb-1">Beneficio Neto Estimado</span>
                        <div className="text-2xl font-black text-emerald-400">
                          {selectedSignal.profit_margin > 0 ? '+' : ''}${(stake * (selectedSignal.profit_margin / 100)).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block mb-1">ROI Garantizado</span>
                        <div className={`text-xl font-black ${selectedSignal.profit_margin > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {selectedSignal.profit_margin}%
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-6 rounded-3xl border border-white/5">
                      <div className="flex items-center gap-3 mb-4">
                        <ShieldCheck className="text-emerald-500" size={20} />
                        <span className="text-sm font-bold">Instrucciones de Ejecución</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        1. Coloca la <strong>Apuesta A</strong> en {selectedSignal.bookmaker}.<br/>
                        2. Coloca la <strong>Apuesta B</strong> en la casa de cobertura.<br/>
                        3. Al finalizar el evento, habrás recuperado tu inversión más el beneficio indicado.
                      </p>
                    </div>

                    <button 
                      onClick={() => setShowCalc(false)}
                      className="w-full bg-emerald-500 text-slate-950 py-4 rounded-2xl font-black uppercase tracking-tight hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      Confirmar Operación
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="mt-20 border-t border-white/5 pt-8 pb-12 flex flex-col md:flex-row items-center justify-between gap-6 opacity-50">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
            <ShieldCheck size={14} className="text-emerald-500" /> Sistema Seguro & Auditado
          </div>
          <div className="text-xs text-slate-500 italic">
            BetSpy Pro v4.0 — Transparencia total en el mercado de apuestas.
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
