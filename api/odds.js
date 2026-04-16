const API_KEY = process.env.THE_ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Categorías de deportes que nos interesan (por prefijo de sport_key)
const WANTED_CATEGORIES = [
  'soccer',
  'basketball',
  'tennis',
  'icehockey',
  'baseball',
  'mma',
  'boxing',
  'rugby',
  'handball',
  'americanfootball',
];

// Mapeo de sport_key a categoría en español
function getSportCategory(sportKey) {
  if (sportKey.startsWith('soccer')) return 'Fútbol';
  if (sportKey.startsWith('basketball')) return 'Basket';
  if (sportKey.startsWith('tennis')) return 'Tenis';
  if (sportKey.startsWith('icehockey')) return 'Hockey';
  if (sportKey.startsWith('baseball')) return 'Béisbol';
  if (sportKey.startsWith('mma')) return 'MMA';
  return 'Otros';
}

function calcularArbitraje(event, sportKey) {
  if (!event.bookmakers || event.bookmakers.length === 0) return null;

  const bestOdds = {};

  for (const bookmaker of event.bookmakers) {
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
  // Cache 5 minutos para no gastar creditos en cada visita
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // 1. Obtener deportes activos (NO gasta creditos)
    const sportsRes = await fetch(`${BASE_URL}/sports/?apiKey=${API_KEY}`);
    if (!sportsRes.ok) {
      return res.status(sportsRes.status).json({ error: 'Error fetching sports' });
    }
    const allSports = await sportsRes.json();
    // 2. Buscar todos los deportes activos que coincidan con nuestras categorías
    const activeSports = allSports.filter(s =>
      s.active && !s.has_outrights && WANTED_CATEGORIES.some(cat => s.key.startsWith(cat))
    );

    // Limitar a 12 para equilibrar cobertura vs créditos
    const limitedSports = activeSports.map(s => s.key).slice(0, 12);

    // 3. Descargar cuotas en paralelo
    let creditsRemaining = null;

    const oddsPromises = limitedSports.map(async (sportKey) => {
      try {
        const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=eu&oddsFormat=decimal`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });

        // Capturar creditos del header (sin llamada extra)
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
        sports_checked: limitedSports.length,
        credits_remaining: creditsRemaining,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
