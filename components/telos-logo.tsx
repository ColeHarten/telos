export default function TelosLogo({
  size = 48,
  color = "#0F172A",
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      {...props}
    >
      {/* Top Bar */}
      <rect
        x="8"
        y="14"
        width="496"
        height="30"
        rx="15"
        fill={color}
      />

      {/* Left Upper Bar */}
      <rect
        x="8"
        y="90"
        width="260"
        height="30"
        rx="15"
        fill={color}
      />

      {/* Right Upper Bar */}
      <rect
        x="314"
        y="90"
        width="190"
        height="30"
        rx="15"
        fill={color}
      />

      {/* Left Inner Bar */}
      <rect
        x="8"
        y="170"
        width="180"
        height="30"
        rx="15"
        fill={color}
      />

      {/* Right Inner Bar */}
      <rect
        x="314"
        y="170"
        width="190"
        height="30"
        rx="15"
        fill={color}
      />

      {/* Main U Shape */}
      <path
        d="
          M160 170
          H192
          V472
          H352
          V170
          H384
          V488
          Q384 504 368 504
          H176
          Q160 504 160 488
          Z
        "
        fill={color}
      />

      {/* Center Stem */}
      <rect
        x="240"
        y="90"
        width="32"
        height="352"
        rx="16"
        fill={color}
      />
    </svg>
  );
}