// Vercel serverless function — proxies Gemini API so the key stays server-side
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { text, courseTitle } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Build ordered model list — fetch available ones, fall back to defaults
  const preferred = ['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-flash','gemini-2.5-pro','gemini-1.5-pro','gemini-pro'];
  let modelsToTry = preferred;
  try {
    const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const modelsData = await modelsRes.json();
    const available = (modelsData.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    const ordered = preferred.filter(p => available.includes(p));
    if (ordered.length) modelsToTry = ordered;
  } catch (e) { /* use defaults */ }

  const prompt = `You are an instructional designer. Based on this training content from "${courseTitle || 'this course'}", generate exactly 8 assessment questions: 5 multiple choice and 3 true/false.

Return ONLY a raw JSON array. No markdown, no code blocks, no explanation, no extra text before or after. Use this exact format:
[{"type":"mc","question":"Question here?","options":["Option A","Option B","Option C","Option D"],"correct":0},{"type":"tf","question":"True or false statement?","correct":true}]

Training content:
${String(text).slice(0, 4000)}`;

  let lastError = 'All models failed';
  for (const model of modelsToTry) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
          }),
        }
      );
      if (geminiRes.status === 429 || geminiRes.status === 503) {
        const err = await geminiRes.json().catch(() => ({}));
        lastError = err?.error?.message || `${model} quota exceeded`;
        continue; // try next model
      }
      if (!geminiRes.ok) {
        const err = await geminiRes.json().catch(() => ({}));
        return res.status(geminiRes.status).json({ error: err?.error?.message || geminiRes.statusText });
      }
      const data = await geminiRes.json();
      return res.status(200).json(data);
    } catch (e) {
      lastError = e.message;
    }
  }
  return res.status(429).json({ error: `Quota exceeded on all models. Try again later. (${lastError})` });
}
