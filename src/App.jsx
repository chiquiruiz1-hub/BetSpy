import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  TrendingUp,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  RefreshCcw,
  Activity,
  Layout,
  ChevronDown,
  X,
  Filter,
  Bell,
  BellOff
} from 'lucide-react';
import signalsData from './data/signals.json';

// Recalcula margen y surebet desde las cuotas reales para evitar discrepancias
// entre lo que muestra la app y lo que el usuario cobraría apostando.
function recomputeMargins(signals) {
  return signals.map(s => {
    if (!s.outcomes || s.outcomes.length < 2) return s;
    const invSum = s.outcomes.reduce((acc, o) => acc + 1 / o.price, 0);
    const profit_margin = Math.round((1 / invSum - 1) * 10000) / 100;
    return { ...s, profit_margin, is_surebet: invSum < 1 };
  });
}

// Para datos demo sin commence_time, generamos horarios realistas escalonados
// para que el feature de "cuándo empieza" se vea siempre fresco.
function injectDemoTimes(signals) {
  const offsetsHoras = [0.5, 2, 5, 9, 22, 27, 30, 48, 52, 70, 75, 96];
  return signals.map((s, i) => {
    if (s.commence_time) return s;
    const t = new Date(Date.now() + (offsetsHoras[i % offsetsHoras.length]) * 3600 * 1000);
    return { ...s, commence_time: t.toISOString() };
  });
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Convierte un ISO a algo legible: "Empieza en 8 min", "Hoy 21:00", "Mañana 18:30", "Sáb 19 abr · 20:00"
function formatMatchTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMin = (d.getTime() - now.getTime()) / 60000;

  if (diffMin < 0) return { text: 'En curso', urgency: 'live' };
  if (diffMin < 60) return { text: `Empieza en ${Math.max(1, Math.round(diffMin))} min`, urgency: 'soon' };

  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfDay - startOfToday) / 86400000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const urgency = diffMin < 360 ? 'today' : 'normal';

  if (dayDiff === 0) return { text: `Hoy ${hh}:${mm}`, urgency };
  if (dayDiff === 1) return { text: `Mañana ${hh}:${mm}`, urgency: 'normal' };
  return { text: `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`, urgency: 'normal' };
}

// Construye el texto del plan de apuestas listo para portapapeles
function buildPlanText(signal, baseStake = 100) {
  const head = signal.is_surebet
    ? `SUREBET +${signal.profit_margin}% · ${signal.match} (${signal.sport})`
    : `SEÑAL ${signal.profit_margin > 0 ? '+' : ''}${signal.profit_margin}% · ${signal.match} (${signal.sport})`;

  const time = formatMatchTime(signal.commence_time);
  const timeLine = time ? `${time.text}\n` : '';

  let lines = '';
  if (signal.outcomes && signal.outcomes.length >= 2) {
    const invSum = signal.outcomes.reduce((acc, o) => acc + 1 / o.price, 0);
    lines = signal.outcomes.map(o => {
      const stake = (baseStake * (1 / o.price)) / invSum;
      return `→ €${stake.toFixed(2)} a ${o.name} en ${o.bookmaker} @${o.price.toFixed(2)}`;
    }).join('\n');
  } else {
    lines = `→ €${baseStake.toFixed(2)} a ${signal.bet_to} en ${signal.bookmaker} @${signal.price.toFixed(2)}`;
  }

  const profit = (baseStake * signal.profit_margin / 100).toFixed(2);
  const tail = signal.is_surebet
    ? `Beneficio garantizado: +€${profit} (sobre ${baseStake}€)`
    : `Beneficio estimado: ${signal.profit_margin > 0 ? '+' : ''}€${profit} (sobre ${baseStake}€)`;

  return `${head}\n${timeLine}\n${lines}\n\n${tail}`;
}

// Las casas en las que el usuario tiene cuenta. Una señal solo es ejecutable
// si TODAS sus cuotas provienen de casas de esta lista.
const MY_BOOKMAKERS = ['bet365', 'bwin'];

function isExecutable(signal) {
  const bookmakers = signal.outcomes
    ? signal.outcomes.map(o => o.bookmaker)
    : [signal.bookmaker];
  return bookmakers.every(b => b && MY_BOOKMAKERS.includes(b.toLowerCase()));
}

