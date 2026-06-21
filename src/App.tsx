import React, { useEffect, useState, useRef } from "react";
import { Channel } from "./types";
import { HlsPlayer } from "./components/HlsPlayer";
import { Tv, List, Search, Play, HelpCircle, Activity, Star, Share2, Radio, Lock, Copy } from "lucide-react";

type TabType = 'tv' | 'radio' | 'favorites';

const TV_PRESETS = [
  { id: 'th', label: 'THAI (ไทย)', url: 'https://iptv-org.github.io/iptv/countries/th.m3u' },
  { id: 'kr', label: 'KOREA', url: 'https://iptv-org.github.io/iptv/countries/kr.m3u' },
  { id: 'jp', label: 'JAPAN', url: 'https://iptv-org.github.io/iptv/countries/jp.m3u' },
  { id: 'cn', label: 'CHINA', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u' },
  { id: 'asia', label: 'ASIA ZONE', url: 'https://iptv-org.github.io/iptv/regions/asia.m3u' },
  { id: 'eur', label: 'EUROPE', url: 'https://iptv-org.github.io/iptv/regions/eur.m3u' },
  { id: 'amer', label: 'AMERICA', url: 'https://iptv-org.github.io/iptv/regions/amer.m3u' },
  { id: 'movies', label: 'MOVIES', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'sports', label: 'SPORTS', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { 
    id: 'adult', 
    label: '🔞 18+ VIP', 
    url: 'vip-channels', 
    isProtected: true, 
    channels: [
      { name: "VIP Channel 1 (Demo)", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", group: "18+ VIP" },
      { name: "VIP Channel 2 (Demo)", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", group: "18+ VIP" }
    ]
  },
];

const RADIO_PRESETS = [
  { 
    id: 'r-th', 
    label: 'THAI RADIO', 
    url: 'radio-th', 
    channels: [
      { name: "Hitz 955", url: "https://mcotrc01.ice.infomaniak.ch/mcotrc01.mp3", logo: "https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png", group: "Thai Radio" },
      { name: "Eazy FM 105.5", url: "https://mcotrc02.ice.infomaniak.ch/mcotrc02.mp3", logo: "https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png", group: "Thai Radio" },
      { name: "Green Wave 106.5", url: "https://mcotrc03.ice.infomaniak.ch/mcotrc03.mp3", logo: "https://cdn.pixabay.com/photo/2013/07/12/18/17/radio-153212_1280.png", group: "Thai Radio" }
    ]
  },
  { 
    id: 'r-global', 
    label: 'GLOBAL RADIO', 
    url: 'radio-global',
    channels: [
      { name: "BBC Radio 1", url: "https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one", group: "Global Radio" },
      { name: "Capital FM", url: "https://icecast.thisisdax.com/CapitalUKMP3", group: "Global Radio" },
      { name: "Heart FM", url: "https://icecast.thisisdax.com/HeartUKMP3", group: "Global Radio" }
    ]
  },
];

export default function App() {
  const [playlistUrl, setPlaylistUrl] = useState("https://iptv-org.github.io/iptv/countries/th.m3u");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [useProxy, setUseProxy] = useState(false);
  
  const [activeTab, setActiveTab] = useState<TabType>('tv');
  const [favorites, setFavorites] = useState<Channel[]>(() => {
    try {
      const item = localStorage.getItem('iptv_favorites');
      return item ? JSON.parse(item) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('iptv_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (channel: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      if (prev.find(c => c.url === channel.url)) {
        return prev.filter(c => c.url !== channel.url);
      }
      return [...prev, channel];
    });
  };

  const fetchPlaylist = async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      // First try the backend proxy (if running in full-stack mode)
      let res;
      try {
        res = await fetch("/api/parse-m3u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
      } catch (e) {
        // Network error reaching proxy
      }
      
      if (res && res.ok) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setChannels(data.channels);
        return data.channels;
      }

      // Fallback: Client-side parsing (for static Vercel deployments)
      const directRes = await fetch(url);
      if (!directRes.ok) throw new Error("Failed to load playlist directly.");
      const text = await directRes.text();
      
      const lines = text.split(/\r?\n/);
      const parsedChannels: Channel[] = [];
      let currentChannel: Partial<Channel> = {};

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
            parsedChannels.push(currentChannel as Channel);
            currentChannel = {};
          }
        }
      }
      setChannels(parsedChannels);
      return parsedChannels;
      
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylist = (presetOrUrl: typeof TV_PRESETS[0] | string | any) => {
    if (typeof presetOrUrl === 'string') {
      setPlaylistUrl(presetOrUrl);
      fetchPlaylist(presetOrUrl).then(channels => {
        if (channels && channels.length > 0) setSelectedChannel(channels[0]);
      });
      return;
    }

    const preset = presetOrUrl;
    if (preset.isProtected) {
      const pwd = window.prompt("กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน 18+ VIP (0909142651)");
      if (pwd !== "0909142651") {
        alert("รหัสผ่านไม่ถูกต้อง");
        return;
      }
    }
    setPlaylistUrl(preset.url);

    if (preset.channels) {
       // Direct load from built-in channels
       setChannels(preset.channels);
       if (preset.channels.length > 0) setSelectedChannel(preset.channels[0]);
    } else {
      fetchPlaylist(preset.url).then(channels => {
        if (channels && channels.length > 0) setSelectedChannel(channels[0]);
      });
    }
  };

  // Initial load from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pUrl = params.get("playlist") || "https://iptv-org.github.io/iptv/countries/th.m3u";
    const cUrl = params.get("channel");
    
    // Check if loading adult from URL
    if (pUrl.toLowerCase().includes("adult") || pUrl.toLowerCase().includes("vip-channels") || pUrl.toLowerCase().includes("xxx")) {
       const pwd = window.prompt("กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน 18+ VIP (0909142651)");
       if (pwd !== "0909142651") {
          alert("รหัสผ่านไม่ถูกต้อง");
          return;
       }
    }

    // Is it a static predefined literal?
    const allPresets = [...TV_PRESETS, ...RADIO_PRESETS];
    const matchingPreset = allPresets.find(p => p.url === pUrl);
    
    if (matchingPreset && matchingPreset.channels) {
      setPlaylistUrl(matchingPreset.url);
      setChannels(matchingPreset.channels);
      if (cUrl) {
         const found = matchingPreset.channels.find(c => c.url === cUrl);
         if (found) setSelectedChannel(found);
         else if (matchingPreset.channels.length > 0) setSelectedChannel(matchingPreset.channels[0]);
      } else if (matchingPreset.channels.length > 0) {
         setSelectedChannel(matchingPreset.channels[0]);
      }
    } else {
      setPlaylistUrl(pUrl);
      fetchPlaylist(pUrl).then(data => {
        if (cUrl && data) {
          const found = data.find((c: Channel) => c.url === cUrl);
          if (found) setSelectedChannel(found);
          else if (data.length > 0) setSelectedChannel(data[0]);
        } else if (data && data.length > 0) {
          setSelectedChannel(data[0]);
        }
      });
    }
  }, []);

  // Update URL on change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (playlistUrl !== "https://iptv-org.github.io/iptv/countries/th.m3u" || params.has("playlist")) {
      params.set("playlist", playlistUrl);
    }
    if (selectedChannel) {
      params.set("channel", selectedChannel.url);
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [playlistUrl, selectedChannel]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const getDisplayChannels = () => {
    let source = activeTab === 'favorites' ? favorites : channels;
    return source.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.group && c.group.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  };

  const filteredChannels = getDisplayChannels();

  const shareCurrentChannel = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("คัดลอกลิงก์แชร์สำเร็จ สามารถส่งให้เพื่อนดูได้เลย!");
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#050505] text-[#e0e0e0] font-sans overflow-hidden">
      
      {/* Left Sidebar - Channels List */}
      <div className="w-full md:w-[340px] bg-[#0a0a0f] flex flex-col border-r border-white/5 shadow-2xl z-20 flex-shrink-0 transition-transform h-1/2 md:h-full pb-0 md:pb-0">
        <div className="p-6 md:p-8 pb-4 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                <Tv className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold tracking-tight text-white">ASIA STREAM</h1>
                <span className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold">M3U Parser Engine v2.0</span>
              </div>
            </div>
            {selectedChannel && (
              <button 
                onClick={shareCurrentChannel}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white transition-colors"
                title="Share Current Channel"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Main Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {(['tv', 'radio', 'favorites'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all
                  ${activeTab === tab ? "bg-blue-600 text-white shadow-md" : "text-white/50 hover:bg-white/10"}`}
              >
                {tab === 'tv' && 'TV'}
                {tab === 'radio' && 'RADIO'}
                {tab === 'favorites' && 'FAVORITES'}
              </button>
            ))}
          </div>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={handleSearch}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 text-white placeholder-white/40 transition-all"
            />
          </div>

          {activeTab !== 'favorites' && (
            <div className="flex gap-2 w-full overflow-x-auto custom-scrollbar pb-1">
              {(activeTab === 'tv' ? TV_PRESETS : RADIO_PRESETS).map(p => (
                <button
                  key={p.id}
                  onClick={() => loadPlaylist(p.url, (p as any).isProtected)}
                  className={`px-3 py-1 flex-shrink-0 text-[11px] font-bold rounded-full transition-colors ${playlistUrl === p.url ? "bg-blue-600 text-white" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          
          {/* CORS Proxy Toggle */}
          <div className="flex items-center justify-between bg-blue-900/10 border border-blue-500/20 p-3 rounded-lg">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-blue-400">CORS Bypass Proxy</span>
              <span className="text-[10px] text-white/40">แก้ปัญหาช่องที่จอค้างดูไม่ได้</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={useProxy}
                onChange={() => setUseProxy(!useProxy)}
              />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <Activity className="w-6 h-6 animate-spin text-blue-500" />
              <span>Parsing M3U...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
              {error}
            </div>
          ) : filteredChannels.length > 0 ? (
            filteredChannels.map((channel, i) => {
              const isFav = favorites.find(f => f.url === channel.url);
              return (
                <button
                  key={`${channel.url}-${i}`}
                  onClick={() => setSelectedChannel(channel)}
                  className={`group relative flex w-full items-center p-3 rounded-xl border text-left transition-colors
                    ${selectedChannel?.url === channel.url 
                      ? "bg-blue-600/10 border-blue-500/30" 
                      : "bg-white/5 border-transparent hover:bg-white/10"}`}
                >
                  <div className={`relative flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden p-1 mr-4 transition-colors
                    ${selectedChannel?.url === channel.url ? "bg-white" : "bg-[#222]"}`}>
                    {channel.logo ? (
                      <img 
                        src={channel.logo} 
                        alt={channel.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className={`w-full h-full rounded flex items-center justify-center font-black text-[10px]
                        ${selectedChannel?.url === channel.url ? "bg-[#f0f0f0] text-blue-900" : "bg-[#333] text-white"}`}>
                          {channel.name.substring(0,3).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pr-8">
                    <div className={`text-sm font-bold truncate ${selectedChannel?.url === channel.url ? "text-white" : "text-white/70"}`}>
                      {channel.name}
                    </div>
                    <div className={`text-[11px] truncate mt-0.5 ${selectedChannel?.url === channel.url ? "text-blue-400" : "text-white/30"}`}>
                      {channel.group || "IPTV Channel"}
                    </div>
                  </div>
                  
                  {/* Favorite Toggle button */}
                  <div 
                    onClick={(e) => toggleFavorite(channel, e)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full transition-colors z-10"
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    <Star className={`w-4 h-4 ${isFav ? "fill-yellow-500 text-yellow-500" : "text-white/30"}`} />
                  </div>
                </button>
              );
            })
          ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                {activeTab === 'favorites' ? (
                  <>
                    <Star className="w-8 h-8 opacity-50" />
                    <span>No favorites added yet</span>
                  </>
                ) : (
                  <>
                    <HelpCircle className="w-8 h-8 opacity-50" />
                    <span>No channels active</span>
                  </>
                )}
             </div>
          )}
        </div>
        
        {/* Simple URL Loader Input */}
        <div className="p-6 bg-black/40 border-t border-white/5 mt-auto">
          <div className="flex items-center justify-between text-[11px] text-white/40 mb-4 flex-wrap gap-2">
            <span>Total Channels: {channels.length}</span>
            <span className="flex items-center gap-1 font-mono text-green-500"><div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div> SYSTEM READY</span>
          </div>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const url = formData.get("url") as string;
              if (url) {
                loadPlaylist(url);
              }
            }}
            className="flex gap-2"
          >
             <input
              name="url"
              type="url"
              defaultValue={playlistUrl}
              placeholder="Paste M3U URL..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/50 text-white placeholder-white/40 min-w-0"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg text-xs font-bold transition-colors text-white whitespace-nowrap"
            >
              Load
            </button>
          </form>
        </div>
      </div>

      {/* Right Side - Video Player */}
      <div className="flex-1 bg-black relative flex flex-col h-1/2 md:h-full z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#0f0f12] flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/20 to-transparent pointer-events-none"></div>
            
            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

            {selectedChannel ? (
            <div className="relative z-20 w-full h-full flex flex-col group/player">
                <HlsPlayer 
                  url={useProxy && !selectedChannel.url.toLowerCase().endsWith('.mp3') && !selectedChannel.url.toLowerCase().endsWith('.aac') ? `/api/proxy?url=${encodeURIComponent(selectedChannel.url)}` : selectedChannel.url} 
                  originalUrl={selectedChannel.url}
                />
                
                {/* OSD (On-Screen Display) for TV overlay style */}
                <div className="absolute bottom-0 inset-x-0 p-4 md:p-8 pt-24 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none opacity-0 group-hover/player:opacity-100 transition-opacity duration-500 sm:opacity-100 flex flex-col justify-end">
                  <div className="bg-black/80 backdrop-blur-2xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-3xl pointer-events-auto">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div className="flex gap-4 md:gap-6 items-center md:items-end">
                        {selectedChannel.logo && (
                            <div className="hidden md:flex w-16 h-16 bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/10 flex-shrink-0 items-center justify-center">
                              <img src={selectedChannel.logo} alt="Logo" className="w-full h-full object-contain" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl md:text-3xl font-bold text-white mb-2">{selectedChannel.name}</h2>
                            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-[10px] md:text-xs text-white/50 font-medium uppercase tracking-widest">
                            {selectedChannel.group && (
                                <span className="bg-white/10 px-2 py-0.5 rounded text-white">{selectedChannel.group}</span>
                            )}
                            <span className="text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded bg-blue-600/10">hls stream</span>
                            <span className="opacity-50">Auto-quality</span>
                            </div>
                        </div>
                      </div>
                      <div className="text-left md:text-right flex-shrink-0">
                        <p className="text-[10px] md:text-xs text-white/40 mb-1 uppercase tracking-widest hidden md:block">Status</p>
                        <div className="flex items-center gap-2 md:justify-end bg-red-600/10 border border-red-500/20 px-3 py-1 md:py-1.5 md:px-0 md:bg-transparent md:border-none rounded-full w-fit">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                            <p className="text-xs md:text-sm font-bold text-red-500 md:text-white tracking-widest">LIVE NOW</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
            ) : (
            <div className="relative z-20 flex flex-col items-center justify-center h-full text-white/20">
                <Tv className="w-16 h-16 md:w-24 md:h-24 mb-6 opacity-30" />
                <h2 className="text-xl md:text-2xl font-bold tracking-widest">NO SIGNAL</h2>
                <p className="text-xs md:text-sm mt-2 opacity-50 uppercase tracking-widest px-4 text-center">Select a channel from the guide to begin playback</p>
            </div>
            )}
        </div>
      </div>

      {/* Global generic CSS for scrollbar override */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #374151;
          border-radius: 20px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #4B5563;
        }
      `}</style>
    </div>
  );
}
