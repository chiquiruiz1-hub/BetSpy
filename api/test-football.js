export default async function handler(req, res) {
  const API_KEY = process.env.API_FOOTBALL_KEY;

  res.setHeader('Cache-Control', 'no-store');

  if (!API_KEY) {
    return res.status(200).json({ error: 'No API_FOOTBALL_KEY found', keys: Object.keys(process.env).filter(k => k.includes('API')) });
  }

  try {
    // Buscar IDs de bookmakers
    const bkRes = await fetch('https://v3.football.api-sports.io/odds/bookmakers', {
      method: 'GET',
      headers: { 'x-apisports-key': API_KEY },
    });
    const bkData = await bkRes.json();

    // Filtrar Bet365 y Bwin
    const relevant = (bkData.response || []).filter(b =>
      b.name.toLowerCase().includes('bet365') || b.name.toLowerCase().includes('bwin')
    );

    return res.status(200).json({
      bet365_bwin: relevant,
      total_bookmakers: (bkData.response || []).length,
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
