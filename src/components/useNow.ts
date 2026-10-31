"use client";
import { useEffect, useState } from "react";

/**
 * Date courante, disponible seulement après le montage côté client.
 * Next 16 (Cache Components) interdit `new Date()` pendant le prérendu d'une page statique :
 * la valeur serait figée au moment du build.
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valeur volontairement client-only
    setNow(new Date());
  }, []);
  return now;
}
