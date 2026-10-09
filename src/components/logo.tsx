import { cn } from "@/lib/utils";

// A clock face inside a rounded square: moments over time.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        strokeWidth="2.4"
        className="stroke-primary-foreground"
      />
      <path
        d="M16 11v5.2l3.4 2"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}

// The logo, centered and gently pulsing: the first paint, and the moment
// before we know whether someone is signed in.
export function LogoSplash() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-svh items-center justify-center">
      <Logo className="size-10 animate-pulse" />
    </div>
  );
}
