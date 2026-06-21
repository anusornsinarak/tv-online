import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Readable } from "stream";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy endpoint to bypass CORS for HLS streams (.m3u8 and .ts)
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("No URL provided");

    let urlObj;
    try {
      urlObj = new URL(targetUrl);
    } catch {
      return res.status(400).send("Invalid URL provided to proxy");
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
          "Referer": urlObj.origin
        }
      });

      if (!response.ok) {
         return res.status(response.status).send(`Failed to fetch proxy target: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Access-Control-Allow-Origin", "*");

      // If it's a playlist, rewrite the inner URLs so they also pass through this proxy
      if (contentType.includes("mpegurl") || targetUrl.includes(".m3u8")) {
        const text = await response.text();
        const baseUrl = new URL(targetUrl);
        
        const lines = text.split(/\r?\n/);
        const rewrittenLines = lines.map(line => {
           const trimmed = line.trim();
           // Rewrite direct TS or M3U8 absolute/relative URIs
           if (trimmed && !trimmed.startsWith("#")) {
               try {
                   const absUrl = new URL(trimmed, baseUrl).toString();
                   return `/api/proxy?url=${encodeURIComponent(absUrl)}`;
               } catch { return line; }
           }
           // Rewrite URIs located in #EXT-X tags (e.g. URI="sub_playlist.m3u8" or Keys)
           if (trimmed.startsWith("#EXT-X-") && trimmed.includes('URI=')) {
               return trimmed.replace(/URI="([^"]+)"/, (match, uriParam) => {
                   try {
                       const absUrl = new URL(uriParam, baseUrl).toString();
                       return `URI="/api/proxy?url=${encodeURIComponent(absUrl)}"`;
                   } catch { return match; }
               });
           }
           return line;
        });

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        return res.send(rewrittenLines.join("\n"));
      } else {
        // Stream raw data (.ts video chunks, encryption keys, or infinite radio streams)
        res.setHeader("Content-Type", contentType);
        if (response.body) {
          Readable.fromWeb(response.body as any).pipe(res);
        } else {
          res.end();
        }
      }
    } catch (err: any) {
      console.error("Proxy Fetch Error:", err.message);
      res.status(500).send(`Proxy error: ${err.message}`);
    }
  });

  // Local mock playlists to prevent 404s
  app.get("/api/playlists/adult.m3u", (req, res) => {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(`#EXTM3U
#EXTINF:-1 tvg-logo="" group-title="18+ VIP",VIP Channel 1 (Demo)
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-logo="" group-title="18+ VIP",VIP Channel 2 (Demo)
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`);
  });

  app.get("/api/playlists/radio-th.m3u", (req, res) => {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(`#EXTM3U
#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="Thai Radio",Hitz 955
https://mcotrc01.ice.infomaniak.ch/mcotrc01.mp3
#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="Thai Radio",Eazy FM 105.5
https://mcotrc02.ice.infomaniak.ch/mcotrc02.mp3
#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="Thai Radio",Green Wave 106.5
https://mcotrc03.ice.infomaniak.ch/mcotrc03.mp3
`);
  });

  app.get("/api/playlists/radio-global.m3u", (req, res) => {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(`#EXTM3U
#EXTINF:-1 tvg-logo="" group-title="Global Radio",BBC Radio 1
http://stream.live.vc.bbcmedia.co.uk/bbc_radio_one
#EXTINF:-1 tvg-logo="" group-title="Global Radio",Capital FM
https://icecast.thisisdax.com/CapitalUKMP3
#EXTINF:-1 tvg-logo="" group-title="Global Radio",Heart FM
https://icecast.thisisdax.com/HeartUKMP3
`);
  });

  // API constraints: Parser function on server to bypass CORS for M3U fetching
  app.post("/api/parse-m3u", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      let text = "";
      if (url.startsWith("/api/playlists/")) {
         // Local fetch
         const localUrl = `http://0.0.0.0:3000${url}`;
         const response = await fetch(localUrl);
         if (!response.ok) throw new Error(`Failed to fetch local playlist: ${response.statusText}`);
         text = await response.text();
      } else {
         const response = await fetch(url);
         if (!response.ok) {
           throw new Error(`Failed to fetch from url: ${response.statusText}`);
         }
         text = await response.text();
      }
      
      // Basic M3U parser
      const lines = text.split(/\r?\n/);
      const channels = [];
      let currentChannel: any = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
          currentChannel = {};
          
          // Match tvg-logo
          const logoMatch = line.match(/tvg-logo="([^"]+)"/);
          if (logoMatch) {
            currentChannel.logo = logoMatch[1];
          }
          
          // Match group-title
          const groupMatch = line.match(/group-title="([^"]+)"/);
          if (groupMatch) {
            currentChannel.group = groupMatch[1];
          }

          // Match channel name
          const commaIndex = line.lastIndexOf(',');
          if (commaIndex !== -1) {
            currentChannel.name = line.substring(commaIndex + 1).trim();
          } else {
            currentChannel.name = "Unknown Channel";
          }
        } else if (line && !line.startsWith('#')) {
          // This should be the URL
          if (currentChannel) {
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = null; // reset for the next
          }
        }
      }

      res.json({ channels });
    } catch (error: any) {
      console.error("M3U Fetch Error:", error);
      res.status(500).json({ error: error.message || "Failed to parse M3U" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
