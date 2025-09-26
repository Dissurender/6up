import { useEffect, useRef, useState } from "react";

const DEFAULT_URLS = [
  "https://www.youtube.com/watch?v=xKERvEPF898",
  "https://www.youtube.com/watch?v=dAfq7g3JQI8",
  "https://www.youtube.com/watch?v=CDrm8RhonZU",
  "https://www.youtube.com/watch?v=4UkssSAYNIA",
  "https://www.youtube.com/watch?v=-dMtaC5QaUk",
  "https://www.youtube.com/watch?v=en2DcyDUYB4",
];

function extractVideoId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  const cleaned = String(urlOrId)
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "")
    .trim();

  const idRe = /^[A-Za-z0-9_-]{11}$/;
  if (idRe.test(cleaned)) return cleaned; // bare ID

  try {
    const u = new URL(cleaned);
    const host = u.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (idRe.test(id)) return id;
    }

    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (idRe.test(v || "")) return v as string;

      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx !== -1 && idRe.test(parts[embedIdx + 1] || ""))
        return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx !== -1 && idRe.test(parts[shortsIdx + 1] || ""))
        return parts[shortsIdx + 1];
    }
  } catch {
    console.log("");
  }

  const m = cleaned.match(/[A-Za-z0-9_-]{11}/);
  return m ? m[0] : null;
}

function useYouTubeApiReady() {
  const [ready, setReady] = useState<boolean>(
    typeof (window as any).YT !== "undefined" &&
      typeof (window as any).YT.Player !== "undefined"
  );
  useEffect(() => {
    const w = window as any;
    if (ready) return;

    const markReady = () => setReady(true);

    // If API already available, mark ready
    if (w.YT && w.YT.Player) {
      setReady(true);
      return;
    }

    // Hook global callback (idempotent)
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev && prev();
      markReady();
    };

    // Inject script once
    if (
      !document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      )
    ) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }, [ready]);
  return ready;
}

export default function YouTubeSixUp() {
  const NUM = 6;
  const apiReady = useYouTubeApiReady();

  const [urls, setUrls] = useState<string[]>(DEFAULT_URLS);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>(Array(NUM).fill(null));
  const refCallbacks = useRef<((el: HTMLDivElement | null) => void)[]>([]);

  // Create stable ref callbacks for each index
  for (let i = 0; i < NUM; i++) {
    if (!refCallbacks.current[i]) {
      refCallbacks.current[i] = (el: HTMLDivElement | null) => {
        wrapRefs.current[i] = el;
      };
    }
  }
  const players = useRef<any[]>(Array(NUM).fill(null));
  const readyFlags = useRef<boolean[]>(Array(NUM).fill(false));
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const pending = useRef<{ i: number; videoId: string }[]>([]);

  const actuallyCreateOrLoad = (i: number, videoId: string) => {
    const w = window as any;
    const mount = wrapRefs.current[i];
    if (!mount || !w.YT || !w.YT.Player) return;

    mount.innerHTML = "";

    players.current[i] = new w.YT.Player(mount, {
      width: "100%",
      height: "100%",
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        mute: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: (e: any) => {
          readyFlags.current[i] = true;
          try {
            e.target.mute();
            e.target.playVideo();
          } catch {
            console.log("");
          }
        },
      },
    });
  };

  const createOrLoad = (i: number, videoId: string) => {
    if (!apiReady) {
      pending.current.push({ i, videoId });
      return;
    }
    actuallyCreateOrLoad(i, videoId);
  };

  useEffect(() => {
    if (!apiReady) return;
    while (pending.current.length) {
      const job = pending.current.shift()!;
      actuallyCreateOrLoad(job.i, job.videoId);
    }
  }, [apiReady]);

  const loadFromInput = (i: number) => {
    const id = extractVideoId(urls[i]);
    if (!id) {
      alert(`Could not parse a valid YouTube video ID for slot ${i + 1}`);
      return;
    }
    createOrLoad(i, id);
  };

  const loadAll = () => {
    for (let i = 0; i < NUM; i++) loadFromInput(i);
  };

  const setActive = (i: number) => {
    setActiveIdx(i);
    for (let k = 0; k < NUM; k++) {
      const player = players.current[k];
      if (player && readyFlags.current[k]) {
        try {
          if (k === i) {
            player.unMute();
            player.setVolume(100);
          } else {
            player.mute();
          }
        } catch {
          console.log("");
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      players.current.forEach((p) => {
        try {
          p?.destroy?.();
        } catch {}
      });
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("sixup.urls");
    if (saved) setUrls(JSON.parse(saved));
  }, []);
  useEffect(() => {
    localStorage.setItem("sixup.urls", JSON.stringify(urls));
  }, [urls]);

  const reloadTile = (i: number) => {
    try {
      players.current[i]?.destroy?.();
    } catch {}

    const id = extractVideoId(urls[i]);

    if (!id) return;

    actuallyCreateOrLoad(i, id);
    if (activeIdx === i) setTimeout(() => setActive(i), 100);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= NUM) {
        e.preventDefault();
        setActive(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1115] text-[#e6e8ef]">
      <div className="sticky top-0 z-10 grid grid-cols-6 gap-2 p-3 border-b border-[#232838] bg-[#121620]">
        <button
          onClick={loadAll}
          disabled={!apiReady}
          className="rounded-lg border border-[#232838] bg-[#0d1017] px-3 py-2 text-sm disabled:opacity-50"
        >
          {apiReady ? "Load All" : "Loading API…"}
        </button>
        <button
          onClick={() => players.current.forEach((p) => p?.mute?.())}
          className="rounded-lg border border-[#232838] bg-[#0d1017] px-3 py-2 text-sm disabled:opacity-50"
        >
          Mute All
        </button>
        <button
          onClick={() => players.current.forEach((p) => p?.pauseVideo?.())}
          className="rounded-lg border border-[#232838] bg-[#0d1017] px-3 py-2 text-sm disabled:opacity-50"
        >
          Pause All
        </button>
        <button
          onClick={() =>
            players.current.forEach((p) => {
              try {
                p?.mute?.();
                p?.playVideo?.();
              } catch {}
            })
          }
          className="rounded-lg border border-[#232838] bg-[#0d1017] px-3 py-2 text-sm disabled:opacity-50"
        >
          Play All (muted)
        </button>
      </div>

      <div className="text-center text-xs text-[#8b93a7] pb-1">
        Click a tile or press{" "}
        <span className="inline-block rounded border border-[#232838] bg-[#0d1017] px-1 py-[2px] font-mono">
          1–6
        </span>{" "}
        to switch audio. Autoplay starts muted.
      </div>

      <div className="grid grid-cols-1 gap-3 p-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: NUM }).map((_, i) => (
          <div
            key={i}
            className={`relative overflow-hidden rounded-xl border border-[#232838] bg-[#161a22] ${
              activeIdx === i ? "ring-2 ring-[#35c2aa]" : ""
            }`}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button")) return;
              setActive(i);
            }}
          >
            <div className="absolute right-2 top-2 z-10 flex gap-2">
              <button
                onClick={() => reloadTile(i)}
                className="rounded-md border border-[#232838] bg-black/60 px-2 py-1 text-xs"
              >
                Reload
              </button>
              <span className="rounded-full border border-[#232838] bg-black/60 px-2 py-1 text-xs text-[#8b93a7]">
                #{i + 1}
              </span>
            </div>

            <div className="relative grid">
              <div
                className="[grid-area:1/1] w-full"
                style={{ aspectRatio: "16 / 9" }}
              />
              <div
                ref={refCallbacks.current[i]}
                className="[grid-area:1/1] absolute inset-0"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
