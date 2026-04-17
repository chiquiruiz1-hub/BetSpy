const API_KEYS = [
  process.env.API_FOOTBALL_KEY,
  process.env.API_FOOTBALL_KEY_2,
  process.env.API_FOOTBALL_KEY_3,
  process.env.API_FOOTBALL_KEY_4,
  process.env.API_FOOTBALL_KEY_5,
  process.env.API_FOOTBALL_KEY_6,
].filter(Boolean);

// Seleccionar key según la hora del día para distribuir uso
function getActiveKey() {
  if (API_KEYS.length === 0) return null;
  const hour = new Date().getUTCHours();
  const index = hour % API_KEYS.length;
  return API_KEYS[index];
}

const API_KEY = getActiveKey();
const BASE_URL = 'https://v3.football.api-sports.io';

// IDs de Bet365 y Bwin en API-Football
const BOOKMAKER_IDS = {
  bet365: 8,
  bwin: 6,
};

async function fetchAPI(endpoint) {
  try {
    const r = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY,
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
    });
    const data = await r.json();
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

function calcularArbitraje(fixture, oddsData) {
  if (!oddsData || !oddsData.bookmakers || oddsData.bookmakers.length < 2) return null;

  // Buscar mercado "Match Winner" (1X2) en cualquier casa disponible
  const bestOdds = {};

  for (const bk of oddsData.bookmakers) {
    const matchWinner = bk.bets.find(b => b.id === 1); // bet id 1 = Match Winner
    if (!matchWinner) continue;

    for (const val of matchWinner.values) {
      const name = val.value; // "Home", "Draw", "Away"
      const price = parseFloat(val.odd);
      if (!bestOdds[name] || price > bestOdds[name].price) {
        bestOdds[name] = { price, bookmaker: bk.name };
      }
    }
  }

  const outcomesList = Object.entries(bestOdds);
  if (outcomesList.length < 2) return null;

  const invSum = outcomesList.reduce((acc, [, data]) => acc + 1 / data.price, 0);
  const profit = (1 / invSum - 1) * 100;
  const isSurebet = invSum < 1.0;

  // Traducir nombres
  const nameMap = {
    'Home': fixture.teams.home.name,
    'Draw': 'Empate',
    'Away': fixture.teams.away.name,
  };

  const outcomes = outcomesList.map(([name, data]) => ({
    name: nameMap[name] || name,
    price: data.price,
    bookmaker: data.bookmaker,
  }));

  return {
    sport_category: 'Fútbol',
    sport: fixture.league.name,
    match: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
    commence_time: fixture.fixture.date,
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
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  if (!API_KEY) {
    return res.status(200).json({ signals: [], meta: { source: 'api-football', error: 'No API key' } });
  }

  try {
    // 1. Obtener partidos de hoy y mañana
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [todayData, tomorrowData] = await Promise.all([
      fetchAPI(`/fixtures?date=${today}&timezone=Europe/Madrid`),
      fetchAPI(`/fixtures?date=${tomorrow}&timezone=Europe/Madrid`),
    ]);

    const allFixtures = [
      ...(todayData?.response || []),
      ...(tomorrowData?.response || []),
    ];

    if (allFixtures.length === 0) {
      return res.status(200).json({
        signals: [],
        meta: {
          source: 'api-football',
          error: 'No fixtures',
          date: today,
          hasKey: !!API_KEY,
          todayResponse: todayData?.errors || todayData?.results || 'no data',
        },
      });
    }

    // 2. Obtener cuotas (usar endpoint de odds por fecha, gasta menos requests)
    const oddsPages = await fetchAPI(`/odds?date=${today}&timezone=Europe/Madrid`);
    const oddsMap = new Map();
    if (oddsPages?.response) {
      for (const item of oddsPages.response) {
        oddsMap.set(item.fixture.id, item);
      }
    }

    // Diagnóstico: contar cuántos matches tienen cada casa
    let withBet365 = 0, withBwin = 0, withBoth = 0, withAnyBook = 0;
    const bookmakerCounts = {};
    for (const [, item] of oddsMap) {
      const books = item.bookmakers || [];
      if (books.length > 0) withAnyBook++;
      const hasBet365 = books.some(b => b.id === BOOKMAKER_IDS.bet365);
      const hasBwin = books.some(b => b.id === BOOKMAKER_IDS.bwin);
      if (hasBet365) withBet365++;
      if (hasBwin) withBwin++;
      if (hasBet365 && hasBwin) withBoth++;
      for (const b of books) {
        bookmakerCounts[b.name] = (bookmakerCounts[b.name] || 0) + 1;
      }
    }
    const topBookmakers = Object.entries(bookmakerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const signals = [];

    // 3. Cruzar partidos con cuotas
    for (const fixture of allFixtures) {
      const oddsData = oddsMap.get(fixture.fixture.id);
      if (oddsData) {
        const signal = calcularArbitraje(fixture, oddsData);
        if (signal) signals.push(signal);
      }
    }

    // Ordenar
    signals.sort((a, b) => {
      if (a.is_surebet && !b.is_surebet) return -1;
      if (!a.is_surebet && b.is_surebet) return 1;
      return b.profit_margin - a.profit_margin;
    });

    return res.status(200).json({
      signals,
      meta: {
        source: 'api-football',
        total: signals.length,
        surebets: signals.filter(s => s.is_surebet).length,
        fixtures_checked: allFixtures.length,
        odds_entries: oddsMap.size,
        odds_paging: oddsPages?.paging || null,
        with_any_bookmaker: withAnyBook,
        with_bet365: withBet365,
        with_bwin: withBwin,
        with_both: withBoth,
        top_bookmakers: topBookmakers,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(200).json({ signals: [], meta: { source: 'api-football', error: error.message } });
  }
}
