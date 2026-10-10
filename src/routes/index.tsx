import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { CameraFrame, MapFrame, PlayerFrame, TitleFrame } from "@/components/landing/frames";
import { InviteFragment, MomentsFragment, PlaybackFragment } from "@/components/landing/fragments";
import { useReducedMotion } from "@/components/landing/paper";
import { SignInButtons } from "@/components/login-form";
import { Logo, LogoSplash } from "@/components/logo";
import { CONTAINER, SignedOutPage } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isAuthenticated) return <Navigate to="/home" replace />;
  // Until auth settles a returning visitor looks signed out; don't flash
  // the sign-in at them on the way to /home.
  if (isLoading) return <LogoSplash />;

  return (
    <SignedOutPage nav={<Nav />} footer={<Footer />}>
      <Hero />
      <HowItWorks />
      <StoryMode />
      <Privacy />
      <Closing />
    </SignedOutPage>
  );
}

// Shared type scale and rules.
const H2 = "font-display text-3xl leading-tight tracking-tight lg:text-4xl";
const BODY = "text-[1.0625rem] leading-relaxed text-stone-600 dark:text-stone-400";
const RULE = "border-t border-stone-900/10 dark:border-white/10";
const SECTION = "scroll-mt-14";

const SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "story-mode", label: "Story mode" },
  { id: "privacy", label: "Privacy" },
] as const;

// "Sign in" brings the hero's buttons into view and focuses the first,
// rather than going anywhere.
function goToSignIn(e: React.MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("sign-in");
  if (!target) return;
  e.preventDefault();
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  target.querySelector("button")?.focus({ preventScroll: true });
}

function Nav() {
  const reduced = useReducedMotion();
  return (
    <nav aria-label="Page" className="ml-auto flex items-center gap-1">
      <ul className="hidden items-center gap-1 md:flex">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <Link
              to="/"
              hash={s.id}
              hashScrollIntoView={reduced ? true : { behavior: "smooth" }}
              className="rounded-md px-3 py-2 text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
      <Button size="sm" asChild className="ml-2 h-8 px-3">
        <a href="#sign-in" onClick={goToSignIn}>
          Sign in
        </a>
      </Button>
    </nav>
  );
}

