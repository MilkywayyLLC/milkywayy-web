"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BookingLocation } from "@/lib/portal/booking";

/**
 * The shoot's location (owner, 10 Oct 2026): Google Places autocomplete limited to the UAE (type,
 * then press Enter to take the first match, or pick one) and a map pin you can drag. Stores the
 * formatted address, latitude/longitude and place id. Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY (Maps
 * JavaScript API + Places API (New)); without it, a plain address field.
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
const DUBAI = { lat: 25.2048, lng: 55.2708 };

type LatLng = { lat: number; lng: number };
type Suggestion = { text: string; toPlace: () => GPlace };
type GPlace = {
  fetchFields: (o: { fields: string[] }) => Promise<unknown>;
  formattedAddress?: string;
  id?: string;
  location?: { lat: () => number; lng: () => number };
};
type Maps = {
  importLibrary: (name: string) => Promise<Record<string, unknown>>;
};

let loading: Promise<Maps> | null = null;
function loadMaps(): Promise<Maps> {
  const w = window as unknown as { google?: { maps?: Maps }; __mwMaps?: () => void };
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google.maps);
  loading ??= new Promise((resolve, reject) => {
    w.__mwMaps = () => resolve(w.google!.maps!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&callback=__mwMaps`;
    s.async = true;
    s.onerror = () => reject(new Error("maps"));
    document.head.append(s);
  });
  return loading;
}

export function PlacesField({
  value,
  onChange,
  error,
}: {
  value: BookingLocation;
  onChange: (v: BookingLocation) => void;
  /** Shared form validation: a red border and message (owner, 10 Oct 2026). */
  error?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value.address);
  const [list, setList] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [mapsOk, setMapsOk] = useState(!!KEY);
  const mapEl = useRef<HTMLDivElement>(null);
  const marker = useRef<{ position: LatLng | null } | null>(null);
  const mapObj = useRef<{ setCenter: (p: LatLng) => void; setZoom: (z: number) => void } | null>(
    null,
  );
  const token = useRef<unknown>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  // The map with a draggable pin.
  useEffect(() => {
    if (!KEY || !mapEl.current) return;
    let live = true;
    (async () => {
      try {
        const maps = await loadMaps();
        const { Map } = (await maps.importLibrary("maps")) as {
          Map: new (el: HTMLElement, o: object) => NonNullable<typeof mapObj.current>;
        };
        const { AdvancedMarkerElement } = (await maps.importLibrary("marker")) as {
          AdvancedMarkerElement: new (o: object) => {
            position: LatLng | null;
            addListener: (e: string, f: () => void) => void;
          };
        };
        if (!live || !mapEl.current) return;
        const v = latest.current;
        const at = v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : DUBAI;
        const map = new Map(mapEl.current, {
          center: at,
          zoom: v.lat != null ? 16 : 10,
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });
        const m = new AdvancedMarkerElement({
          map,
          position: at,
          gmpDraggable: true,
          title: "Shoot location",
        });
        m.addListener("dragend", () => {
          const p = m.position as unknown as {
            lat: number | (() => number);
            lng: number | (() => number);
          };
          const lat = typeof p.lat === "function" ? p.lat() : p.lat;
          const lng = typeof p.lng === "function" ? p.lng() : p.lng;
          onChange({ ...latest.current, lat, lng });
        });
        mapObj.current = map;
        marker.current = m;
      } catch {
        setMapsOk(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is made once
  }, []);

  async function suggest(input: string) {
    if (!KEY || input.trim().length < 3) return setList([]);
    try {
      const maps = await loadMaps();
      const places = (await maps.importLibrary("places")) as {
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: (o: object) => Promise<{
            suggestions: { placePrediction: { text: { text: string }; toPlace: () => GPlace } }[];
          }>;
        };
        AutocompleteSessionToken: new () => unknown;
      };
      token.current ??= new places.AutocompleteSessionToken();
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ["ae"],
        sessionToken: token.current,
      });
      setList(
        suggestions
          .filter((s) => s.placePrediction)
          .slice(0, 5)
          .map((s) => ({
            text: s.placePrediction.text.text,
            toPlace: () => s.placePrediction.toPlace(),
          })),
      );
      setActive(0);
    } catch {
      setMapsOk(false);
    }
  }

  async function choose(s: Suggestion) {
    setList([]);
    try {
      const place = s.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "id"] });
      token.current = null;
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const address = place.formattedAddress ?? s.text;
      setText(address);
      onChange({ ...latest.current, address, lat, lng, place_id: place.id });
      if (lat != null && lng != null) {
        mapObj.current?.setCenter({ lat, lng });
        mapObj.current?.setZoom(16);
        if (marker.current) marker.current.position = { lat, lng };
      }
    } catch {
      onChange({ ...latest.current, address: s.text });
    }
  }

  return (
    <div className={`pt-places pt-field${error ? "is-bad" : ""}`} data-field="location">
      <label className="pt-field-label" htmlFor={`${id}-q`}>
        Location
        <span className="pt-req" aria-hidden="true">
          {" "}
          *
        </span>
      </label>
      <div className="pt-places-in">
        <input
          id={`${id}-q`}

          value={text}
          autoComplete="off"
          role={mapsOk ? "combobox" : undefined}
          aria-expanded={mapsOk ? list.length > 0 : undefined}
          aria-controls={mapsOk ? `${id}-list` : undefined}
          aria-autocomplete={mapsOk ? "list" : undefined}
          placeholder={
            mapsOk ? "Search a building, community or address" : "Building, community, address"
          }
          onChange={(e) => {
            setText(e.target.value);
            // Typed by hand: keep the text; a pin from an earlier choice no longer applies.
            onChange({ address: e.target.value, unit: value.unit, access: value.access });
            void suggest(e.target.value);
          }}
          onKeyDown={(e) => {
            if (!list.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(list.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              void choose(list[active]);
            } else if (e.key === "Escape") setList([]);
          }}
        />
        {list.length > 0 && (
          <ul className="pt-places-list" id={`${id}-list`} role="listbox">
            {list.map((s, i) => (
              <li
                key={s.text}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(s);
                }}
              >
                {s.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <span className="pt-field-msg">{error}</span>}
      {KEY && mapsOk && (
        <>
          <div ref={mapEl} className="pt-map" aria-label="Map: drag the pin to the exact spot" />
          <span className="pt-meta">Drag the pin to the exact entrance if it’s off.</span>
        </>
      )}
      <div className="pt-grid2">
        <label className="pt-field" htmlFor={`${id}-unit`}>
          Unit / building (optional)
          <input
            id={`${id}-unit`}

            value={value.unit ?? ""}
            maxLength={200}
            placeholder="e.g. Apt 2304, Marina Heights"
            onChange={(e) => onChange({ ...value, unit: e.target.value })}
          />
        </label>
        <label className="pt-field" htmlFor={`${id}-access`}>
          Access notes (optional)
          <input
            id={`${id}-access`}

            value={value.access ?? ""}
            maxLength={1000}
            placeholder="Parking, key pickup, who meets us"
            onChange={(e) => onChange({ ...value, access: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
