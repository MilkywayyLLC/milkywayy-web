"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BookingLocation } from "@/lib/portal/booking";

/**
 * The shoot's location (owner, 10 Oct 2026; map picker, site-refine Oct 2026): a search box with
 * Google Places autocomplete limited to the UAE, and a map below it. Choosing a result drops the
 * pin; dragging it or tapping the map moves it. Every change reverse-geocodes (Geocoding API) and
 * fills the building, community and address fields, which stay editable. Stores the address,
 * latitude/longitude, place id, building and community. Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY (Maps
 * JavaScript, Places (New) and Geocoding APIs); without it, the plain address field as before.
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
const DUBAI = { lat: 25.2048, lng: 55.2708 };

type LatLng = { lat: number; lng: number };
type Suggestion = { text: string; toPlace: () => GPlace };
type GPlace = {
  fetchFields: (o: { fields: string[] }) => Promise<unknown>;
  formattedAddress?: string;
  id?: string;
  location?: { lat: () => number; lng: () => number };
};
type Geo = {
  formatted_address: string;
  address_components: { long_name: string; types: string[] }[];
};
export type Maps = {
  importLibrary: (name: string) => Promise<Record<string, unknown>>;
};

let loading: Promise<Maps> | null = null;
export function loadMaps(): Promise<Maps> {
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
  // With the map: a search box separate from the (editable) address. Without: the address itself.
  const [text, setText] = useState(KEY ? "" : value.address);
  const [list, setList] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [mapsOk, setMapsOk] = useState(!!KEY);
  const mapEl = useRef<HTMLDivElement>(null);
  const marker = useRef<{ move: (p: LatLng) => void } | null>(null);
  // A small inline message when search or the map hiccups (the map stays).
  const [note, setNote] = useState("");
  const mapObj = useRef<{ setCenter: (p: LatLng) => void; setZoom: (z: number) => void } | null>(
    null,
  );
  const token = useRef<unknown>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const geocoder = useRef<{
    geocode: (r: { location: LatLng }) => Promise<{ results: Geo[] }>;
  } | null>(null);

  /** Pin moved: keep the coordinates, then fill building/community/address from Geocoding. */
  async function pinned(lat: number, lng: number, name?: string, placeId?: string) {
    const base = { ...latest.current, lat, lng, place_id: placeId };
    onChange(base);
    try {
      const maps = await loadMaps();
      if (!geocoder.current) {
        const { Geocoder } = (await maps.importLibrary("geocoding")) as {
          Geocoder: new () => NonNullable<typeof geocoder.current>;
        };
        geocoder.current = new Geocoder();
      }
      const { results } = await geocoder.current.geocode({ location: { lat, lng } });
      const r = results[0];
      if (!r) return;
      const part = (...types: string[]) =>
        r.address_components.find((c) => types.some((t) => c.types.includes(t)))?.long_name;
      onChange({
        ...base,
        address: r.formatted_address || base.address,
        building: name || part("premise", "establishment", "point_of_interest") || "",
        community:
          part("neighborhood", "sublocality_level_1", "sublocality") || part("locality") || "",
      });
    } catch {
      // Geocoding off or failed: the pin still counts; the fields stay as typed.
    }
  }

  // The map with a draggable pin.
  useEffect(() => {
    if (!KEY || !mapEl.current) return;
    let live = true;
    (async () => {
      // Only the script itself failing (no or bad key) drops to the plain address field.
      let maps: Maps;
      try {
        maps = await loadMaps();
      } catch {
        if (live) {
          setMapsOk(false);
          setText(latest.current.address);
        }
        return;
      }
      try {
        const { Map } = (await maps.importLibrary("maps")) as {
          Map: new (el: HTMLElement, o: object) => NonNullable<typeof mapObj.current>;
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
          clickableIcons: false,
        });
        const num = (x: number | (() => number)) => (typeof x === "function" ? x() : x);
        // The draggable pin: an advanced marker, or the classic one if that library fails.
        let pin: { move: (p: LatLng) => void };
        try {
          const { AdvancedMarkerElement } = (await maps.importLibrary("marker")) as {
            AdvancedMarkerElement: new (o: object) => {
              position: unknown;
              addListener: (e: string, f: () => void) => void;
            };
          };
          const m = new AdvancedMarkerElement({
            map,
            position: at,
            gmpDraggable: true,
            title: "Shoot location",
          });
          m.addListener("dragend", () => {
            const p = m.position as { lat: number | (() => number); lng: number | (() => number) };
            void pinned(num(p.lat), num(p.lng));
          });
          pin = { move: (p) => (m.position = p) };
        } catch {
          const { Marker } = (await maps.importLibrary("marker")) as {
            Marker: new (o: object) => {
              setPosition: (p: LatLng) => void;
              getPosition: () => { lat: () => number; lng: () => number } | null;
              addListener: (e: string, f: () => void) => void;
            };
          };
          const m = new Marker({ map, position: at, draggable: true, title: "Shoot location" });
          m.addListener("dragend", () => {
            const p = m.getPosition();
            if (p) void pinned(p.lat(), p.lng());
          });
          pin = { move: (p) => m.setPosition(p) };
        }
        // Tap the map to move the pin there.
        (
          map as unknown as { addListener: (e: string, f: (ev: object) => void) => void }
        ).addListener("click", (ev) => {
          const ll = (ev as { latLng?: { lat: () => number; lng: () => number } }).latLng;
          if (!ll) return;
          const p = { lat: ll.lat(), lng: ll.lng() };
          pin.move(p);
          void pinned(p.lat, p.lng);
        });
        mapObj.current = map;
        marker.current = pin;
      } catch {
        if (live) setNote("The map didn’t load fully. Search, or type the address below.");
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
        locationBias: { center: DUBAI, radius: 50000 },
        region: "ae",
        sessionToken: token.current,
      });
      setNote("");
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
      setList([]);
      setNote(
        "Search isn’t responding right now. Tap the map to place the pin, or type the address.",
      );
    }
  }

  async function choose(s: Suggestion) {
    setList([]);
    try {
      const place = s.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "id"] });
      token.current = null;
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const address = place.formattedAddress ?? s.text;
      setText(s.text);
      onChange({ ...latest.current, address });
      if (lat != null && lng != null) {
        mapObj.current?.setCenter({ lat, lng });
        mapObj.current?.setZoom(17);
        marker.current?.move({ lat, lng });
        latest.current = { ...latest.current, address };
        void pinned(lat, lng, (place as { displayName?: string }).displayName, place.id);
      }
    } catch {
      onChange({ ...latest.current, address: s.text });
      setNote("Couldn’t open that place. Tap the map to place the pin.");
    }
  }

  return (
    <div className={`pt-places pt-field ${error && !mapsOk ? "is-bad" : ""}`} data-field="location">
      <label className="pt-field-label" htmlFor={`${id}-q`}>
        Location
        {!mapsOk && (
          <span className="pt-req" aria-hidden="true">
            {" "}
            *
          </span>
        )}
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
            // Without the map, typed by hand is the address (a pin no longer applies).
            if (!mapsOk)
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
      {error && !mapsOk && <span className="pt-field-msg">{error}</span>}
      {mapsOk && note && (
        <span className="pt-field-msg" role="status">
          {note}
        </span>
      )}
      {KEY && mapsOk && (
        <>
          <div
            ref={mapEl}
            className="pt-map"
            aria-label="Map: tap or drag the pin to the exact spot"
          />
          <div className="pt-places-grid">
            <label className="pt-field" htmlFor={`${id}-bld`}>
              Building
              <input
                id={`${id}-bld`}
                value={value.building ?? ""}
                maxLength={200}
                placeholder="e.g. Marina Heights"
                onChange={(e) => onChange({ ...value, building: e.target.value })}
              />
            </label>
            <label className="pt-field" htmlFor={`${id}-unit`}>
              Unit
              <input
                id={`${id}-unit`}
                value={value.unit ?? ""}
                maxLength={200}
                placeholder="e.g. Apt 2304"
                onChange={(e) => onChange({ ...value, unit: e.target.value })}
              />
            </label>
            <label className="pt-field" htmlFor={`${id}-com`}>
              Community
              <input
                id={`${id}-com`}
                value={value.community ?? ""}
                maxLength={200}
                placeholder="e.g. Dubai Marina"
                onChange={(e) => onChange({ ...value, community: e.target.value })}
              />
            </label>
            <label className={`pt-field ${error ? "is-bad" : ""}`} htmlFor={`${id}-addr`}>
              <span>
                Address
                <span className="pt-req" aria-hidden="true">
                  {" "}
                  *
                </span>
              </span>
              <input
                id={`${id}-addr`}
                value={value.address}
                maxLength={300}
                aria-invalid={!!error || undefined}
                placeholder="Address"
                onChange={(e) => onChange({ ...value, address: e.target.value })}
              />
              {error && <span className="pt-field-msg">{error}</span>}
            </label>
          </div>
        </>
      )}
      <div className={mapsOk ? "pt-places-access" : "pt-grid2"}>
        {!mapsOk && (
          <label className="pt-field" htmlFor={`${id}-unit`}>
            Unit
            <input
              id={`${id}-unit`}

              value={value.unit ?? ""}
              maxLength={200}
              placeholder="e.g. Apt 2304, Marina Heights"
              onChange={(e) => onChange({ ...value, unit: e.target.value })}
            />
          </label>
        )}
        <label className="pt-field" htmlFor={`${id}-access`}>
          Access
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
