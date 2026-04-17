const API_KEYS = [
  process.env.THE_ODDS_API_KEY_1,
  process.env.THE_ODDS_API_KEY_2,
  process.env.THE_ODDS_API_KEY_3,
  process.env.THE_ODDS_API_KEY_4,
  process.env.THE_ODDS_API_KEY_5,
  process.env.THE_ODDS_API_KEY_6,
].filter(Boolean);
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Encuentra la primera key con créditos
async function getActiveKey() {
  for (const key of API_KEYS) {
    try {
      const r = await fetch(`${BASE_URL}/sports/?apiKey=${key}`);
      const remaining = r.headers.get('x-requests-remaining');
      if (r.ok && remaining && Number(remaining) > 0) {
        return { key, remaining };
      }
    } catch { /* skip */ }
  }
  return null;
}

// Categorías con cuántos torneos queremos de cada una (máx por categoría)
// Ajustado para minimizar consumo de créditos: total ≈ 10 torneos × 2 mercados = 20 créditos/refresco
const SPORT_CONFIG = [
  { prefix: 'soccer', label: 'Fútbol', slots: 4 },
  { prefix: 'basketball', label: 'Basket', slots: 2 },
  { prefix: 'tennis', label: 'Tenis', slots: 2 },
  { prefix: 'icehockey', label: 'Hockey', slots: 1 },
  { prefix: 'baseball', label: 'Béisbol', slots: 0 },
  { prefix: 'mma', label: 'MMA', slots: 0 },
  { prefix: 'boxing', label: 'Boxeo', slots: 0 },
  { prefix: 'rugbyleague', label: 'Rugby', slots: 0 },
  { prefix: 'handball', label: 'Balonmano', slots: 0 },
  { prefix: 'americanfootball', label: 'Fútbol Americano', slots: 1 },
  { prefix: 'cricket', label: 'Cricket', slots: 0 },
  { prefix: 'aussierules', label: 'Aussie Rules', slots: 0 },
];

function getSportCategory(sportKey) {
  const match = SPORT_CONFIG.find(c => sportKey.startsWith(c.prefix));
  return match ? match.label : 'Otros';
}

// Casas de apuestas del usuario
const MY_BOOKMAKERS = ['Bet365', 'bwin'];

// Mercados que pedimos a la API (cada uno cuesta 1 crédito por torneo)
const MARKETS = ['h2h', 'totals'];

function getMarketName(key, point) {
  switch (key) {
    case 'h2h': return 'Cara o Cruz (H2H)';
    case 'totals': return point != null ? `Más/Menos ${point}` : 'Más/Menos';
    case 'spreads': return point != null ? `Hándicap ${point}` : 'Hándicap';
    default: return key;
  }
}

