interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: "thick" | "thin";
  showLabel?: boolean;
  colorByValue?: boolean;
}

/**
 * Below this share of the track the fill is not drawn at all: a sliver of a
 * rounded bar reads as a stray coloured dot rather than "a little progress".
 * The figure beside the bar still says exactly where things stand.
 */
const MIN_VISIBLE_PERCENT = 1;

function getColor(percent: number): string {
  if (percent >= 90) return "bg-green-500";
  if (percent >= 80) return "bg-amber-500";
  return "bg-red-500";
}

export default function ProgressBar({
  value,
  max = 100,
  variant = "thick",
  showLabel = false,
  colorByValue = false,
}: ProgressBarProps) {
  const rawPercent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const percent = Math.round(rawPercent);
  const barColor = colorByValue ? getColor(percent) : "bg-indigo-500";
  // The track is rounded and clips the fill, so the fill itself is square:
  // a small value then starts flush with the track's curve instead of being
  // a separate pill.
  const fill =
    rawPercent >= MIN_VISIBLE_PERCENT ? (
      <div
        className={`h-full ${barColor} transition-all`}
        style={{ width: `${rawPercent}%` }}
      />
    ) : null;

  if (variant === "thin") {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          {fill}
        </div>
        <span
          className={`text-sm font-semibold w-12 text-right ${
            colorByValue
              ? percent >= 90
                ? "text-green-600"
                : percent >= 80
                  ? "text-amber-600"
                  : "text-red-600"
              : "text-gray-700"
          }`}
        >
          {percent}%
        </span>
      </div>
    );
  }

  // The label sits above the track, never on it: white text is unreadable on
  // the unfilled part, and dark text on the fill.
  return (
    <div>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-gray-800 tabular-nums">
            {value}/{max} hours
          </span>
          <span className="text-gray-500 tabular-nums">{percent}%</span>
        </div>
      )}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        {fill}
      </div>
    </div>
  );
}
