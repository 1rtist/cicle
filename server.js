require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

app.post('/api/analyze', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });

  const { imageData, mediaType, extraNotes } = req.body;
  if (!imageData) return res.status(400).json({ error: 'imageData required' });

  const ctx = extraNotes ? `\n\nSeller context: ${extraNotes}` : '';

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageData } },
            { type: 'text', text: `You are an expert reseller who specializes in identifying items for eBay listings. Analyze this item photo carefully and return ONLY a valid JSON object — no markdown, no backticks, no explanation.${ctx}

CRITICAL INSTRUCTIONS:
- Read ALL visible text on the item: logos, tags, labels, embroidery, prints, patches — anything. This text is almost always the brand or model.
- For clothing/streetwear: check the chest, back, sleeves, collar tag, and any graphic prints. Streetwear brands (Supreme, BAPE, Off-White, Barriers, Corteiz, Gallery Dept, etc.) always show their name visually.
- For electronics: check the device body, screen, and any visible labels for brand and model number.
- For sneakers: identify brand AND colorway name (e.g. "Nike Air Jordan 1 Retro High OG Chicago").
- Never guess generically. If you can read text in the image, use it. "Unknown" is a last resort only when truly nothing is visible.
- The "search_query" field is used to search eBay sold listings. Keep it to 2-4 words MAXIMUM: brand + item type + one identifier if critical. Examples: "Barriers Tupac Hoodie", "Supreme Box Logo Tee", "Air Jordan 1 Chicago", "PS5 Disc Edition". Do NOT include colors, sizes, conditions, adjectives, or extra words. Shorter = better eBay results.

{
  "title": "eBay listing title, 60-80 chars, exact brand first, then item type and key details",
  "description": "2-3 sentences. Lead with brand and item name. Be specific about colorway, size if visible, and honest about condition.",
  "condition": "one of exactly: New, Like New, Very Good, Good, Acceptable, For Parts",
  "price_low": <number, conservative sold price USD>,
  "price_high": <number, optimistic sold price USD>,
  "price_suggested": <number, recommended list price USD>,
  "category": "eBay category, e.g. Streetwear, Sneakers, Consumer Electronics",
  "brand": "exact brand name read from the item — read logos/text carefully",
  "model": "specific model, colorway, or collection name if visible, else Unknown",
  "search_query": "2-4 words MAX: brand + item type only. Examples: \\"Barriers Tupac Hoodie\\" \\"Supreme Box Logo Tee\\" \\"Jordan 1 Chicago\\" \\"Theragun Pro G5\\". NO colors, sizes, conditions, or filler words.",
  "keywords": ["4 to 6 specific search keywords including brand"]
}` }
          ]
        }]
      })
    });

    if (!upstream.ok) {
      const e = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: e?.error?.message || `Anthropic HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    const txt = data.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`cicle running on http://localhost:${PORT}`));
