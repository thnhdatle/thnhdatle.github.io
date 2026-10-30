// Analytics tracker injected into every page of the site by
// site/_plugins/site_analytics.rb. Cookieless: page views are linked into
// sessions on the server from a daily-salted hash.
//
// Beacons (see Beacon in src/worker/ingest.ts):
//   pageview   once per page load
//   ping       every 30 s while the tab is visible and the reader is active
//   leave      when the tab is hidden or the page unloads
//   click / outbound / download / copy   queued, sent with the next ping/leave

(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;
  const endpoint = (script.dataset.api || new URL(script.src).origin) + "/e";

  const IGNORE_KEY = "sa_ignore";
  const PING_MS = 30_000;
  const IDLE_MS = 3 * 60_000;
  const DOWNLOAD = /\.(pdf|bib|zip|gz|tar|tex|docx?|pptx?|xlsx?|csv|ipynb|ps|txt|mp4|mp3)$/i;

  // Visiting any page with ?sa_ignore=1 excludes this browser (e.g. the site
  // owner); ?sa_ignore=0 includes it again.
  try {
    const flag = new URLSearchParams(location.search).get(IGNORE_KEY);
    if (flag === "1") localStorage.setItem(IGNORE_KEY, "1");
    if (flag === "0") localStorage.removeItem(IGNORE_KEY);
    if (localStorage.getItem(IGNORE_KEY) === "1") return;
  } catch {
    // Storage blocked: track normally.
  }
  if (navigator.webdriver) return;

  type Beacon = Record<string, string | number | undefined>;

  const newId = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
  };

  let pv = "";
  let activeMs = 0;
  let visibleSince = 0; // 0 while hidden
  let lastActivity = Date.now();
  let maxScroll = 0;
  let queue: Beacon[] = [];
  let timer: number | undefined;

  const send = (beacons: Beacon[]) => {
    const body = JSON.stringify(beacons);
    // A string body goes out as text/plain, which needs no CORS preflight.
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
      fetch(endpoint, { method: "POST", body, keepalive: true, mode: "no-cors" }).catch(() => {});
    }
  };

  // Active time stops counting after IDLE_MS without input, so a tab left open
  // on a page doesn't count as reading time.
  const tick = () => {
    const now = Date.now();
    if (visibleSince) {
      const idleFrom = lastActivity + IDLE_MS;
      activeMs += Math.max(0, Math.min(now, idleFrom) - visibleSince);
      visibleSince = now;
    }
  };

  const measureScroll = () => {
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    const seen = window.scrollY + window.innerHeight;
    const pct = height <= window.innerHeight ? 100 : Math.round((seen / height) * 100);
    if (pct > maxScroll) maxScroll = Math.min(100, pct);
  };

  const flush = (type: "ping" | "leave") => {
    if (!pv) return;
    tick();
    measureScroll();
    send([...queue, { t: type, pv, d: activeMs, sc: maxScroll }]);
    queue = [];
  };

  const track = (beacon: Beacon) => {
    queue.push({ pv, ...beacon });
    if (queue.length >= 10) flush("ping");
  };

  const startPing = () => {
    clearInterval(timer);
    timer = window.setInterval(() => {
      // Pings keep the "now viewing" list fresh; skip them while idle.
      if (document.visibilityState === "visible" && Date.now() - lastActivity < IDLE_MS) flush("ping");
    }, PING_MS);
  };

  const pageview = () => {
    pv = newId();
    activeMs = 0;
    maxScroll = 0;
    queue = [];
    lastActivity = Date.now();
    visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
    measureScroll();
    send([
      {
        t: "pageview",
        pv,
        u: location.pathname + location.search,
        ti: document.title,
        r: document.referrer || undefined,
        sw: screen.width,
        sh: screen.height,
        l: navigator.language,
      },
    ]);
    startPing();
  };

  const activity = () => {
    const now = Date.now();
    // Coming back from idle: restart the active-time clock.
    if (visibleSince && now - lastActivity >= IDLE_MS) visibleSince = now;
    lastActivity = now;
  };
  for (const name of ["mousemove", "keydown", "touchstart", "wheel", "pointerdown"]) {
    addEventListener(name, activity, { passive: true, capture: true });
  }
  addEventListener(
    "scroll",
    () => {
      activity();
      measureScroll();
    },
    { passive: true },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush("leave");
      visibleSince = 0;
    } else {
      visibleSince = Date.now();
      lastActivity = Date.now();
      flush("ping");
    }
  });
  addEventListener("pagehide", () => flush("leave"));
  // Back/forward cache restores the page without reloading the script.
  addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) pageview();
  });

  const text = (el: Element) =>
    (
      el.getAttribute("data-track") ||
      el.getAttribute("aria-label") ||
      (el as HTMLElement).innerText ||
      el.getAttribute("title") ||
      el.getAttribute("alt") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

  const describe = (el: Element) => {
    let out = el.tagName.toLowerCase();
    if (el.id) out += "#" + el.id;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2) : [];
    if (cls[0]) out += "." + cls.join(".");
    return out;
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const el = target?.closest?.("a[href], button, summary, [role=button], [data-track], input[type=submit]");
    if (!el) return;

    if (el.tagName === "A") {
      const a = el as HTMLAnchorElement;
      const href = a.href;
      const label = text(a) || href;
      if (a.hasAttribute("download") || DOWNLOAD.test(a.pathname)) {
        track({ t: "download", lb: text(a) || decodeURIComponent(a.pathname.split("/").pop() || href), tg: href });
      } else if (a.protocol === "mailto:" || a.protocol === "tel:" || (a.host && a.host !== location.host)) {
        track({ t: "outbound", lb: label, tg: href });
      } else {
        track({ t: "click", lb: label, tg: a.pathname + a.search + a.hash });
      }
      // The page may be about to unload or lose focus to a download/new tab.
      flush("ping");
      return;
    }
    track({ t: "click", lb: text(el), tg: describe(el) });
  };
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("auxclick", (e) => e.button === 1 && onClick(e), { capture: true });

  document.addEventListener("copy", () => {
    const selection = String(window.getSelection() || "")
      .replace(/\s+/g, " ")
      .trim();
    if (selection) track({ t: "copy", lb: selection.slice(0, 120), tg: String(selection.length) });
  });

  pageview();
})();
