import { useEffect, useState } from "react";

// Phones in portrait, and phones turned sideways (short screens with touch).
const PHONE_QUERY = "(max-width: 760px), (pointer: coarse) and (max-height: 500px)";

/** True when the page is on a phone-sized screen; updates on resize/rotation. */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}
