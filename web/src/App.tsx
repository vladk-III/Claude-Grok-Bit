import { useEffect } from "react";
import type { FetchLike } from "@crewbit/shared";
import { useCrewbit, type KeyValueStorage } from "@crewbit/shared/react";
import { DesktopShell } from "./shells/DesktopShell";
import { MobileShell } from "./shells/MobileShell";
import { useIsPhone } from "./useIsPhone";

const storage: KeyValueStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode or quota exceeded */
    }
  },
};
const browserFetch = ((url, init) => fetch(url, init)) as FetchLike;

export default function App() {
  const app = useCrewbit({ storage, fetch: browserFetch, defaultRunMode: "direct" });
  const isPhone = useIsPhone();
  const { syncNow, github } = app;

  // Pick up changes made on other devices when coming back to this tab.
  useEffect(() => {
    if (!github.enabled) return;
    const onVisible = () => document.visibilityState === "visible" && void syncNow();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [github.enabled, syncNow]);

  if (!app.loaded) return null;
  // Phones get their own layout: bottom tabs, full-screen chat list, big tap targets.
  return isPhone ? <MobileShell app={app} /> : <DesktopShell app={app} />;
}
