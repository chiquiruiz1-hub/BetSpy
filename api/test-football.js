export default async function handler(req, res) {
  const API_KEY = process.env.API_FOOTBALL_KEY;

  res.setHeader('Cache-Control', 'no-store');

  if (!API_KEY) {
    return res.status(200).json({ error: 'No API_FOOTBALL_KEY found', keys: Object.keys(process.env).filter(k => k.includes('API')) });
  }

  try {
    // Test 1: Endpoint de status (no gasta requests)
    const statusRes = await fetch('https://v3.football.api-sports.io/status', {
      method: 'GET',
      headers: { 'x-apisports-key': API_KEY },
    });
    const statusText = await statusRes.text();

    return res.status(200).json({
      keyLength: API_KEY.length,
      keyStart: API_KEY.substring(0, 4),
      statusCode: statusRes.status,
      statusBody: statusText.substring(0, 500),
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
