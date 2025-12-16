interface SparklineProps {
  data: number[];
  colorClasses: {
    stroke: string;
    fill: string;
  };
  width?: number;
  height?: number;
}

// Map Tailwind color names to hex values
const COLOR_HEX_MAP: Record<string, string> = {
  "blue-400": "#60a5fa",
  "blue-100": "#dbeafe",
  "emerald-400": "#34d399",
  "emerald-100": "#d1fae5",
  "amber-400": "#fbbf24",
  "amber-100": "#fef3c7",
  "rose-400": "#fb7185",
  "rose-100": "#ffe4e6",
  "red-400": "#f87171",
  "red-100": "#fee2e2",
  "indigo-400": "#818cf8",
  "indigo-100": "#e0e7ff",
};

export function Sparkline({
  data,
  colorClasses,
  width = 100,
  height = 32,
}: SparklineProps) {
  const hasData = data.length > 0 && data.some((d) => d > 0);

  // Extract color names from Tailwind classes
  const strokeColorName = colorClasses.stroke.replace("stroke-", "").split("/")[0];
  const fillColorName = colorClasses.fill.replace("fill-", "").replace("/40", "").split("/")[0];

  const strokeHex = COLOR_HEX_MAP[strokeColorName] || "#94a3b8";
  const fillHex = COLOR_HEX_MAP[fillColorName] || "#f1f5f9";

  if (!hasData) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#e2e8f0"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[10px] text-slate-400 fill-slate-400"
          fontSize="10"
          fill="#94a3b8"
        >
          No data
        </text>
      </svg>
    );
  }

  const maxValue = Math.max(...data, 1);
  const minValue = Math.min(...data, 0);
  const range = maxValue - minValue || 1;
  const padding = range * 0.1;

  const points = data.map((value, index) => {
    const x = data.length > 1 ? (index / (data.length - 1)) * width : width / 2;
    const normalizedValue = (value - minValue + padding) / (range + padding * 2);
    const y = height - normalizedValue * height;
    return { x, y };
  });

  // Build path string
  const pathData = points.map((point, index) => {
    return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
  }).join(" ");

  // Build area path (closed path)
  const areaPath = `${pathData} L ${width} ${height} L 0 ${height} Z`;

  const lastPoint = points[points.length - 1];

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Area fill */}
      <path
        d={areaPath}
        fill={fillHex}
        fillOpacity="0.4"
      />
      {/* Line */}
      <path
        d={pathData}
        fill="none"
        stroke={strokeHex}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="3"
          fill={strokeHex}
        />
      )}
    </svg>
  );
}
