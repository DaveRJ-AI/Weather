const WEATHER_CACHE_MS = 5 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 6500;
const cache = new Map();

function json(statusCode, body, maxAge = 120) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${maxAge}`,
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function validCoord(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." }, 0);

  const sourceParams = event.queryStringParameters || {};
  const lat = validCoord(sourceParams.latitude, -90, 90);
  const lon = validCoord(sourceParams.longitude, -180, 180);
  if (lat === null || lon === null) {
    return json(400, { error: "Valid latitude and longitude are required." }, 0);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sourceParams)) {
    if (value !== undefined && value !== null) params.set(key, value);
  }

  const cacheKey = params.toString();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < WEATHER_CACHE_MS) {
    return json(200, { ...cached.data, cached: true }, 300);
  }

  let response;
  let text;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    response = await fetch(`https://api.open-meteo.com/v1/forecast?${cacheKey}`, {
      signal: controller.signal,
    });
    text = await response.text();
  } catch {
    clearTimeout(timeout);
    return json(502, { error: "Weather service is temporarily unavailable." }, 30);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `Weather service failed (${response.status}).`;
    try {
      const errorBody = JSON.parse(text);
      message = errorBody?.reason || errorBody?.error || message;
    } catch {
      if (response.status === 429) message = "Weather service is rate limiting requests. Please try again shortly.";
      if (response.status >= 500) message = "Weather service is temporarily unavailable.";
    }
    return json(response.status === 429 ? 429 : 502, { error: message }, 30);
  }

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return json(502, { error: "Weather service returned non-JSON data." }, 30);
  }

  cache.set(cacheKey, { createdAt: Date.now(), data });
  return json(200, data, 300);
};
