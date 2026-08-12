type IconProps = { className?: string }

function IconSvg({
  className = 'h-4 w-4',
  strokeWidth = '1.6',
  children,
}: IconProps & { strokeWidth?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function SparkIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10 2.5l1.4 3.6L15 7.5l-3.6 1.4L10 12.5 8.6 8.9 5 7.5l3.6-1.4L10 2.5Z" />
      <path d="M4.5 12.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
      <path d="M15.5 11l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
    </IconSvg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8.2h14" />
    </IconSvg>
  )
}

export function WeekIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M7.7 4v12M12.3 4v12M3 8h14" />
    </IconSvg>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6.5 5h9M6.5 10h9M6.5 15h9" />
      <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
    </IconSvg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.8">
      <path d="M11.8 4.5 6.2 10l5.6 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.8">
      <path d="m8.2 4.5 5.6 5.5-5.6 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.7">
      <path d="M15.5 8A5.5 5.5 0 1 0 16 10" strokeLinecap="round" />
      <path d="M13.5 4.8h2.8v2.8" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path
        d="M10 3.2v2.1M10 14.7v2.1M15.1 5.3l-1.5 1.5M6.4 14l-1.5 1.5M16.8 10h-2.1M5.3 10H3.2M15.1 14.7l-1.5-1.5M6.4 6l-1.5-1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="3.1" />
    </IconSvg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.8">
      <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
    </IconSvg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v4l2.7 1.6" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10 17s4.5-4.3 4.5-8A4.5 4.5 0 1 0 5.5 9c0 3.7 4.5 8 4.5 8Z" />
      <circle cx="10" cy="9" r="1.8" />
    </IconSvg>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3.5 5h13l-5.2 5.5v4l-2.6 1v-5L3.5 5Z" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2.8 10s2.7-4.5 7.2-4.5 7.2 4.5 7.2 4.5-2.7 4.5-7.2 4.5S2.8 10 2.8 10Z" />
      <circle cx="10" cy="10" r="2.1" />
    </IconSvg>
  )
}

export function PendingIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v3.8l2.4 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function ConfirmedIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.7">
      <circle cx="10" cy="10" r="6.5" />
      <path d="m7.3 10.2 1.8 1.8 3.6-4" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.7">
      <path
        d="m4.2 13.9 1.2 1.9 2.1-.7 7-7a1.7 1.7 0 0 0-2.4-2.4l-7 7-.9 2.2Z"
        strokeLinejoin="round"
      />
      <path d="m10.8 5.9 3.3 3.3" strokeLinecap="round" />
    </IconSvg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.9">
      <path d="m5.2 10.4 3 3.1 6.6-7" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function DoneIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.8">
      <path d="m3.9 10.5 2.3 2.4 3.5-4.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9.1 10.5 2.3 2.4 4.7-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconSvg {...props} strokeWidth="1.8">
      <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" />
    </IconSvg>
  )
}
