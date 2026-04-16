const API_KEYS = [
  process.env.THE_ODDS_API_KEY_1,
  process.env.THE_ODDS_API_KEY_2,
  process.env.THE_ODDS_API_KEY_3,
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
const SPORT_CONFIG = [
  { prefix: 'soccer', label: 'Fútbol', slots: 6 },
  { prefix: 'basketball', label: 'Basket', slots: 2 },
  { prefix: 'tennis', label: 'Tenis', slots: 2 },
  { prefix: 'icehockey', label: 'Hockey', slots: 2 },
  { prefix: 'baseball', label: 'Béisbol', slots: 2 },
  { prefix: 'mma', label: 'MMA', slots: 1 },
  { prefix: 'boxing', label: 'Boxeo', slots: 1 },
  { prefix: 'rugbyleague', label: 'Rugby', slots: 1 },
  { prefix: 'handball', label: 'Balonmano', slots: 1 },
  { prefix: 'americanfootball', label: 'Fútbol Americano', slots: 1 },
  { prefix: 'cricket', label: 'Cricket', slots: 1 },
  { prefix: 'aussierules', label: 'Aussie Rules', slots: 1 },
];

function getSportCategory(sportKey) {
  const match = SPORT_CONFIG.find(c => sportKey.startsWith(c.prefix));
  return match ? match.label : 'Otros';
}

// Casas de apuestas del usuario
const MY_BOOKMAKERS = ['Bet365', 'bwin'];

function calcularArbitraje(event, sportKey) {
  if (!event.bookmakers || event.bookmakers.length === 0) return null;

  // Filtrar solo las casas del usuario
  const myBookmakers = event.bookmakers.filter(b =>
    MY_BOOKMAKERS.some(mb => b.title.toLowerCase() === mb.toLowerCase())
  );
  if (myBookmakers.length < 2) return null;

  const bestOdds = {};

  for (const bookmaker of myBookmakers) {
    for (const market of bookmaker.markets) {
      if (market.key !== 'h2h') continue;
      for (const outcome of market.outcomes) {
        const name = outcome.name;
        const price = outcome.price;
        if (!bestOdds[name] || price > bestOdds[name].price) {
          bestOdds[name] = { price, bookmaker: bookmaker.title };
        }
      }
    }
  }

  const outcomesList = Object.entries(bestOdds);
  if (outcomesList.length < 2) return null;

  const invSum = outcomesList.reduce((acc, [, data]) => acc + 1 / data.price, 0);
  const profit = (1 / invSum - 1) * 100;
  const isSurebet = invSum < 1.0;

  const outcomes = outcomesList.map(([name, data]) => ({
    name,
    price: data.price,
    bookmaker: data.bookmaker,
  }));

  return {
    sport_category: getSportCategory(sportKey),
    sport: event.sport_title,
    match: `${event.home_team} vs ${event.away_team}`,
    commence_time: event.commence_time,
    market_key: 'h2h',
    market_name: 'Cara o Cruz (H2H)',
    outcomes,
    profit_margin: Math.round(profit * 100) / 100,
    is_surebet: isSurebet,
    bet_to: outcomes[0].name,
    price: outcomes[0].price,
    bookmaker: outcomes[0].bookmaker,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache 15 minutos para ahorrar créditos
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');

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
        const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=eu&oddsFormat=decimal`;
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

    // 4. Calcular arbitraje
    const signals = [];
    for (const result of rawResults) {
      if (result === 'NO_CREDITS') continue;
      for (const event of result.events) {
        const signal = calcularArbitraje(event, result.sportKey);
        if (signal) signals.push(signal);
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
