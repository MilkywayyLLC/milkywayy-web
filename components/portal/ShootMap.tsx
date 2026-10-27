"use client";

import { useEffect, useRef, useState } from "react";
import { loadMaps, MAP_ID } from "./PlacesField";

/**
 * The shoot location on the shoot page (phase 1 part 6). It was a Static Maps image, which the
 * site's key isn't allowed to use (Google answers 403, so the image was always broken). This uses
 * the Maps JavaScript API the booking map already uses: a small, still map with a pin, linking to
 * Google Maps. If the map can't load, the address link alone stays.
 */
export function ShootMap({ lat, lng }: { lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const maps = await loadMaps();
        const { Map } = (await maps.importLibrary("maps")) as {
          Map: new (e: HTMLElement, o: object) => object;
        };
        if (!live || !el.current) return;
        const at = { lat, lng };
        const map = new Map(el.current, {
          center: at,
          zoom: 16,
          mapId: MAP_ID,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
        });
        const { AdvancedMarkerElement } = (await maps.importLibrary("marker")) as {
          AdvancedMarkerElement: new (o: object) => object;
        };
        new AdvancedMarkerElement({ map, position: at, title: "Shoot location" });
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [lat, lng]);
  return (
    <a
      className="pt-staticmap"
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Open the shoot location in Google Maps"
      data-testid="shoot-map"
    >
      {failed ? (
        <span className="pt-meta">Open in Google Maps</span>
      ) : (
        <div ref={el} className="pt-shootmap" />
      )}
    </a>
  );
}
