type PosRegisterIconProps = {
  className?: string
}

/** A compact cash-register mark used by the POS dashboard launcher. */
export function PosRegisterIcon({ className = 'h-5 w-5' }: PosRegisterIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 8.5h24v11H20z" fill="currentColor" opacity="0.88" />
      <path d="M15 18.5h34l6.5 20.2H8.5L15 18.5Z" fill="currentColor" />
      <path
        d="M10.5 39h43v14.5a3 3 0 0 1-3 3h-37a3 3 0 0 1-3-3V39Z"
        fill="currentColor"
        opacity="0.88"
      />
      <path d="M17 45.5h30v5H17z" fill="white" opacity="0.95" />
      <path
        d="M26.8 13.8h10.4M27.8 27.3h8.4c2.2 0 3.9 1.5 3.9 3.5s-1.7 3.5-3.9 3.5h-8.4m4.2-10v13"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16.5" cy="29.4" r="2.1" fill="white" opacity="0.9" />
      <circle cx="47.5" cy="29.4" r="2.1" fill="white" opacity="0.9" />
    </svg>
  )
}
