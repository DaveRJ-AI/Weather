const POLLEN_CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=900",
    },
    body: JSON.stringify(body),
  };
}

function roundedCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function safeLevel(indexInfo) {
  if (!indexInfo) return null;
  return {
    code: indexInfo.code || "",
    label: indexInfo.displayName || indexInfo.category || "",
    category: indexInfo.category || "",
    value: Number.isFinite(Number(indexInfo.value)) ? Number(indexInfo.value) : null,
  };
}

function normalizePollenResponse(payload) {
  const day = payload?.dailyInfo?.[0] || null;
  const types = day?.pollenTypeInfo || [];
  const plants = day?.plantInfo || [];

  const typeSummaries = types.map((item) => ({
    code: item.code || "",
    name: item.displayName || item.code || "Pollen",
    inSeason: item.inSeason !== false,
    level: safeLevel(item.indexInfo),
  }));

  const dominant =
    typeSummaries
      .filter((item) => Number.isFinite(Number(item.level?.value)))
      .sort((a, b) => Number(b.level.value) - Number(a.level.value))[0] || null;

  const plantSummaries = plants
    .filter((item) => Number.isFinite(Number(item.indexInfo?.value)))
    .sort((a, b) => Number(b.indexInfo.value) - Number(a.indexInfo.value))
    .slice(0, 3)
    .map((item) => ({
      code: item.code || "",
      name: item.displayName || item.code || "Plant",
      inSeason: item.inSeason !== false,
      level: safeLevel(item.indexInfo),
    }));

  return {
    date: day?.date
      ? [day.date.year, String(day.date.month).padStart(2, "0"), String(day.date.day).padStart(2, "0")].join("-")
      : null,
    overall: dominant?.level || null,
    dominantType: dominant ? dominant.name : "",
    types: typeSummaries,
    plants: plantSummaries,
    recommendation:
      day?.healthRecommendations?.[0] ||
      (dominant?.level?.category
        ? `${dominant.name} pollen is ${dominant.level.category.toLowerCase()} today.`
        : "Pollen details are limited for this location today."),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

  const apiKey = process.env.GOOGLE_POLLEN_API_KEY;
  if (!apiKey) return json(500, { error: "Pollen API key is not configured." });

  const lat = roundedCoord(event.queryStringParameters?.lat);
  const lon = roundedCoord(event.queryStringParameters?.lon);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return json(400, { error: "Valid latitude and longitude are required." });
  }

  const cacheKey = `${lat}:${lon}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < POLLEN_CACHE_MS) {
    return json(200, { ...cached.data, cached: true });
  }

  const params = new URLSearchParams({
    "location.latitude": String(lat),
    "location.longitude": String(lon),
    days: "1",
    key: apiKey,
  });

  const response = await fetch(`https://pollen.googleapis.com/v1/forecast:lookup?${params.toString()}`);
  const text = await response.text();

  if (!response.ok) {
    let message = `Pollen fetch failed (${response.status}).`;
    try {
      const errorBody = JSON.parse(text);
      message = errorBody?.error?.message || message;
    } catch {
      // Keep the generic message when Google returns non-JSON.
    }
    return json(response.status, { error: message });
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return json(502, { error: "Pollen service returned non-JSON data." });
  }

  const data = normalizePollenResponse(payload);
  cache.set(cacheKey, { createdAt: Date.now(), data });
  return json(200, data);
};

