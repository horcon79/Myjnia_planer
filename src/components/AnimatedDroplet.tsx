'use client';

export function AnimatedDroplet({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center"
    >
      <style>{`
        @keyframes dropBounce {
          0%, 100% { transform: translateY(-3px) scale(1, 1); }
          45% { transform: translateY(6px) scale(0.92, 1.08); }
          55% { transform: translateY(6px) scale(1.08, 0.92); }
          100% { transform: translateY(-3px) scale(1, 1); }
        }
        @keyframes dropPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        .droplet-anim {
          animation: dropBounce 2.4s ease-in-out infinite, dropPulse 2.4s ease-in-out infinite;
          transform-origin: center bottom;
        }
      `}</style>
      <svg
        viewBox="0 0 64 80"
        className="droplet-anim w-full h-full drop-shadow-[0_4px_8px_rgba(14,165,233,0.4)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="dropGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <radialGradient id="dropShine" cx="35%" cy="30%" r="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          d="M32 2 C32 2 4 38 4 54 C4 69.5 16.5 78 32 78 C47.5 78 60 69.5 60 54 C60 38 32 2 32 2 Z"
          fill="url(#dropGrad)"
        />
        <path
          d="M32 2 C32 2 4 38 4 54 C4 69.5 16.5 78 32 78 C47.5 78 60 69.5 60 54 C60 38 32 2 32 2 Z"
          fill="url(#dropShine)"
        />
        <ellipse cx="22" cy="40" rx="5" ry="9" fill="white" opacity="0.55" />
      </svg>
    </div>
  );
}
