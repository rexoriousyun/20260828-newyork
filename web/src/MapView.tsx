import { useEffect, useRef } from "react";
import { Map as MlMap, NavigationControl, GeolocateControl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { lineColorExpression, UNKNOWN_COLOR } from "./map.js";
import type { RouteMap, SegmentFeature } from "./api.js";

/** Served by our own tile proxy — the client never contacts the basemap host. */
const STYLE = "/tiles/style";
const SRC = "segments";

interface Props {
  data: RouteMap | null;
  onSelect: (f: SegmentFeature | null) => void;
  selectedId: string | null;
}

export function MapView({ data, onSelect, selectedId }: Props): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    if (container.current === null || map.current !== null) return;
    const m = new MlMap({
      container: container.current,
      style: STYLE,
      center: [-79.3832, 43.6532],
      zoom: 11,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new GeolocateControl({ trackUserLocation: true }), "top-right");

    m.on("load", () => {
      m.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      // A wide transparent line under the visible one: a 4px stroke is not a
      // tappable target on a phone.
      m.addLayer({
        id: "segments-hit",
        type: "line",
        source: SRC,
        paint: { "line-width": 22, "line-opacity": 0 },
      });

      // Known segments, coloured by exposure.
      m.addLayer({
        id: "segments-known",
        type: "line",
        source: SRC,
        filter: ["!=", ["get", "confidence"], "unknown"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": lineColorExpression() as never,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 12, 5, 14, 7, 17, 11],
          "line-opacity": 0.9,
        },
      });

      // Unknown segments are dashed and grey — a different visual kind, not a
      // paler shade of fine (P-03).
      m.addLayer({
        id: "segments-unknown",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "confidence"], "unknown"],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": UNKNOWN_COLOR,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 12, 3.5, 14, 5, 17, 8],
          "line-dasharray": [2, 2],
          "line-opacity": 0.75,
        },
      });

      m.addLayer({
        id: "segments-selected",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "segmentId"], "__none__"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1f6feb", "line-width": 9, "line-opacity": 0.55 },
      });

      m.on("click", "segments-hit", (e: MapMouseEvent & { features?: unknown[] }) => {
        const f = e.features?.[0] as { properties: unknown } | undefined;
        onSelect(f === undefined ? null : ({ ...f, properties: f.properties } as unknown as SegmentFeature));
      });
      m.on("click", (e: MapMouseEvent) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ["segments-hit"] });
        if (hits.length === 0) onSelect(null);
      });
      m.on("mouseenter", "segments-hit", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "segments-hit", () => { m.getCanvas().style.cursor = ""; });

      ready.current = true;
    });
    map.current = m;
  }, [onSelect]);

  useEffect(() => {
    const m = map.current;
    if (m === null || data === null) return;
    const apply = (): void => {
      const src = m.getSource(SRC) as GeoJSONSource | undefined;
      if (src === undefined) return;
      src.setData(data as never);
      if (data.bbox !== null) {
        m.fitBounds(
          [
            [data.bbox[0], data.bbox[1]],
            [data.bbox[2], data.bbox[3]],
          ],
          { padding: { top: 96, bottom: 170, left: 26, right: 26 }, maxZoom: 14, duration: 600 },
        );
      }
    };
    if (ready.current) apply();
    else m.once("load", apply);
  }, [data]);

  useEffect(() => {
    const m = map.current;
    if (m === null || !ready.current) return;
    if (m.getLayer("segments-selected") !== undefined) {
      m.setFilter("segments-selected", ["==", ["get", "segmentId"], selectedId ?? "__none__"]);
    }
  }, [selectedId]);

  return <div ref={container} className="map" />;
}
