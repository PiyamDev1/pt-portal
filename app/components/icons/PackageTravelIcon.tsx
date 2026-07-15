type PackageTravelIconProps = {
  className?: string
}

export function PackageTravelIcon({ className = 'h-5 w-5' }: PackageTravelIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M32 6.5c1.1 5.2 4.7 9 10.1 10-5.4 1-9 4.8-10.1 10-1.1-5.2-4.7-9-10.1-10 5.4-1 9-4.8 10.1-10Z"
        fill="currentColor"
      />
      <path
        d="M48.8 7.4c-2.8 4-2.6 8.8.5 12.5-4.7-.6-8.8 1.7-10.8 6.1-.6-4.8-3.9-8.3-8.7-9.2 4.5-1.7 7.1-5.7 6.8-10.6 3 3.8 7.6 4.3 12.2 1.2Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M15.6 20.3a22.5 22.5 0 1 0 33.8 4.4"
        stroke="currentColor"
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <path
        d="m7 33.7 19.8-7.9 4.5-18.8 5.5 18.5 20.2 7.1-19.8 7.8-4.5 18.9-5.5-18.4L7 33.7Z"
        fill="currentColor"
      />
      <path d="m24.1 41.8 9.7-12.1 6.1-4.1-9.7 12.1-6.1 4.1Z" fill="white" />
      <circle cx="32" cy="33.1" r="2.9" fill="white" />
    </svg>
  )
}
