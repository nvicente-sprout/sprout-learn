import { config } from './config.js';

// Vercel serverless function — proxies Gemini API so the key stays server-side
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = config.geminiApiKey;

  const { text, courseTitle } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Build ordered model list — fetch available ones, fall back to defaults
  const preferred = ['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-flash','gemini-2.5-pro','gemini-1.5-pro','gemini-pro'];
  let modelsToTry = preferred;
  try {
    const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const modelsData = await modelsRes.json();
    const available = (modelsData.models || [])
      .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
      .map(model => model.name.replace('models/', ''));
    const ordered = preferred.filter(preferredModel => available.includes(preferredModel));
    if (ordered.length) modelsToTry = ordered;
  } catch (error) { /* use defaults */ }

  const prompt = `You are an instructional designer turning training content from "${courseTitle || 'this course'}" into a short interactive lesson made of cards.

Rules:
- Use ONLY facts present in the source content below. Do not invent rules, numbers, dates, or examples the text doesn't support.
- Scale the number of cards to the amount of content — do NOT pad. Short content = 4-6 cards, long content = up to about 12 cards. Never use a fixed count.
- Never place two "learn" cards in a row. Every content bite ("learn") must be followed by a "recall", "check", or "scenario" card so the learner always does something after reading.
- Every "check" and "scenario" card must include a one-sentence "why" explaining the correct answer, and 2-4 "options".
- Include exactly one "recap" card, and it must be the LAST card, with 3-5 bullet "points".
- If the content is about HR, compliance, or policy, include at least one "scenario" card — a realistic "what would you do" situation.

Card types and exact shapes:
{"type":"learn","heading":"...","body":"...","highlight":"... (optional)"}
{"type":"recall","prompt":"...","answer":"..."}
{"type":"check","prompt":"...","options":["...","..."],"correct":0,"why":"..."}
{"type":"scenario","prompt":"...","options":["...","..."],"correct":0,"why":"..."}
{"type":"recap","points":["...","...","..."]}

("correct" is a 0-based index into "options".)

Return ONLY a raw JSON object. No markdown, no code blocks, no explanation, no extra text before or after. Use this exact format:
{"cards":[{"type":"learn","heading":"Example heading","body":"Example body text.","highlight":"Example highlight"},{"type":"check","prompt":"Example question?","options":["Option A","Option B"],"correct":0,"why":"Example reason."}]}

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
    } catch (error) {
      lastError = error.message;
    }
  }
  return res.status(429).json({ error: `Quota exceeded on all models. Try again later. (${lastError})` });
}