function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className={cn(CONTAINER, SECTION, "pt-12 pb-16 lg:pt-20 lg:pb-24")}>
      <h1
        id="hero-title"
        className="max-w-[28ch] font-display text-[2.5rem] leading-[1.08] tracking-[-0.02em] text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]"
      >
        Everyone's photos from the trip, in the order it happened.
      </h1>
      <div className="mt-8 grid grid-cols-12 gap-x-6 gap-y-12 lg:mt-12">
        <div className="col-span-12 lg:col-span-4">
          <p className={cn(BODY, "max-w-[60ch]")}>
            Start an experience and invite the people who were there. Each of you adds the moments you caught, with
            where and when they happened. Story-time then plays it back stop by stop, with your route on a map.
          </p>
          <div id="sign-in" className="mt-8">
            <SignInButtons prominent groupClassName="sm:flex-row lg:flex-col" />
          </div>
          <p className="mt-4 text-sm text-stone-500">New here? Signing in creates your account.</p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <PlayerFrame />
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Start an experience",
    text: "Make one for the trip, then add moments as you go or once you're home. A moment is a photo or video with a time and a place, and a note if you want one.",
    fragment: <MomentsFragment />,
  },
  {
    title: "Invite the people who were there",
    text: "Each invite is a link that works once. Choose whether that person can only watch or can add moments from their own camera roll.",
    fragment: <InviteFragment />,
  },
  {
    title: "Play it back",
    text: "Story mode puts everyone's moments in order and plays them stop by stop. Between stops it shows how you got there.",
    fragment: <PlaybackFragment />,
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className={cn(CONTAINER, SECTION)}>
      <div className={cn(RULE, "py-16 lg:py-24")}>
        <h2 id="how-title" className={H2}>
          How it works
        </h2>
        <ol className="mt-10 lg:mt-14">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className={cn("grid grid-cols-12 gap-x-6 gap-y-6 py-10 first:pt-0 last:pb-0 lg:py-12", i > 0 && RULE)}
            >
              <div className="col-span-12 flex gap-5 lg:col-span-5">
                <span aria-hidden className="w-6 shrink-0 font-display text-4xl leading-none text-stone-400 dark:text-stone-500">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-[1.375rem] leading-snug">{step.title}</h3>
                  <p className={cn(BODY, "mt-2 max-w-[60ch]")}>{step.text}</p>
                </div>
              </div>
              <div className="col-span-12 lg:col-span-6 lg:col-start-7">{step.fragment}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const SCENES = [
  {
    title: "The title page",
    text: "It opens with the name and dates typed out on paper, and a line about what happened.",
    frame: <TitleFrame />,
  },
  {
    title: "The route",
    text: "Between stops, the map follows each leg with a marker for how you got there.",
    frame: <MapFrame />,
  },
  {
    title: "The camera",
    text: "At every stop a medium-format camera opens its hood and shows the photos on its ground glass, one after another.",
    frame: <CameraFrame />,
  },
];

function StoryMode() {
  return (
    <section id="story-mode" aria-labelledby="story-title" className={cn(CONTAINER, SECTION)}>
      <div className={cn(RULE, "py-16 lg:py-24")}>
        <div className="grid grid-cols-12 gap-x-6 gap-y-4">
          <h2 id="story-title" className={cn(H2, "col-span-12 lg:col-span-5")}>
            Story mode
          </h2>
          <p className={cn(BODY, "col-span-12 max-w-[60ch] lg:col-span-6 lg:col-start-7")}>
            Press play and the experience runs on its own, like a short film. Or step through it yourself with a scroll,
            a swipe or the arrow keys.
          </p>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 md:grid-cols-3 lg:mt-14">
          {SCENES.map((scene) => (
            <figure key={scene.title}>
              {scene.frame}
              <figcaption className="mt-4">
                <h3 className="font-display text-[1.375rem] leading-snug">{scene.title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-stone-600 dark:text-stone-400">{scene.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// Each line checked against the code: access checks, invites, encryption,
// media serving, archive and delete.
const PROMISES = [
  "Only the people you invite, or anyone holding a link you switch on, can open an experience.",
  "An invite link works once and expires after 7 days.",
  "You decide whether each guest can only watch or can add moments too.",
  "You can take someone's access away at any time.",
  "We encrypt places, notes, links and feelings with a key that belongs to that one experience.",
  "We store photos and videos encrypted and only send them to people with access or a link you switch on.",
  "Archiving an experience closes it to new moments and invites.",
  "Deleting an experience removes its moments and everyone's access along with it.",
];

function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className={cn(CONTAINER, SECTION)}>
      <div className={cn(RULE, "grid grid-cols-12 gap-x-6 gap-y-8 py-16 lg:py-24")}>
        <div className="col-span-12 lg:col-span-4">
          <h2 id="privacy-title" className={H2}>
            Private by default
          </h2>
          <p className={cn(BODY, "mt-3 max-w-[36ch]")}>An experience stays closed until you invite someone to it or switch on a link.</p>
        </div>
        <ul className="col-span-12 grid gap-x-12 sm:grid-cols-2 lg:col-span-8">
          {PROMISES.map((p) => (
            <li key={p} className={cn(RULE, "py-4 text-[1.0625rem] leading-relaxed")}>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="closing-title" className={CONTAINER}>
      <div className={cn(RULE, "grid grid-cols-12 items-end gap-x-6 gap-y-8 py-16 lg:py-24")}>
        <h2 id="closing-title" className={cn(H2, "col-span-12 max-w-[22ch] lg:col-span-7")}>
          Start an experience for your next trip, or the last one.
        </h2>
        <div className="col-span-12 lg:col-span-5 lg:justify-self-end">
          <SignInButtons prominent showError={false} groupClassName="sm:flex-row" />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={CONTAINER}>
      <div className={cn(RULE, "flex flex-wrap items-center gap-x-6 gap-y-2 py-8 text-sm text-stone-600 dark:text-stone-400")}>
        <span className="flex items-center gap-2 text-stone-900 dark:text-stone-100">
          <Logo className="size-5" />
          Story-time
        </span>
        <span>© {new Date().getFullYear()}</span>
        <Link
          to="/"
          hash="top"
          className="ml-auto text-[#c2410c] underline-offset-4 hover:underline dark:text-orange-400"
        >
          Back to top
        </Link>
      </div>
    </footer>
  );
}
