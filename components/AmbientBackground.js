// Фон из Figma: чёрный + два размытых «холма» (#2F6BFF и #D6E2FF), прижатых
// к низу экрана. Контуры и радиусы размытия — 1:1 из слоёв Rectangle 412/413.
export default function AmbientBackground() {
  return (
    <div aria-hidden="true" className="fixed inset-y-0 left-1/2 -z-10 w-full max-w-md -translate-x-1/2 overflow-hidden pointer-events-none">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 900 1600"
        preserveAspectRatio="xMidYMax meet" style={{ overflow: "visible" }}
      >
        <defs>
          <filter id="glow-a" x="-523" y="0" width="1934" height="1848" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="150" />
          </filter>
          <filter id="glow-b" x="-561" y="0" width="2022" height="1944" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="200" />
          </filter>
        </defs>
        <g transform="translate(0 147)">
          <path
            filter="url(#glow-a)"
            fill="#2F6BFF"
            d="M-223 300C-223 300 -9.34261 1324.29 444 1324.29C897.343 1324.29 1111 300 1111 300V1548H-223V300Z"
          />
        </g>
        <g transform="translate(0 628)">
          <path
            filter="url(#glow-b)"
            fill="#D6E2FF"
            d="M-161 400C-161 400 34.7191 1338.93 450 1338.93C865.281 1338.93 1061 400 1061 400V1544H-161V400Z"
          />
        </g>
      </svg>
    </div>
  );
}
