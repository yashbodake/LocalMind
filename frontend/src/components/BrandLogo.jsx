export default function BrandLogo({ size = "md" }) {
  const imgSize = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const titleSize = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt="LocalMind"
        width={size === "sm" ? 28 : 32}
        height={size === "sm" ? 28 : 32}
        className={`${imgSize} rounded-lg object-cover`}
      />
      <div className="flex flex-col leading-none">
        <span className={`font-display font-semibold text-fg ${titleSize} tracking-tight`}>
          LocalMind
        </span>
        <span className="font-mono text-[9px] text-fg-muted mt-0.5">v2.0.0</span>
      </div>
    </div>
  );
}
