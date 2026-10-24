import { get, send } from "./client.js";

export const getDeals = (filters) => {
  const q = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v != null && v !== false) q.set(k, v);
  });
  return get(`/api/v1/deals?${q}`);
};
export const getHistory = (key) => get(`/api/v1/deals/history?key=${encodeURIComponent(key)}`);
export const saveFeedback = (body) => send("PUT", "/api/v1/feedback", body);

export const startHunt = (params) => send("POST", "/api/v1/hunts", params);
export const stopHunt = () => send("POST", "/api/v1/hunts/stop");
export const getStatus = () => get("/api/v1/status");
export const getAddresses = () => get("/api/v1/addresses");
export const addToCart = (key) => send("POST", "/api/v1/deals/cart", { key });

export const getWatches = () => get("/api/v1/watches");
export const addWatch = (body) => send("POST", "/api/v1/watches", body);
export const removeWatch = (id) => send("DELETE", `/api/v1/watches/${id}`);

export const getHunts = () => get("/api/v1/hunts");
export const getReplay = (id) => get(`/api/v1/hunts/${id}/replay`);
export const getWeekly = () => get("/api/v1/insights/weekly");
export const getCompare = () => get("/api/v1/deals/compare");
export const getHeatmap = () => get("/api/v1/deals/heatmap");

export const getProfile = () => get("/api/v1/profile");
export const saveProfile = (body) => send("PUT", "/api/v1/profile", body);
export const clearProfile = () => send("DELETE", "/api/v1/profile");

export const EXPORT_URL = "/api/v1/export.xlsx";

/** Subscribe to a hunt's server-sent events. Returns the EventSource so callers can close it. */
export function openHuntEvents(huntId, onEvent, onClose) {
  const source = new EventSource(`/api/v1/hunts/${huntId}/events`);
  source.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
    if (event.type === "done") { source.close(); onClose(); }
  };
  source.onerror = () => { source.close(); onClose(); };
  return source;
}
