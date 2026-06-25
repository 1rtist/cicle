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
- Read ALL visible text on the item: logos, tags, labels, embroidery, prints, patches. This is almost always the brand or model.
- For clothing/streetwear: check the chest, back, sleeves, collar tag, and graphic prints. Streetwear brands (Supreme, BAPE, Off-White, Barriers, Corteiz, Gallery Dept, etc.) always show their name visually.
- For electronics: check the device body, screen, and visible labels for brand and model number.
- For sneakers: identify brand AND full colorway name (e.g. "Nike Air Jordan 1 Retro High OG Chicago").
- Never guess generically. If you can read text in the image, use it. "Unknown" is a last resort only when truly nothing is visible.

TITLE FORMAT — follow this order exactly: Brand > Item Type > Color > Additional Details > Size
  Example: "Burberry Brit Long Sleeve Button Down Shirt Blue Striped Embroidery Men's XL"
  NEVER start a title with "Vintage" — place it elsewhere in the title if relevant.

SEARCH QUERY — used to find eBay sold listings. Must be specific enough to return relevant comps but short (3-5 words max). Include brand + item type + one key style identifier (collection name, colorway, or distinguishing feature). "Burberry Brit Button Down" not "Burberry blue shirt". "Jordan 1 Chicago" not "Nike red shoe". Specificity beats brevity when the item has a known name.

RETAIL PRICE — use your knowledge of the brand and item to estimate what this item sold for new at retail. If it is a current product, use the current retail price. If discontinued, use the original retail price.

{
  "title": "eBay listing title following Brand > Type > Color > Details > Size format, 60-80 chars",
  "description": "2-3 sentences. Lead with brand and item name. Be specific about colorway, size if visible, and honest about condition.",
  "condition": "one of exactly: New, Like New, Very Good, Good, Acceptable, For Parts",
  "retail_price": <number, original or current retail price USD>,
  "price_low": <number, conservative sold price USD>,
  "price_high": <number, optimistic sold price USD>,
  "price_suggested": <number, recommended list price USD>,
  "category": "eBay category, e.g. Streetwear, Sneakers, Consumer Electronics",
  "brand": "exact brand name read from the item",
  "model": "specific model, colorway, collection, or style name if visible, else Unknown",
  "search_query": "3-5 words: brand + item type + key style identifier. Must be specific enough for good eBay comps.",
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
