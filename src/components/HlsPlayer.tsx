import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, Copy, Sun, Volume2, VolumeX, Plus, Minus } from "lucide-react";

interface HlsPlayerProps {
  url: string;
  originalUrl?: string;
  autoPlay?: boolean;
}

export function HlsPlayer({ url, originalUrl, autoPlay = true }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [volume, setVolume] = useState(1);
  const [brightness, setBrightness] = useState(1);

  useEffect(() => {
    if (videoRef.current) {
        videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    let hls: Hls;

    const playVideo = () => {
      if (autoPlay) {
        video.play().catch((err) => {
          console.warn("Auto-play prevented", err);
        });
      }
    };

    setError(null);
    setIsCopied(false);

    let retryCount = 0;
    const MAX_RETRIES = 3;

    const isAudioOrNativeVideo = url.toLowerCase().includes('.mp3') || url.toLowerCase().includes('.aac') || url.toLowerCase().includes('.mp4');

    if (Hls.isSupported() && !isAudioOrNativeVideo) {
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        playVideo();
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (retryCount < MAX_RETRIES) {
                retryCount++;
                setError(`Network error. Retrying... (${retryCount}/${MAX_RETRIES})`);
                hls.startLoad();
              } else {
                setError("Network error: Stream is offline, blocking access, or rejecting Browser CORS.");
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Media error encountered, trying to recover...");
              hls.recoverMediaError();
              break;
            default:
              setError("Stream incompatible with HLS, attempting native fallback...");
              hls.destroy();
              video.src = url;
              video.play().catch(() => {
                setError("Playback failed. Stream format unsupported or offline.");
              });
              break;
          }
        }
      });
    } else {
      // For Safari or iOS where HLS is natively supported, OR for raw audio/video files
      video.src = url;
      video.addEventListener("loadedmetadata", playVideo);
      
      const handleError = () => {
         setError("Native playback failed. Stream may be offline or blocked.");
      };
      video.addEventListener("error", handleError);
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
      video.removeEventListener("loadedmetadata", playVideo);
    };
  }, [url, autoPlay]);

  const displayUrl = originalUrl || url;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(displayUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="relative w-full h-full bg-black group/video flex items-center justify-center overflow-hidden">
      {url ? (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            autoPlay={autoPlay}
          />
          {/* Brightness Overlay */}
          <div 
            className="absolute inset-0 pointer-events-none bg-black transition-opacity duration-200"
            style={{ opacity: 1 - brightness }}
          />
        </>
      ) : (
        <div className="text-gray-500 font-medium">Select a channel to play</div>
      )}

      {/* Side Media Controls */}
      {url && !error && (
        <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 flex flex-col gap-6 opacity-0 group-hover/video:opacity-100 transition-opacity duration-300 z-40 bg-black/60 backdrop-blur-xl border border-white/10 p-3 md:p-4 rounded-3xl pb-6">
          
          {/* Volume Control */}
          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={() => setVolume(v => Math.min(1, v + 0.1))}
              className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
              title="Increase Volume"
            >
              <Plus className="w-4 h-4" />
            </button>
            
            <div className="h-24 w-1.5 bg-white/20 rounded-full relative overflow-hidden flex flex-col justify-end">
              <div 
                className="w-full bg-blue-500 transition-all duration-200"
                style={{ height: `${volume * 100}%` }}
              />
            </div>

            <button 
              onClick={() => setVolume(v => Math.max(0, parseFloat((v - 0.1).toFixed(1))))}
              className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
              title="Decrease Volume"
            >
              <Minus className="w-4 h-4" />
            </button>
            
            <button 
              onClick={() => setVolume(v => v === 0 ? 1 : 0)}
              className="mt-1 p-2 rounded-full hover:bg-white/10 transition-colors"
            >
               {volume > 0 ? <Volume2 className="w-5 h-5 text-white/70" /> : <VolumeX className="w-5 h-5 text-red-500" />}
            </button>
          </div>

          <div className="w-full h-px bg-white/10 my-2"></div>

          {/* Brightness Control */}
          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={() => setBrightness(b => Math.min(1, b + 0.1))}
              className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
              title="Increase Brightness"
            >
              <Plus className="w-4 h-4" />
            </button>
            
            <div className="h-24 w-1.5 bg-white/20 rounded-full relative overflow-hidden flex flex-col justify-end">
               <div 
                 className="w-full bg-yellow-400 transition-all duration-200"
                 style={{ height: `${brightness * 100}%` }}
               />
            </div>

            <button 
              onClick={() => setBrightness(b => Math.max(0.1, parseFloat((b - 0.1).toFixed(1))))}
              className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
              title="Decrease Brightness"
            >
              <Minus className="w-4 h-4" />
            </button>

            <button 
               onClick={() => setBrightness(1)}
               className="mt-1 p-2 rounded-full hover:bg-white/10 transition-colors"
            >
               <Sun className="w-5 h-5 text-white/70" />
            </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Playback Failed</h3>
          <p className="text-red-400 text-sm max-w-sm text-center mb-6">{error}</p>
          
          <div className="flex flex-col items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-4 w-full max-w-md">
            <span className="text-xs text-white/50 uppercase tracking-widest font-bold">Original Stream Source:</span>
            <div className="flex w-full items-center gap-2">
              <input 
                 type="text" 
                 readOnly 
                 value={displayUrl} 
                 className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-white/70 text-xs w-full outline-none truncate font-mono"
              />
              <button 
                onClick={copyToClipboard}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white flex items-center gap-2 shrink-0 transition-colors font-bold"
              >
                {isCopied ? <span>Copied!</span> : <><Copy className="w-3 h-3"/> Copy</>}
              </button>
            </div>
            
            <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
              * หากลองเปิด CORS Proxy แล้วยังเล่นไม่ได้ หมายความว่าลิงก์ต้นทางอาจจะปิดไปแล้ว หรือมีการล็อค IP (Geo-block)<br/>
              * คุณสามารถคัดลอกลิงก์ด้านบนไปลองเปิดใน <b>VLC Media Player</b> เพื่อทดสอบว่าลิงก์ยังทำงานอยู่หรือไม่
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
