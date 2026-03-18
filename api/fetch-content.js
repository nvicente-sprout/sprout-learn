// Vercel serverless function — fetches content from YouTube (transcript) or Google Slides (published HTML)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, videoId, presentationId } = req.body || {};

  if (type === 'youtube' && videoId) {
    try {
      const text = await fetchYoutubeTranscript(videoId);
      return res.status(200).json({ text });
    } catch (e) {
      return res.status(200).json({ text: '', error: e.message });
    }
  }

  if (type === 'slides' && presentationId) {
    try {
      const text = await fetchSlidesText(presentationId);
      return res.status(200).json({ text });
    } catch (e) {
      return res.status(200).json({ text: '', error: e.message });
    }
  }

  return res.status(400).json({ error: 'type and videoId or presentationId required' });
}

async function fetchYoutubeTranscript(videoId) {
  // Try the direct timedtext API first (fastest, no HTML scraping)
  for (const lang of ['en', 'en-US', 'en-GB', '']) {
    try {
      const params = new URLSearchParams({ v: videoId, fmt: 'vtt', ...(lang ? { lang } : {}) });
      const r = await fetch(`https://www.youtube.com/api/timedtext?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      });
      if (r.ok) {
        const text = await r.text();
        const cleaned = cleanVtt(text);
        if (cleaned.length > 100) return cleaned;
      }
    } catch {}
  }

  // Fallback: scrape the watch page to find the caption track URL
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!pageRes.ok) throw new Error(`Could not reach YouTube (${pageRes.status})`);
  const html = await pageRes.text();

  // Look for timedtext URLs in the page source
  const urlMatches = [...html.matchAll(/https:\\\/\\\/www\.youtube\.com\\\/api\\\/timedtext[^"\\]*/g)];
  if (!urlMatches.length) {
    throw new Error('No captions found. This video may not have captions, or YouTube blocked the request. Use the manual text option below.');
  }

  // Prefer English track
  const enUrl = urlMatches.find(m => m[0].includes('lang=en') || m[0].includes('lang%3Den'))?.[0]
             || urlMatches[0][0];
  const captionUrl = enUrl.replace(/\\\//g, '/').replace(/\\u0026/g, '&') + '&fmt=vtt';

  const captionRes = await fetch(captionUrl);
  if (!captionRes.ok) throw new Error('Could not download captions');
  return cleanVtt(await captionRes.text());
}

function cleanVtt(vtt) {
  return vtt
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('WEBVTT') && !l.match(/^\d{2}:\d{2}/) && !l.startsWith('NOTE ') && !l.match(/^\d+$/))
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

async function fetchSlidesText(presentationId) {
  const cleanId = presentationId.split('/')[0].split('?')[0];
  const url = `https://docs.google.com/presentation/d/${cleanId}/pub?output=html`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SproutLearn/1.0)' },
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      throw new Error('Presentation not published. In Google Slides: File → Share → Publish to web, then try again.');
    }
    throw new Error(`Could not fetch slides (${res.status})`);
  }

  const html = await res.text();
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  if (text.length < 50) throw new Error('Could not extract text from slides. Ensure the presentation is published to web and contains text content.');
  return text;
}
