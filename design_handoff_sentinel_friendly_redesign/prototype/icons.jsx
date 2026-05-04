/* Tiny SVG icon set — line icons, friendly stroke */
const ic = (path, opts = {}) => ({ size = 18, className = "", strokeWidth = 1.8, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
       className={className} {...rest}>
    {typeof path === "string" ? <path d={path} /> : path}
  </svg>
);

const Icon = {
  Home:    ic("M3 11l9-8 9 8M5 9.5V21h14V9.5"),
  Plus:    ic("M12 5v14M5 12h14"),
  Send:    ic("M5 12l14-7-5 14-3-6-6-1z"),
  Mic:     ic(<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>),
  Stop:    ic(<rect x="6" y="6" width="12" height="12" rx="2"/>),
  Square:  ic(<rect x="6" y="6" width="12" height="12" rx="2"/>),
  Check:   ic("M5 12l5 5 9-12"),
  X:       ic("M6 6l12 12M18 6L6 18"),
  Upload:  ic("M12 16V4M6 10l6-6 6 6M5 20h14"),
  File:    ic(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></>),
  Camera:  ic(<><path d="M4 8h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4"/></>),
  Shield:  ic("M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7z"),
  Heart:   ic("M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1.5 5 3 1.5-1.5 3-3 5-3 4 0 6.5 4 4.5 8C19 16.5 12 21 12 21z"),
  Chat:    ic("M21 12a8 8 0 1 1-3-6.2L21 5l-1 4A8 8 0 0 1 21 12z"),
  ArrowR:  ic("M5 12h14M13 5l7 7-7 7"),
  ArrowU:  ic("M12 19V5M5 12l7-7 7 7"),
  Sparkle: ic("M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z"),
  Phone:   ic("M22 16.9v3a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 19 19 0 0 1-6-6A19 19 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2L8 9.4a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2z"),
  Volume:  ic("M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"),
  VolMute: ic("M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"),
  Edit:    ic("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"),
  History: ic(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M3 12a9 9 0 0 1 1.5-5"/></>),
  Menu:    ic("M3 6h18M3 12h18M3 18h18"),
  Close:   ic("M6 6l12 12M18 6L6 18"),
  Info:    ic(<><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>),
  Clock:   ic(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
  Money:   ic(<><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 10v4M17 10v4"/></>),
  Doc:     ic(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></>),
  Heartbeat: ic("M3 12h4l2-5 4 10 2-5h6"),
  Family:  ic(<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 1.5-3 3-3s3 1 3 3"/></>),
  Bolt:    ic("M13 2L4 14h7l-1 8 9-12h-7l1-8z"),
};

window.Icon = Icon;
