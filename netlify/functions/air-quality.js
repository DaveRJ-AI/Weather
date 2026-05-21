const AIR_QUALITY_CACHE_MS = 6 * 60 * 60 * 1000;
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

function normalizePollutantCode(code) {
  return String(code || "").toUpperCase().replace("PM25", "PM2.5").replace("PM10", "PM10");
}

function pickPrimaryIndex(indexes) {
  if (!Array.isArray(indexes) || !indexes.length) return null;
  return (
    indexes.find((index) => index.code === "usa_epa") ||
    indexes.find((index) => index.code && index.code !== "uaqi") ||
    indexes.find((index) => index.code === "uaqi") ||
    indexes[0]
  );
}

function normalizeAirQualityResponse(payload) {
  const primary = pickPrimaryIndex(payload?.indexes || []);
  const dominantCode = primary?.dominantPollutant || "";
  const dominantPollutant = (payload?.pollutants || []).find((pollutant) => pollutant.code === dominantCode) || null;
  const recommendation =
    payload?.healthRecommendations?.generalPopulation ||
    payload?.healthRecommendations?.elderly ||
    payload?.healthRecommendations?.children ||
    "";

  return {
    dateTime: payload?.dateTime || "",
    regionCode: payload?.regionCode || "",
    index: primary
      ? {
          code: primary.code || "",
          name: primary.displayName || "Air Quality",
          aqi: Number.isFinite(Number(primary.aqi)) ? Number(primary.aqi) : null,
          aqiDisplay: primary.aqiDisplay || (Number.isFinite(Number(primary.aqi)) ? String(primary.aqi) : ""),
          category: primary.category || "",
          dominantPollutant: dominantCode,
        }
      : null,
    dominantPollutant: dominantPollutant
      ? {
          code: normalizePollutantCode(dominantPollutant.code),
          name: dominantPollutant.displayName || normalizePollutantCode(dominantPollutant.code),
          fullName: dominantPollutant.fullName || "",
          concentration: dominantPollutant.concentration || null,
        }
      : dominantCode
      ? { code: normalizePollutantCode(dominantCode), name: normalizePollutantCode(dominantCode), fullName: "", concentration: null }
      : null,
    recommendation,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_POLLEN_API_KEY;
  if (!apiKey) return json(500, { error: "Google Maps API key is not configured." });

  const lat = roundedCoord(event.queryStringParameters?.lat);
  const lon = roundedCoord(event.queryStringParameters?.lon);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return json(400, { error: "Valid latitude and longitude are required." });
  }

  const cacheKey = `${lat}:${lon}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < AIR_QUALITY_CACHE_MS) {
    return json(200, { ...cached.data, cached: true });
  }

  const response = await fetch(`https://airquality.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      universalAqi: true,
      location: { latitude: lat, longitude: lon },
      extraComputations: ["HEALTH_RECOMMENDATIONS", "DOMINANT_POLLUTANT_CONCENTRATION", "LOCAL_AQI"],
      languageCode: "en",
    }),
  });
  const text = await response.text();

  if (!response.ok) {
    let message = `Air quality fetch failed (${response.status}).`;
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
    return json(502, { error: "Air quality service returned non-JSON data." });
  }

  const data = normalizeAirQualityResponse(payload);
  cache.set(cacheKey, { createdAt: Date.now(), data });
  return json(200, data);
};

