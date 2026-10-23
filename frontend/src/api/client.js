/** Thin fetch wrapper: JSON in, JSON out, errors carry the server's `detail` message. */
async function parse(res) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const detail = (await res.json()).detail;
      // FastAPI sends validation problems as a list of {msg}; show them as plain sentences
      message = Array.isArray(detail) ? detail.map((d) => String(d.msg).replace(/^Value error, /, "")).join(" ") : detail || message;
    } catch { /* body was not JSON */ }
    throw new Error(message);
  }
  return res.json();
}

export const get = (url) => fetch(url).then(parse);
export const send = (method, url, body) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) }).then(parse);
