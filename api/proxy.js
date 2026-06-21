module.exports = async function handler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("No URL provided");

  let urlObj;
  try {
    urlObj = new URL(targetUrl);
  } catch {
    return res.status(400).send("Invalid URL");
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": urlObj.origin
      }
    });

    if (!response.ok) {
       return res.status(response.status).send(`Failed to fetch proxy target: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (contentType.includes("mpegurl") || targetUrl.includes(".m3u8")) {
      const text = await response.text();
      const baseUrl = new URL(targetUrl);
      
      const lines = text.split(/\r?\n/);
      const rewrittenLines = lines.map(line => {
         const trimmed = line.trim();
         if (trimmed && !trimmed.startsWith("#")) {
             try {
                 const absUrl = new URL(trimmed, baseUrl).toString();
                 return `/api/proxy?url=${encodeURIComponent(absUrl)}`;
             } catch { return line; }
         }
         return line;
      });
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(rewrittenLines.join("\n"));
    } else {
      res.setHeader("Content-Type", contentType);
      const buffer = await response.arrayBuffer();
      return res.status(200).send(Buffer.from(buffer));
    }
  } catch (err) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
}
