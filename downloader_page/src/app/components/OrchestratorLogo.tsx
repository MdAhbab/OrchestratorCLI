export function OrchestratorLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#6366f1", stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#d946ef", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill="url(#grad1)" opacity="0.2" />
      <circle cx="50" cy="50" r="35" fill="url(#grad1)" opacity="0.3" />
      <circle cx="50" cy="50" r="25" fill="url(#grad1)" />
      <path
        d="M50 30 L60 45 L50 40 L40 45 Z"
        fill="white"
        opacity="0.9"
      />
      <path
        d="M50 70 L60 55 L50 60 L40 55 Z"
        fill="white"
        opacity="0.9"
      />
      <circle cx="50" cy="50" r="8" fill="white" />
    </svg>
  );
}
