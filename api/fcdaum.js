// Vercel 서버리스 함수 — FC다움 API 프록시
// 브라우저에서 fcdaum.com 직접 호출 시 CORS 차단되므로 서버에서 대신 호출
// Vercel 환경 변수: FCDAUM_API_KEY, FCDAUM_SECRET_KEY (VITE_ 접두사 없음)

export default async function handler(req, res) {
  const { path, ...params } = req.query;
  if (!path) return res.status(400).json({ error: 'path required' });

  const url = new URL(`https://fcdaum.com/api/v2/open/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-key': process.env.FCDAUM_API_KEY ?? '',
        'x-secret-key': process.env.FCDAUM_SECRET_KEY ?? '',
      },
    });

    const data = await response.json().catch(() => ({ error: 'parse error' }));
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
