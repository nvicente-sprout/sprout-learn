import { config } from './config.js';
import { applyCors, verifyAuthUser } from './_auth.js';

const UPSTREAM_TIMEOUT_MS = 10000;

// Vercel serverless function — proxies Gemini API so the key stays server-side
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  let apiKey;
  try {
    apiKey = config.geminiApiKey;
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const { text, courseTitle } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Build ordered model list — fetch available ones, fall back to defaults
  // gemini-1.5-flash and gemini-1.5-flash-8b confirmed retired (404) as of 2026-08-02 —
  // replaced with gemini-2.0-flash-lite and gemini-2.5-pro, which are live but currently
  // over free-tier quota; kept as fallbacks since quota resets periodically.
  const preferred = ['gemini-2.5-flash','gemini-2.0-flash','gemini-2.0-flash-lite','gemini-2.5-pro'];
  let modelsToTry = preferred;
  try {
    const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const modelsData = await modelsRes.json();
    const available = (modelsData.models || [])
      .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
      .map(model => model.name.replace('models/', ''));
    const ordered = preferred.filter(preferredModel => available.includes(preferredModel));
    if (ordered.length) modelsToTry = ordered;
  } catch { /* use defaults */ }

  const prompt = `You are an instructional designer. Based on this training content from "${courseTitle || 'this course'}", generate exactly 8 assessment questions: 5 multiple choice and 3 true/false.

Return ONLY a raw JSON array. No markdown, no code blocks, no explanation, no extra text before or after. Use this exact format:
[{"type":"mc","question":"Question here?","options":["Option A","Option B","Option C","Option D"],"correct":0},{"type":"tf","question":"True or false statement?","correct":true}]

Training content:
${String(text).slice(0, 4000)}`;

  let lastError = 'All models failed';
  let hadQuotaError = false;
  let retryDelay = null;
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
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        }
      );
      if (geminiRes.ok) {
        const data = await geminiRes.json();
        return res.status(200).json(data);
      }
      const err = await geminiRes.json().catch(() => ({}));
      if (geminiRes.status === 429 || geminiRes.status === 503) {
        hadQuotaError = true;
        retryDelay = err?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay || retryDelay;
      }
      lastError = err?.error?.message || geminiRes.statusText;
      // Any failure (quota, deprecated/unavailable model, bad request, etc.) — try the next
      // model rather than aborting the whole fallback chain on the first non-quota error.
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? `${model} timed out` : error.message;
    }
  }
  if (hadQuotaError) {
    const waitMsg = retryDelay ? ` Please wait ${retryDelay} and try again.` : ' Try again later.';
    return res.status(429).json({ error: `Quota exceeded on all models.${waitMsg} (${lastError})` });
  }
  return res.status(502).json({ error: `Could not reach Gemini on any model. (${lastError})` });
}
