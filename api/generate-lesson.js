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
  // Free-tier models only. Pro models (2.5-pro, 1.5-pro) and "-lite" variants (2.5-flash-lite,
  // 2.0-flash-lite) confirmed to return quota limit:0 on this account/plan — excluded so the
  // fallback chain doesn't waste an attempt on a model with zero real quota.
  const preferred = ['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-flash','gemini-1.5-flash-8b'];
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

  const prompt = `You are an instructional designer turning training content from "${courseTitle || 'this course'}" into a short interactive lesson made of cards.

The source content below is divided into pages, each marked with a line like "[Page 3]" right before that page's text.

Rules:
- Use ONLY facts present in the source content below. Do not invent rules, numbers, dates, or examples the text doesn't support.
- Scale the number of cards to the amount of content — do NOT pad. Short content = 4-6 cards, long content = up to about 12 cards. Never use a fixed count.
- Never place two "learn" cards in a row. Every content bite ("learn") must be followed by a "recall", "check", or "scenario" card so the learner always does something after reading.
- Keep "learn" card "body" as 2-4 SHORT bullet points (max ~12 words each), not a paragraph. Put the single most important sentence in "highlight" instead of repeating it in "body".
- Every "check" and "scenario" card must include a one-sentence "why" explaining the correct answer, and 2-4 "options".
- Include exactly one "recap" card, and it must be the LAST card, with 3-5 bullet "points".
- If the content is about HR, compliance, or policy, include at least one "scenario" card — a realistic "what would you do" situation.
- Every card EXCEPT "recap" must include a "page" field: the 1-based page number (from the "[Page N]" markers) that card's content is drawn from. Omit "page" on the "recap" card.

Card types and exact shapes:
{"type":"learn","heading":"...","body":["short point","short point"],"highlight":"... (optional)","page":1}
{"type":"recall","prompt":"...","answer":"...","page":1}
{"type":"check","prompt":"...","options":["...","..."],"correct":0,"why":"...","page":1}
{"type":"scenario","prompt":"...","options":["...","..."],"correct":0,"why":"...","page":1}
{"type":"recap","points":["...","...","..."]}

("correct" is a 0-based index into "options".)

Return ONLY a raw JSON object. No markdown, no code blocks, no explanation, no extra text before or after. Use this exact format:
{"cards":[{"type":"learn","heading":"Example heading","body":["Short point one","Short point two"],"highlight":"Example highlight","page":1},{"type":"check","prompt":"Example question?","options":["Option A","Option B"],"correct":0,"why":"Example reason.","page":2}]}

Training content:
${String(text).slice(0, 6000)}`;

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
