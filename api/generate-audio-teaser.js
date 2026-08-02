import { config as appConfig } from './config.js';
import { applyCors, verifyAuthUser } from './_auth.js';

// Audio generation runs slower than text — this endpoint gets its own longer
// Vercel execution budget instead of reusing the 10s UPSTREAM_TIMEOUT_MS from the
// other Gemini routes (generate-lesson.js / generate-questions.js).
export const config = { maxDuration: 30 };

const UPSTREAM_TIMEOUT_MS = 25000;
const TTS_VOICE = 'Kore';

// gemini-flash-lite-latest deliberately excluded here (unlike the text-generation
// endpoints) — verified 2026-08-02 to intermittently hang for the full timeout on this
// prompt shape, which is too risky inside this endpoint's tight 30s total budget across
// two chained Gemini calls. gemini-2.5-flash needs thinkingConfig below to stay fast.
const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];
const TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'];

async function callWithFallback(models, apiKey, buildBody) {
  let lastError = 'All models failed';
  let hadQuotaError = false;
  let retryDelay = null;
  for (const model of models) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody(model)),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        }
      );
      if (geminiRes.ok) return { ok: true, data: await geminiRes.json() };
      const err = await geminiRes.json().catch(() => ({}));
      if (geminiRes.status === 429 || geminiRes.status === 503) {
        hadQuotaError = true;
        retryDelay = err?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay || retryDelay;
      }
      lastError = err?.error?.message || geminiRes.statusText;
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? `${model} timed out` : error.message;
    }
  }
  return { ok: false, hadQuotaError, retryDelay, lastError };
}

function pcmToWav(pcmBuffer, sampleRate, numChannels, bitsPerSample) {
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function quotaResponse(res, hadQuotaError, retryDelay, lastError) {
  if (hadQuotaError) {
    const waitMsg = retryDelay ? ` Please wait ${retryDelay} and try again.` : ' Try again later.';
    return res.status(429).json({ error: `Quota exceeded on all models.${waitMsg} (${lastError})` });
  }
  return res.status(502).json({ error: `Could not reach Gemini on any model. (${lastError})` });
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  let apiKey;
  try {
    apiKey = appConfig.geminiApiKey;
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const { text, courseTitle } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Step 1: condense the course content into a short spoken script.
  const scriptPrompt = `You are writing a short, upbeat audio teaser to hook someone into starting the training course "${courseTitle || 'this course'}".

Use ONLY facts present in the source content below — do not invent details, numbers, or examples.
Write natural spoken language (no bullet points, no headings, no markdown), about 65-75 words, meant to be read aloud in roughly 25 seconds.
End with a short, inviting call to action.
Return ONLY the script text — no title, no quotation marks, no explanation.

Source content:
${String(text).slice(0, 6000)}`;

  const scriptResult = await callWithFallback(TEXT_MODELS, apiKey, (model) => ({
    contents: [{ parts: [{ text: scriptPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      // gemini-2.5-flash spends part of its output budget on internal reasoning by
      // default, which starved the actual script text at a smaller token budget.
      // Disabling it also cuts response time roughly 10x. gemini-flash-latest doesn't
      // support this field, so it's only sent for the 2.5 model.
      ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  }));
  if (!scriptResult.ok) {
    return quotaResponse(res, scriptResult.hadQuotaError, scriptResult.retryDelay, scriptResult.lastError);
  }
  const script = scriptResult.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!script) return res.status(502).json({ error: 'Gemini returned an empty teaser script' });

  // Step 2: turn that script into speech.
  const ttsResult = await callWithFallback(TTS_MODELS, apiKey, () => ({
    contents: [{ parts: [{ text: `Say in an upbeat, welcoming tone: ${script}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
    },
  }));
  if (!ttsResult.ok) {
    return quotaResponse(res, ttsResult.hadQuotaError, ttsResult.retryDelay, ttsResult.lastError);
  }

  const part = ttsResult.data.candidates?.[0]?.content?.parts?.[0];
  const audioB64 = part?.inlineData?.data;
  if (!audioB64) return res.status(502).json({ error: 'Gemini returned no audio data' });

  const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType || '');
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  const wavBuffer = pcmToWav(Buffer.from(audioB64, 'base64'), sampleRate, 1, 16);

  return res.status(200).json({
    audioBase64: wavBuffer.toString('base64'),
    mimeType: 'audio/wav',
    script,
  });
}
