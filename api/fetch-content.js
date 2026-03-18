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
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!pageRes.ok) throw new Error(`YouTube fetch failed (${pageRes.status})`);
  const html = await pageRes.text();

  // Find caption track base URL — prefer English auto-captions
  const allMatches = [...html.matchAll(/"baseUrl":"(https:\\\/\\\/www\.youtube\.com\\\/api\\\/timedtext[^"]+)"/g)];
  if (!allMatches.length) {
    // Try alternate pattern (sometimes URL is unescaped)
    const altMatch = html.match(/captionTracks.*?"baseUrl":"([^"]+timedtext[^"]+)"/);
    if (!altMatch) throw new Error('No captions available for this video. Make sure the video has auto-generated or manual captions enabled.');
    const rawUrl = altMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    return fetchCaptionVtt(rawUrl);
  }

  // Prefer track with lang=en
  const enMatch = allMatches.find(m => m[1].includes('lang=en') || m[1].includes('lang%3Den'));
  const bestMatch = enMatch || allMatches[0];
  const rawUrl = bestMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  return fetchCaptionVtt(rawUrl);
}

async function fetchCaptionVtt(captionUrl) {
  const vttRes = await fetch(captionUrl + '&fmt=vtt');
  if (!vttRes.ok) throw new Error('Could not fetch captions');
  const vtt = await vttRes.text();

  return vtt
    .split('\n')
    .filter(line =>
      line.trim() &&
      !line.startsWith('WEBVTT') &&
      !line.match(/^\d{2}:\d{2}:\d{2}/) &&
      !line.match(/^\d+$/) &&
      !line.startsWith('NOTE ')
    )
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
      throw new Error('Presentation not published. In Google Slides, go to File → Share → Publish to web, then try again.');
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

  if (text.length < 50) throw new Error('Could not extract text from slides. Ensure the presentation is published to web and contains text.');
  return text;
}
