export function LangGraphLogoSVG({
  className,
  width,
  height,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      width={width || 40}
      height={height || 44}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M20 2L4 10V22C4 32.5 11 38.5 20 42C29 38.5 36 32.5 36 22V10L20 2Z"
        fill="#0F2B46"
        stroke="#C5961A"
        strokeWidth="1.5"
      />
      <path
        d="M20 5L7 11.5V22C7 30.8 13 36 20 39C27 36 33 30.8 33 22V11.5L20 5Z"
        fill="#0F2B46"
      />
      <path
        d="M20 12L13 30H16.5L17.8 26.5H22.2L23.5 30H27L20 12ZM18.8 23.5L20 19.5L21.2 23.5H18.8Z"
        fill="#C5961A"
      />
      <path
        d="M15 32H25"
        stroke="#C5961A"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
