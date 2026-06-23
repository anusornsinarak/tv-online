import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Readable } from "stream";
import * as cheerio from "cheerio";

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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": urlObj.origin,
          "Accept": "*/*",
          "Connection": "keep-alive"
        },
        signal: AbortSignal.timeout(30000) // Increase connection timeout to 30s
      });

      if (!response.ok) {
        console.warn(`Proxy fail: ${targetUrl} -> ${response.status} ${response.statusText}`);
        return res.status(response.status).send(`Proxy failed to reach target: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Icy-MetaData", "1"); // Helpful for radio streams

      // If it's a playlist, rewrite the inner URLs so they also pass through this proxy
      if (contentType.includes("mpegurl") || contentType.includes("mpegURL") || targetUrl.includes(".m3u8")) {
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
          // Properly cast web stream to node readable if needed
          const nodeStream = Readable.fromWeb(response.body as any);
          nodeStream.pipe(res);
          
          res.on('close', () => {
             // Try to abort the fetch if the client closes connection
             nodeStream.destroy();
          });
        } else {
          res.end();
        }
      }
    } catch (err: any) {
      console.error("Proxy Fetch Error:", err.message);
      if (!res.headersSent) {
        res.status(500).send(`Proxy error: ${err.message}`);
      }
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
#EXTINF:-1 tvg-logo="https://onair.mcot.net/fm95/assets/img/logo-fm95.png" group-title="วิทยุไทย",MCOT FM 95 (ลูกทุ่งมหานคร)
http://61.19.18.232:1935/live/fm95.stream/playlist.m3u8
#EXTINF:-1 tvg-logo="https://onair.mcot.net/fm107/assets/img/logo-met107.png" group-title="วิทยุไทย",Met 107 FM
http://61.19.18.232:1935/live/met107.stream/playlist.m3u8
#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="วิทยุไทย",FM 100.5 (News Network)
http://61.19.18.232:1935/live/fm1005.stream/playlist.m3u8
#EXTINF:-1 tvg-logo="https://www.thisiscat.com/assets/img/logo_cat_orange.png" group-title="วิทยุไทย",Cat Radio
https://cast01.catradio.net/live
#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="วิทยุไทย",Hitz 955
https://bkk-live.teroradio.com/hitz955.mp3
#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="วิทยุไทย",Cool Fahrenheit 93
https://n-node-01.coolism.net/cool
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

  // NungFree / Clean Source Scraping API
  app.get("/api/movies/nungfree/list", async (req, res) => {
    const query = req.query.s as string;
    const catUrl = req.query.srcUrl as string;
    
    let url = "https://www.123-hds.com/";
    if (catUrl) {
       url = catUrl.toString();
    } else if (query) {
       url = `https://www.123-hds.com/?s=${encodeURIComponent(query)}`;
    }
    
    try {
       const response = await fetch(url, {
         headers: {
           "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
         }
       });
       const html = await response.text();
       const $ = cheerio.load(html);
       const movies: any[] = [];

       $(".movies-list .ml-item, article, .item, .box-item").each((i, el) => {
         const title = $(el).find('.title, h2, h3, h4').text().trim() || $(el).find('img').attr('alt');
         const a = $(el).find('a').first();
         const link = a.attr("href");
         const imgEl = $(el).find('img').first();
         
         let img = imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('src');
         // convert relative to absolute if needed
         if (img && img.startsWith('/')) img = "https://www.123-hds.com" + img;
         
         const isNew = i < 8; // Tag the first 8 movies as "NEW"
         
         if (title && link) {
           movies.push({ name: title, url: link, poster: img, group: "NungFree 4K", isNew });
         }
       });

       res.json({ movies });
    } catch (error: any) {
       console.error("NungFree Scrape Error:", error);
       res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/movies/nungfree/stream", async (req, res) => {
    const pageUrl = req.query.url as string;
    if (!pageUrl) return res.status(400).send("No URL");

    try {
      const response = await fetch(pageUrl, {
         headers: {
           "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
         }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const iframe = $("iframe[src*='player'], iframe[src*='embed'], iframe").first().attr("src");
      
      if (iframe) {
         res.json({ streamUrl: iframe });
      } else {
         res.status(404).json({ error: "Stream iframe not found on this page" });
      }
    } catch (error: any) {
      console.error("NungFree Stream Scrape Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // End of parse-m3u route

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
