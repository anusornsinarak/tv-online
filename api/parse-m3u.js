export default async function handler(req, res) {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Handle local mock data for VIP and Radio
    if (url.includes("/api/playlists/")) {
      let mockContent = "";
      if (url.includes("adult.m3u")) {
        mockContent = `#EXTM3U\n#EXTINF:-1 tvg-logo="" group-title="18+ VIP",VIP Channel 1 (Demo)\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n#EXTINF:-1 tvg-logo="" group-title="18+ VIP",VIP Channel 2 (Demo)\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;
      } else if (url.includes("radio-th.m3u")) {
        mockContent = `#EXTM3U\n#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="Thai Radio",Hitz 955\nhttp://mcotrc01.ice.infomaniak.ch/mcotrc01.mp3\n#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="Thai Radio",Eazy FM 105.5\nhttp://mcotrc02.ice.infomaniak.ch/mcotrc02.mp3\n#EXTINF:-1 tvg-logo="https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png" group-title="Thai Radio",Green Wave 106.5\nhttp://mcotrc03.ice.infomaniak.ch/mcotrc03.mp3`;
      } else if (url.includes("radio-global.m3u")) {
        mockContent = `#EXTM3U\n#EXTINF:-1 tvg-logo="" group-title="Global Radio",BBC Radio 1\nhttp://stream.live.vc.bbcmedia.co.uk/bbc_radio_one\n#EXTINF:-1 tvg-logo="" group-title="Global Radio",Capital FM\nhttps://icecast.thisisdax.com/CapitalUKMP3\n#EXTINF:-1 tvg-logo="" group-title="Global Radio",Heart FM\nhttps://icecast.thisisdax.com/HeartUKMP3`;
      }
      
      const parsedChannels = parseM3uText(mockContent);
      return res.status(200).json({ channels: parsedChannels });
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    const text = await response.text();

    const parsedChannels = parseM3uText(text);
    return res.status(200).json({ channels: parsedChannels });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function parseM3uText(text) {
  const lines = text.split(/\r?\n/);
  const parsedChannels = [];
  let currentChannel = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const nameMatch = line.match(/,(.+)$/);

      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : "Unknown Channel",
        logo: logoMatch ? logoMatch[1] : undefined,
        group: groupMatch ? groupMatch[1] : undefined,
      };
    } else if (line && !line.startsWith("#")) {
      if (currentChannel.name) {
        currentChannel.url = line;
        parsedChannels.push(currentChannel);
        currentChannel = {};
      }
    }
  }
  return parsedChannels;
}