function App() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTournament, setSelectedTournament] = useState('all');
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [apiStatus, setApiStatus] = useState('online');
  const [showCalc, setShowCalc] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [stake, setStake] = useState(100);
  const [meta, setMeta] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showOnlyProfitable, setShowOnlyProfitable] = useState(true);
  const [showOnlyExecutable, setShowOnlyExecutable] = useState(false);
  const [newSignalKeys, setNewSignalKeys] = useState(new Set());
  const prevSignalKeysRef = useRef(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('betspy_notif') === '1'
  );

  const signalKey = (s) => `${s.match}::${s.market_name || ''}`;
  const detectNewSignals = (signals) => {
    const currentKeys = new Set(signals.map(signalKey));
    if (prevSignalKeysRef.current !== null) {
      const fresh = new Set();
      for (const k of currentKeys) {
        if (!prevSignalKeysRef.current.has(k)) fresh.add(k);
      }
      setNewSignalKeys(fresh);
      // Notificación si está activada, la pestaña está oculta y hay surebets nuevas
      if (notificationsEnabled && document.hidden && fresh.size > 0 &&
          typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const newSurebets = signals.filter(s => fresh.has(signalKey(s)) && s.is_surebet);
        if (newSurebets.length > 0) {
          const best = Math.max(...newSurebets.map(s => s.profit_margin));
          const title = newSurebets.length === 1
            ? 'Nueva surebet disponible'
            : `${newSurebets.length} surebets nuevas`;
          const body = newSurebets.length === 1
            ? `${newSurebets[0].match} · +${newSurebets[0].profit_margin}%`
            : `Mejor margen: +${best}%`;
          try { new Notification(title, { body, icon: '/vite.svg' }); } catch { /* ignore */ }
        }
      }
    }
    prevSignalKeysRef.current = currentKeys;
  };

  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('betspy_notif', '0');
      return;
    }
    if (typeof Notification === 'undefined') {
      alert('Tu navegador no soporta notificaciones.');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('betspy_notif', '1');
      new Notification('Alertas activadas', { body: 'Te avisaremos cuando aparezcan nuevas surebets.', icon: '/vite.svg' });
    } else {
      alert('Las notificaciones están bloqueadas. Revisa los permisos del navegador.');
    }
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const [oddsRes, footballRes] = await Promise.all([
        fetch('/api/odds').catch(() => null),
        fetch('/api/football-odds').catch(() => null),
      ]);

      let allSignals = [];
      let mainMeta = null;
      let footballSignals = 0;

      if (oddsRes?.ok) {
        const data = await oddsRes.json();
        if (data.signals.length > 0) {
          allSignals.push(...data.signals);
          mainMeta = data.meta;
        } else if (data.meta?.no_credits) {
          mainMeta = data.meta;
        } else if (data.meta) {
          mainMeta = data.meta;
        }
      }

      if (footballRes?.ok) {
        const data = await footballRes.json();
        if (data.signals.length > 0) {
          allSignals.push(...data.signals);
          footballSignals = data.signals.length;
        }
      }
      mainMeta = { ...(mainMeta || {}), football_signals: footballSignals };

      if (allSignals.length > 0) {
        const bestByMatch = new Map();
        for (const s of allSignals) {
          const key = `${s.match}::${s.market_name || ''}`;
          const prev = bestByMatch.get(key);
          if (!prev || s.profit_margin > prev.profit_margin) {
            bestByMatch.set(key, s);
          }
        }
        allSignals = [...bestByMatch.values()];
        const finalSignals = injectDemoTimes(recomputeMargins(allSignals));
        setSignals(finalSignals);
        detectNewSignals(finalSignals);
        setMeta(mainMeta);
        setApiStatus('online');
      } else {
        const finalSignals = injectDemoTimes(recomputeMargins(signalsData));
        setSignals(finalSignals);
        detectNewSignals(finalSignals);
        setMeta(mainMeta);
        setApiStatus(mainMeta?.no_credits ? 'no_credits' : 'cache');
      }
    } catch {
      const finalSignals = injectDemoTimes(recomputeMargins(signalsData));
      setSignals(finalSignals);
      detectNewSignals(finalSignals);
      setApiStatus('cache');
    }
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Tiempo relativo desde última actualización
  const getTimeAgo = () => {
    if (!lastUpdated) return '';
    const seconds = Math.floor((new Date() - lastUpdated) / 1000);
    if (seconds < 60) return 'hace unos segundos';
    const minutes = Math.floor(seconds / 60);
    return `hace ${minutes} min`;
  };

  // Tiempo restante hasta la próxima auto-actualización
  const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  const getTimeToNextRefresh = () => {
    if (!lastUpdated || loading) return null;
    const remaining = REFRESH_INTERVAL_MS - (Date.now() - lastUpdated.getTime());
    if (remaining <= 0) return 'actualizando…';
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    return `próx. ${min}:${String(sec).padStart(2, '0')}`;
  };

  // Tick cada 10s: actualiza textos relativos y dispara auto-refresh si toca
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      if (document.visibilityState === 'visible' && lastUpdated && !loading &&
          Date.now() - lastUpdated.getTime() >= REFRESH_INTERVAL_MS) {
        refreshData();
      }
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdated, loading]);

  // Al volver a la pestaña tras estar oculta, refresca si ya caducó
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && lastUpdated && !loading &&
          Date.now() - lastUpdated.getTime() >= REFRESH_INTERVAL_MS) {
        refreshData();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdated, loading]);

  const ALL_CATEGORIES = [
    { id: 'Fútbol', tournaments: ['La Liga', 'Premier League', 'Bundesliga', 'Serie A', 'Ligue 1', 'UEFA Champions League', 'UEFA Europa League', 'UEFA Conference League', 'CONMEBOL Libertadores', 'CONMEBOL Sudamericana', 'MLS', 'Liga MX', 'Eredivisie', 'Liga Portugal', 'Super Lig'] },
    { id: 'Basket', tournaments: ['NBA', 'Euroleague', 'WNBA', 'ACB', 'Liga Endesa'] },
    { id: 'Tenis', tournaments: ['ATP Barcelona Open', 'ATP Munich', 'ATP Madrid Open', 'ATP Roland Garros', 'ATP Wimbledon', 'WTA Stuttgart Open', 'WTA Madrid Open'] },
    { id: 'Hockey', tournaments: ['NHL', 'SHL', 'Liiga', 'AHL'] },
    { id: 'Béisbol', tournaments: ['MLB', 'NPB', 'KBO'] },
    { id: 'MMA', tournaments: ['UFC', 'MMA'] },
    { id: 'Boxeo', tournaments: ['Boxing'] },
    { id: 'Fútbol Americano', tournaments: ['NFL', 'NCAAF', 'UFL'] },
    { id: 'Rugby', tournaments: ['NRL'] },
    { id: 'Balonmano', tournaments: ['Handball-Bundesliga'] },
    { id: 'Cricket', tournaments: ['IPL', 'International Twenty20'] },
  ];

  const categories = ALL_CATEGORIES.map(c => c.id);

  const tournamentsFromSignals = selectedCategory === 'all'
    ? [...new Set(signals.map(s => s.sport))]
    : [...new Set(signals.filter(s => (s.sport_category || 'Otros') === selectedCategory).map(s => s.sport))];
  const fixedTournaments = selectedCategory === 'all'
    ? ALL_CATEGORIES.flatMap(c => c.tournaments)
    : (ALL_CATEGORIES.find(c => c.id === selectedCategory)?.tournaments || []);
  const tournaments = [...new Set([...tournamentsFromSignals, ...fixedTournaments])].sort();

  const filteredSignals = signals.filter(s => {
    if (selectedCategory !== 'all' && (s.sport_category || 'Otros') !== selectedCategory) return false;
    if (selectedTournament !== 'all' && s.sport !== selectedTournament) return false;
    if (selectedMarket !== 'all' && (s.market_key || 'h2h') !== selectedMarket) return false;
    if (showOnlyProfitable && s.profit_margin <= 0) return false;
    if (showOnlyExecutable && !isExecutable(s)) return false;
    return true;
  }).sort((a, b) => {
    const ta = a.commence_time ? new Date(a.commence_time).getTime() : Infinity;
    const tb = b.commence_time ? new Date(b.commence_time).getTime() : Infinity;
    return ta - tb;
  });

  // Estadísticas rápidas
  const surebetCount = filteredSignals.filter(s => s.is_surebet).length;
  const bestRoi = filteredSignals.reduce((max, s) =>
    s.profit_margin > max ? s.profit_margin : max, -Infinity);

  const copyToClipboard = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Obtener bookmakers únicos de una señal
  const getBookmakers = (signal) => {
    if (!signal.outcomes) return signal.bookmaker;
    return [...new Set(signal.outcomes.map(o => o.bookmaker))].join(' ↔ ');
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
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 rotate-3">
              <Zap className="text-slate-950 fill-slate-950" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-white">
                BETSPY <span className="text-emerald-500">PRO</span>
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`w-2 h-2 rounded-full animate-pulse ${apiStatus === 'online' ? 'bg-emerald-500' : apiStatus === 'no_credits' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                  {apiStatus === 'online' ? 'Radar Live' : apiStatus === 'no_credits' ? 'Modo Demo' : 'Datos de ejemplo'}
                </span>
                {lastUpdated && (
                  <span className="text-[10px] text-slate-600">
                    · Actualizado {getTimeAgo()}
                  </span>
                )}
                {getTimeToNextRefresh() && (
                  <span className="text-[10px] text-slate-600">
                    · {getTimeToNextRefresh()}
                  </span>
                )}
                {meta?.credits_remaining != null && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    Number(meta.credits_remaining) > 100 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : Number(meta.credits_remaining) > 20 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    : 'text-red-400 bg-red-500/10 border-red-500/30'
                  }`}>
                    Odds API: {meta.credits_remaining}
                  </span>
                )}
                {meta?.football_signals > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
                    Fútbol: {meta.football_signals} señales
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={refreshData}
              className="p-3 bg-slate-900 border border-white/5 rounded-2xl text-slate-400 hover:text-white hover:border-emerald-500/30 transition-all group"
              title="Actualizar datos"
            >
              <RefreshCcw size={20} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
            </button>

            <button
              onClick={toggleNotifications}
              className={`p-3 rounded-2xl border transition-all ${
                notificationsEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50'
                  : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white hover:border-emerald-500/30'
              }`}
              title={notificationsEnabled ? 'Desactivar alertas' : 'Activar alertas de nuevas surebets'}
            >
              {notificationsEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            </button>

            {/* Desplegable Deporte */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setSelectedTournament('all'); }}
                className="appearance-none bg-slate-900/50 backdrop-blur-xl border border-white/5 hover:border-emerald-500/30 pl-4 pr-10 py-3 rounded-2xl text-sm font-bold text-white transition-all cursor-pointer focus:outline-none focus:border-emerald-500/50"
              >
                <option value="all">Todos los deportes</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat} ({signals.filter(s => (s.sport_category || 'Otros') === cat).length})</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Desplegable Torneo */}
            <div className="relative">
              <select
                value={selectedTournament}
                onChange={(e) => setSelectedTournament(e.target.value)}
                className="appearance-none bg-slate-900/50 backdrop-blur-xl border border-white/5 hover:border-emerald-500/30 pl-4 pr-10 py-3 rounded-2xl text-sm font-bold text-white transition-all cursor-pointer focus:outline-none focus:border-emerald-500/50"
              >
                <option value="all">Todos los torneos ({tournaments.length})</option>
                {tournaments.map(t => (
                  <option key={t} value={t}>{t} ({signals.filter(s => s.sport === t).length})</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Desplegable Mercado */}
            <div className="relative">
              <select
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                className="appearance-none bg-slate-900/50 backdrop-blur-xl border border-white/5 hover:border-emerald-500/30 pl-4 pr-10 py-3 rounded-2xl text-sm font-bold text-white transition-all cursor-pointer focus:outline-none focus:border-emerald-500/50"
              >
                <option value="all">Todos los mercados</option>
                <option value="h2h">Resultado ({signals.filter(s => (s.market_key || 'h2h') === 'h2h').length})</option>
                <option value="totals">Más/Menos ({signals.filter(s => s.market_key === 'totals').length})</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </header>

        {/* Stats Bar + Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-4 py-2 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Señales</span>
              <span className="text-lg font-black text-white">
                {filteredSignals.length}
                {signals.length !== filteredSignals.length && (
                  <span className="text-slate-500 text-sm font-bold"> / {signals.length}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Surebets</span>
              <span className="text-lg font-black text-emerald-400">{surebetCount}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-4 py-2 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mejor ROI</span>
              <span className={`text-lg font-black ${
                bestRoi > 2 ? 'text-emerald-400' : bestRoi > 0 ? 'text-amber-400' : 'text-slate-600'
              }`}>
                {filteredSignals.length === 0 ? '—' : `${bestRoi > 0 ? '+' : ''}${bestRoi.toFixed(2)}%`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowOnlyProfitable(!showOnlyProfitable)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all border ${
                showOnlyProfitable
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-900/50 text-slate-400 border-white/5'
              }`}
            >
              <Filter size={14} />
              {showOnlyProfitable ? 'Solo rentables' : 'Mostrar todas'}
            </button>
            <button
              onClick={() => setShowOnlyExecutable(!showOnlyExecutable)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all border ${
                showOnlyExecutable
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-900/50 text-slate-400 border-white/5'
              }`}
              title="Solo señales ejecutables con Bet365 o Bwin"
            >
              <ShieldCheck size={14} />
              {showOnlyExecutable ? 'Solo ejecutables' : 'Todas las casas'}
            </button>
          </div>
        </div>

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
                  className={`group bg-slate-900 border rounded-[32px] p-6 transition-all duration-500 relative overflow-hidden ${
                    signal.is_surebet ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/5' : 'border-white/5 hover:border-emerald-500/30'
                  }`}
                >
                  {/* Badges */}
                  {signal.is_surebet && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[8px] font-black px-3 py-1 rounded-bl-2xl uppercase tracking-widest">
                      Surebet
                    </div>
                  )}
                  {newSignalKeys.has(signalKey(signal)) && (
                    <div className={`absolute top-0 bg-blue-500 text-white text-[8px] font-black px-3 py-1 rounded-br-2xl uppercase tracking-widest animate-pulse ${
                      signal.is_surebet ? 'left-0 rounded-tl-[32px]' : 'left-0 rounded-tl-[32px]'
                    }`}>
                      Nuevo
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors duration-500 ${
                      signal.is_surebet ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-slate-950'
                    }`}>
                      {(signal.sport || '').includes('NBA') || (signal.sport || '').includes('basket') ? <Layout size={20} /> : <Activity size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{signal.sport}</div>
                      </div>
                      <div className="text-white font-bold text-sm truncate max-w-[200px]">{signal.match}</div>
                    </div>
                  </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          {signal.market_name || 'Mercado'}
                        </span>
                        {(() => {
                          const t = formatMatchTime(signal.commence_time);
                          if (!t) return (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <Clock size={10} /> {apiStatus === 'online' ? 'Live' : 'Demo'}
                            </span>
                          );
                          const colorClass =
                            t.urgency === 'live' ? 'text-red-400 bg-red-500/10 border-red-500/30 animate-pulse'
                            : t.urgency === 'soon' ? 'text-red-400 bg-red-500/10 border-red-500/30'
                            : t.urgency === 'today' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                            : 'text-slate-400 bg-slate-800/50 border-white/5';
                          return (
                            <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 px-2 py-0.5 rounded-md border ${colorClass}`}>
                              <Clock size={10} /> {t.text}
                            </span>
                          );
                        })()}
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

                  {/* Footer: Bookmakers + ROI */}
                  <div className="flex items-center justify-between px-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Casas</span>
                      <span className="text-xs font-bold text-slate-300">{getBookmakers(signal)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">ROI</span>
                      <span className={`text-2xl font-black ${
                        signal.profit_margin > 2 ? 'text-emerald-500' : signal.profit_margin > 0 ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {signal.profit_margin > 0 ? '+' : ''}{signal.profit_margin}%
                      </span>
                    </div>
                  </div>

                  {/* Aviso de ejecutabilidad */}
                  {!isExecutable(signal) && (
                    <div className="mt-3 bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-bold uppercase tracking-widest text-center px-2 py-1.5 rounded-lg">
                      No ejecutable con tus casas (Bet365/Bwin)
                    </div>
                  )}

                  {/* Acciones - siempre visibles */}
                  <div className="mt-4 pt-4 border-t border-white/5 flex justify-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        setSelectedSignal(signal);
                        setShowCalc(true);
                      }}
                      className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-500/10 px-4 py-2 rounded-lg transition-colors"
                    >
                      Calculadora <TrendingUp size={12} />
                    </button>
                    <button
                      onClick={() => copyToClipboard(`plan-${idx}`, buildPlanText(signal))}
                      className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        copiedId === `plan-${idx}`
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-emerald-500 hover:bg-emerald-500/10'
                      }`}
                    >
                      {copiedId === `plan-${idx}` ? '¡Copiado!' : 'Copiar plan'}
                      {copiedId === `plan-${idx}` ? <Check size={12} /> : <Copy size={12} />}
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

        {/* Calculadora Modal */}
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
                className="relative bg-slate-900 border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Calculadora de Stake</h3>
                    <button onClick={() => setShowCalc(false)} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                    {selectedSignal.match} · {selectedSignal.sport}
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Presupuesto (€)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">€</span>
                        <input
                          type="number"
                          value={stake}
                          onChange={(e) => setStake(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 rounded-2xl py-4 pl-8 pr-4 text-white font-bold focus:border-emerald-500/50 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {selectedSignal.outcomes ? selectedSignal.outcomes.map((outcome, oIdx) => {
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
                              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block mb-1">Apostar</span>
                              <div className="text-xl font-black text-white">€{individualStake.toFixed(2)}</div>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                              Cuota única ({selectedSignal.bookmaker})
                            </span>
                            <div className="text-lg font-black text-white">{selectedSignal.bet_to}</div>
                            <div className="text-[10px] text-slate-400 mt-1 italic">Cuota @{selectedSignal.price.toFixed(2)}</div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block mb-1">Apostar</span>
                            <div className="text-xl font-black text-white">€{Number(stake).toFixed(2)}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`p-5 rounded-[24px] border flex justify-between items-center ${
                      selectedSignal.profit_margin > 0
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                    }`}>
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${
                          selectedSignal.profit_margin > 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}>Beneficio Neto</span>
                        <div className={`text-2xl font-black ${
                          selectedSignal.profit_margin > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {selectedSignal.profit_margin > 0 ? '+' : ''}€{(stake * (selectedSignal.profit_margin / 100)).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${
                          selectedSignal.profit_margin > 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}>ROI</span>
                        <div className={`text-xl font-black ${selectedSignal.profit_margin > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {selectedSignal.profit_margin > 0 ? '+' : ''}{selectedSignal.profit_margin}%
                        </div>
                      </div>
                    </div>

                    {selectedSignal.profit_margin > 0 && (
                      <div className="bg-slate-950 p-6 rounded-3xl border border-white/5">
                        <div className="flex items-center gap-3 mb-4">
                          <ShieldCheck className="text-emerald-500" size={20} />
                          <span className="text-sm font-bold">Instrucciones</span>
                        </div>
                        <div className="text-xs text-slate-400 leading-relaxed space-y-2">
                          {selectedSignal.outcomes ? selectedSignal.outcomes.map((outcome, oIdx) => {
                            const invSum = selectedSignal.outcomes.reduce((acc, o) => acc + (1/o.price), 0);
                            const individualStake = (stake * (1/outcome.price)) / invSum;
                            return (
                              <p key={oIdx}>
                                {oIdx + 1}. Apuesta <strong>€{individualStake.toFixed(2)}</strong> a <strong>{outcome.name}</strong> en <strong>{outcome.bookmaker}</strong> @{outcome.price.toFixed(2)}
                              </p>
                            );
                          }) : (
                            <p>
                              Apuesta <strong>€{Number(stake).toFixed(2)}</strong> a <strong>{selectedSignal.bet_to}</strong> en <strong>{selectedSignal.bookmaker}</strong> @{selectedSignal.price.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedSignal.profit_margin <= 0 && (
                      <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20 text-center">
                        <p className="text-red-400 text-sm font-bold">Esta señal tiene margen negativo. No es recomendable apostar.</p>
                      </div>
                    )}

                    <button
                      onClick={() => setShowCalc(false)}
                      className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black uppercase tracking-tight hover:bg-slate-700 transition-colors"
                    >
                      Cerrar
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
            <ShieldCheck size={14} className="text-emerald-500" /> Mercado global · 15+ casas
          </div>
          <div className="text-xs text-slate-500 italic">
            BetSpy Pro v5.0 — Verifica siempre las cuotas antes de apostar.
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
