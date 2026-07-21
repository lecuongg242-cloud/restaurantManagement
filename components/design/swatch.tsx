/** Ô màu cho bảng token style-guide. */
export function Swatch({
  name,
  value,
  varName,
  textDark = false,
}: {
  name: string;
  value: string;
  varName: string;
  textDark?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-hairline-soft">
      <div
        className="flex h-16 items-end p-xs"
        style={{ backgroundColor: `var(${varName})` }}
      >
        <span
          className={`text-xs font-medium ${textDark ? "text-ink" : "text-on-dark"}`}
        >
          {value}
        </span>
      </div>
      <div className="bg-canvas px-xs py-xxs">
        <div className="text-xs font-medium text-ink">{name}</div>
        <div className="font-mono text-[11px] text-steel">{varName}</div>
      </div>
    </div>
  );
}
