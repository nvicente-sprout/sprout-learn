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
  // Free-tier models only — pro models (2.5-pro, 1.5-pro) return quota limit:0 on the free
  // plan and just waste a fallback attempt, so they're deliberately excluded here.
  const preferred = ['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.0-flash','gemini-2.0-flash-lite','gemini-1.5-flash','gemini-1.5-flash-8b'];
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
      if (geminiRes.status === 429 || geminiRes.status === 503) {
        hadQuotaError = true;
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
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? `${model} timed out` : error.message;
    }
  }
  if (hadQuotaError) {
    return res.status(429).json({ error: `Quota exceeded on all models. Try again later. (${lastError})` });
  }
  return res.status(502).json({ error: `Could not reach Gemini on any model. (${lastError})` });
}
