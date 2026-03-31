const express = require("express");
const fetch   = require("node-fetch");
const { imageLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// ── Server-side image cache (avoids repeated Unsplash calls) ──────────────────
const imageCache = new Map(); // key -> { images, timestamp }
const CACHE_TTL  = 2 * 60 * 60 * 1000; // 2 hours

// Category → Unsplash search query mapping
const CATEGORY_QUERIES = {
  business:     "professional office business",
  technology:   "technology computer digital",
  finance:      "finance money banking",
  data:         "data analytics charts",
  healthcare:   "healthcare medical doctor",
  ai:           "artificial intelligence technology",
  architecture: "architecture building design",
  nature:       "nature landscape scenery",
  food:         "food restaurant culinary",
  fashion:      "fashion style clothing",
  automobile:   "automobile car vehicle",
  construction: "construction building site",
  education:    "education school learning",
  fitness:      "fitness gym workout",
  sports:       "sports athlete action",
  travel:       "travel destination adventure",
  hospitality:  "hotel hospitality luxury",
  "real-estate":"real estate house property",
  interior:     "interior design home decor",
  logistics:    "logistics shipping warehouse",
  portfolio:    "creative design workspace",
  cloud:        "cloud computing server",
  cybersecurity:"cybersecurity security digital",
  development:  "software development coding",
  branding:     "branding marketing creative",
  social:       "social media content creator",
};

async function fetchFromUnsplash(query, count = 6) {
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_KEY) return getFallbackImages(query, count);

  try {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&count=${count}&orientation=landscape`;
    const res  = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    });
    if (!res.ok) throw new Error(`Unsplash error: ${res.status}`);
    const photos = await res.json();
    return photos.map(p => ({
      id:     p.id,
      url:    p.urls.regular,
      thumb:  p.urls.small,
      credit: p.user.name,
      link:   p.links.html,
    }));
  } catch (err) {
    console.warn("Unsplash fetch failed:", err.message);
    return getFallbackImages(query, count);
  }
}

// Fallback: curated Unsplash photo IDs that never expire (direct photo links)
function getFallbackImages(query, count) {
  const fallbacks = [
    { id:"f1", url:"https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80", thumb:"https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=60", credit:"Unsplash" },
    { id:"f2", url:"https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80", thumb:"https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=400&q=60", credit:"Unsplash" },
    { id:"f3", url:"https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80", thumb:"https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&q=60", credit:"Unsplash" },
    { id:"f4", url:"https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&q=80", thumb:"https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=400&q=60", credit:"Unsplash" },
    { id:"f5", url:"https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80", thumb:"https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&q=60", credit:"Unsplash" },
    { id:"f6", url:"https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80", thumb:"https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&q=60", credit:"Unsplash" },
  ];
  return fallbacks.slice(0, count);
}

// ── GET /api/images/search ────────────────────────────────────────────────────
// Query: category?, query?, count?
router.get("/search", imageLimiter, async (req, res) => {
  const { category, query, count = 6 } = req.query;
  const searchQuery = query || CATEGORY_QUERIES[category] || "professional business";
  const cacheKey    = `${searchQuery}_${count}`;

  // Check cache
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ images: cached.images, source: "cache" });
    }
  }

  const images = await fetchFromUnsplash(searchQuery, parseInt(count));
  imageCache.set(cacheKey, { images, timestamp: Date.now() });
  res.json({ images, source: "unsplash" });
});

// ── POST /api/images/bulk ─────────────────────────────────────────────────────
// Load multiple categories at once (called on app mount)
router.post("/bulk", imageLimiter, async (req, res) => {
  const { categories = [], count = 5 } = req.body;
  if (!Array.isArray(categories) || categories.length > 30)
    return res.status(400).json({ message: "categories must be array of max 30" });

  const result = {};
  const fetchPromises = categories.map(async (cat) => {
    const query    = CATEGORY_QUERIES[cat] || cat;
    const cacheKey = `${query}_${count}`;

    if (imageCache.has(cacheKey)) {
      const cached = imageCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        result[cat] = cached.images;
        return;
      }
    }
    const images = await fetchFromUnsplash(query, parseInt(count));
    imageCache.set(cacheKey, { images, timestamp: Date.now() });
    result[cat] = images;
  });

  // Fetch in parallel (max 5 at a time to respect rate limits)
  const batchSize = 5;
  for (let i = 0; i < fetchPromises.length; i += batchSize) {
    await Promise.all(fetchPromises.slice(i, i + batchSize));
  }

  res.json({ images: result });
});

module.exports = router;
