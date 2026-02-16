interface LoadingProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Loading({ message = "読み込み中...", size = "md", className = "" }: LoadingProps) {
  const sizeMap = {
    sm: "text-3xl",
    md: "text-5xl",
    lg: "text-7xl",
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}>
      <style jsx>{`
        @keyframes shuttleBounce {
          0%, 100% { transform: translateY(0) rotate(-10deg); }
          50% { transform: translateY(-20px) rotate(10deg); }
        }
        @keyframes wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .shuttle-bounce {
          animation: shuttleBounce 1.2s ease-in-out infinite;
        }
        .wave-text span {
          display: inline-block;
          animation: wave 1.5s ease-in-out infinite;
        }
        .wave-text span:nth-child(1) { animation-delay: 0s; }
        .wave-text span:nth-child(2) { animation-delay: 0.1s; }
        .wave-text span:nth-child(3) { animation-delay: 0.2s; }
        .wave-text span:nth-child(4) { animation-delay: 0.3s; }
        .wave-text span:nth-child(5) { animation-delay: 0.4s; }
      `}</style>

      <div className={`shuttle-bounce ${sizeMap[size]}`}>
        🏸
      </div>

      <div className="wave-text text-lg font-bold text-indigo-600">
        <span>F</span>
        <span>o</span>
        <span>c</span>
        <span>'</span>
        <span>s</span>
      </div>

      <p className="text-sm text-slate-600 animate-pulse">{message}</p>
    </div>
  );
}