// Devuelve un array de señales (una por mercado/punto detectado)
function calcularArbitrajes(event, sportKey) {
  if (!event.bookmakers || event.bookmakers.length === 0) return [];

  const myBookmakers = event.bookmakers.filter(b =>
    MY_BOOKMAKERS.some(mb => b.title.toLowerCase() === mb.toLowerCase())
  );
  if (myBookmakers.length < 2) return [];

  // Agrupar por (market_key, point) para no mezclar Over 2.5 con Over 3.5
  const groups = new Map();
  for (const bk of myBookmakers) {
    for (const market of bk.markets) {
      for (const outcome of market.outcomes) {
        const point = outcome.point ?? null;
        const groupKey = `${market.key}::${point ?? ''}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, { marketKey: market.key, point, bestOdds: {} });
        }
        const group = groups.get(groupKey);
        const name = outcome.name;
        if (!group.bestOdds[name] || outcome.price > group.bestOdds[name].price) {
          group.bestOdds[name] = { price: outcome.price, bookmaker: bk.title };
        }
      }
    }
  }

  const signals = [];
  for (const { marketKey, point, bestOdds } of groups.values()) {
    const outcomesList = Object.entries(bestOdds);
    if (outcomesList.length < 2) continue;
    // Solo considerar grupos con al menos una cuota de cada casa distinta
    const distinctBooks = new Set(outcomesList.map(([, d]) => d.bookmaker));
    if (distinctBooks.size < 2) continue;

    const invSum = outcomesList.reduce((acc, [, d]) => acc + 1 / d.price, 0);
    const profit = (1 / invSum - 1) * 100;
    const outcomes = outcomesList.map(([name, data]) => ({
      name,
      price: data.price,
      bookmaker: data.bookmaker,
    }));

    signals.push({
      sport_category: getSportCategory(sportKey),
      sport: event.sport_title,
      match: `${event.home_team} vs ${event.away_team}`,
      commence_time: event.commence_time,
      market_key: marketKey,
      market_name: getMarketName(marketKey, point),
      outcomes,
      profit_margin: Math.round(profit * 100) / 100,
      is_surebet: invSum < 1,
      bet_to: outcomes[0].name,
      price: outcomes[0].price,
      bookmaker: outcomes[0].bookmaker,
    });
  }

  return signals;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache 1 hora + 30 min stale para ahorrar créditos al máximo
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  if (API_KEYS.length === 0) {
    return res.status(500).json({ error: 'API keys not configured' });
  }

  try {
    // 0. Buscar una key con créditos
    const activeKey = await getActiveKey();
    if (!activeKey) {
      return res.status(200).json({
        signals: [],
        meta: {
          total: 0, surebets: 0, sports_checked: 0,
          credits_remaining: '0',
          updated_at: new Date().toISOString(),
          no_credits: true,
        },
      });
    }
    const API_KEY = activeKey.key;

    // 1. Obtener deportes activos (NO gasta créditos)
    const sportsRes = await fetch(`${BASE_URL}/sports/?apiKey=${API_KEY}`);
    if (!sportsRes.ok) {
      return res.status(sportsRes.status).json({ error: 'Error fetching sports' });
    }
    const allSports = await sportsRes.json();

    // 2. Seleccionar torneos activos respetando los slots por categoría
    const sportsToFetch = [];
    for (const config of SPORT_CONFIG) {
      const matching = allSports.filter(s =>
        s.active && !s.has_outrights && s.key.startsWith(config.prefix)
      );
      sportsToFetch.push(...matching.slice(0, config.slots).map(s => s.key));
    }

    // 3. Descargar cuotas en paralelo
    let creditsRemaining = null;

    const oddsPromises = sportsToFetch.map(async (sportKey) => {
      try {
        const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=eu&oddsFormat=decimal&markets=${MARKETS.join(',')}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });

        const rem = r.headers.get('x-requests-remaining');
        if (rem !== null) creditsRemaining = rem;

        if (r.ok) {
          const data = await r.json();
          return { sportKey, events: data };
        }
        if (r.status === 401 || r.status === 429) return 'NO_CREDITS';
      } catch { /* skip */ }
      return { sportKey, events: [] };
    });

    const rawResults = await Promise.all(oddsPromises);

    if (rawResults.some(r => r === 'NO_CREDITS')) {
      return res.status(200).json({
        signals: [],
        meta: {
          total: 0,
          surebets: 0,
          sports_checked: 0,
          credits_remaining: '0',
          updated_at: new Date().toISOString(),
          no_credits: true,
        },
      });
    }

    // 4. Calcular arbitraje (puede haber varias señales por evento, una por mercado)
    const signals = [];
    for (const result of rawResults) {
      if (result === 'NO_CREDITS') continue;
      for (const event of result.events) {
        signals.push(...calcularArbitrajes(event, result.sportKey));
      }
    }

    // 5. Ordenar: surebets primero, luego por margen descendente
    signals.sort((a, b) => {
      if (a.is_surebet && !b.is_surebet) return -1;
      if (!a.is_surebet && b.is_surebet) return 1;
      return b.profit_margin - a.profit_margin;
    });

    return res.status(200).json({
      signals,
      meta: {
        total: signals.length,
        surebets: signals.filter(s => s.is_surebet).length,
        sports_checked: sportsToFetch.length,
        credits_remaining: creditsRemaining,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
