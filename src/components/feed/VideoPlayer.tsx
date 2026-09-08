'use client';

import React, { useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string;
  poster?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, poster }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-video border border-slate-800 group shadow-lg">
      <video
        ref={videoRef}
        src={videoUrl}
        poster={poster}
        playsInline
        className="w-full h-full object-cover"
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
      />

      {/* Floating Center Play Button when paused */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs transition-opacity"
        >
          <div className="w-14 h-14 rounded-full bg-amber-500/90 text-slate-950 flex items-center justify-center shadow-xl transform transition hover:scale-110">
            <Play className="w-7 h-7 fill-slate-950 translate-x-0.5" />
          </div>
        </button>
      )}

      {/* Overlay Bottom Controls Bar */}
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={togglePlay}
          className="p-1.5 rounded-lg text-white hover:text-amber-400 transition-colors"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg text-white hover:text-amber-400 transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button
            onClick={handleFullscreen}
            className="p-1.5 rounded-lg text-white hover:text-amber-400 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
