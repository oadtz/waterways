import type { StyleSpecification } from 'maplibre-gl';

// A deliberately quiet basemap: the rivers carry the story, the ground only gives it a place.
// Vector tiles: OpenFreeMap (OpenMapTiles schema). Relief: Mapzen terrarium tiles on AWS.

export type Theme = 'dark' | 'light';

// Two quiet grounds: night ink, and a daylight paper tone. Rivers carry the colour in both.
const PALETTES = {
  dark: {
    ink: '#06090d',
    land: '#121920',
    sea: '#030507',
    lakes: '#0f2630',
    coast: '#1c2833',
    roads: '#1a232c',
    province: '#1d2731',
    country: '#3a4753',
    label: '#9aa8b3',
    dot: '#8a9aa6',
    countryLabel: '#5d6b77',
    shadow: '#05070a',
    highlight: '#2e3a46',
    accent: '#0d141b',
    sky: '#0b1826',
    horizon: '#1b3446',
    fog: '#05080c',
    edge: '#5d7488',
    canal: '#2d6f93',
    street: '#1a232c',
    building: '#141c24',
  },
  light: {
    ink: '#f4f2ed',
    land: '#ecebe6',
    sea: '#d5e1e8',
    lakes: '#bcd3df',
    coast: '#b7c6cf',
    roads: '#dcd9d2',
    province: '#cfccc4',
    country: '#9aa3a9',
    label: '#4a555e',
    dot: '#5b666f',
    countryLabel: '#8a949b',
    shadow: '#b9b6ad',
    highlight: '#ffffff',
    accent: '#d6d3cb',
    sky: '#cfe0ea',
    horizon: '#f4f2ed',
    fog: '#f4f2ed',
    edge: '#7c8d99',
    canal: '#6aa7c9',
    street: '#e2dfd8',
    building: '#e4e1da',
  },
} as const;

let P: (typeof PALETTES)[Theme] = PALETTES.dark;

export function buildBasemap(theme: Theme): StyleSpecification {
  P = PALETTES[theme];
  return {
  version: 8,
  // A faint teal horizon when the camera tilts — the map reads as a landscape, not a sheet.
  sky: {
    'sky-color': P.sky,
    'horizon-color': P.horizon,
    'fog-color': P.fog,
    'sky-horizon-blend': 0.7,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.35,
    'atmosphere-blend': 0,
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 12,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': P.land } },
    {
      id: 'land',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      paint: { 'fill-color': P.land, 'fill-opacity': 0 },
    },
    {
      id: 'relief',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.35,
        'hillshade-shadow-color': P.shadow,
        'hillshade-highlight-color': P.highlight,
        'hillshade-accent-color': P.accent,
        'hillshade-illumination-direction': 315,
      },
    },
    {
      id: 'sea',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'],
      paint: { 'fill-color': P.sea },
    },
    {
      id: 'lakes',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['!=', ['get', 'class'], 'ocean'],
      paint: { 'fill-color': P.lakes, 'fill-opacity': 0.9 },
    },
    {
      id: 'coast',
      type: 'line',
      source: 'omt',
      'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'],
      paint: { 'line-color': P.coast, 'line-width': 0.6 },
    },
    // Street level (near me): buildings, side streets, and every canal and drain OSM knows about.
    {
      id: 'buildings',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': P.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.9] },
    },
    {
      id: 'streets',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor', 'service']]],
      paint: {
        'line-color': P.street,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 14, 1.2, 16, 3],
      },
    },
    {
      id: 'canals',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 9,
      filter: ['in', ['get', 'class'], ['literal', ['canal', 'drain', 'ditch', 'river', 'stream']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': P.canal,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.35, 12, 0.9],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          9, ['match', ['get', 'class'], ['river', 'canal'], 0.6, 0.3],
          14, ['match', ['get', 'class'], ['river', 'canal'], 2.6, 1.2],
          16, ['match', ['get', 'class'], ['river', 'canal'], 5, 2],
        ],
      },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      paint: { 'line-color': P.roads, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 13, 1.6] },
    },
    {
      id: 'canal-labels',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 12.5,
      filter: ['in', ['get', 'class'], ['literal', ['canal', 'river']]],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ''],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-letter-spacing': 0.05,
      },
      paint: { 'text-color': P.canal, 'text-halo-color': P.ink, 'text-halo-width': 1.2 },
    },
    {
      id: 'province',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      minzoom: 6,
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': P.province, 'line-width': 0.6, 'line-dasharray': [3, 3] },
    },
    {
      id: 'country',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': P.country, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.4] },
    },
    {
      id: 'places',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: [
        'any',
        ['all', ['==', ['get', 'class'], 'city'], ['<=', ['to-number', ['get', 'rank'], 99], 6]],
        ['all', ['==', ['get', 'class'], 'town'], ['>=', ['zoom'], 8]],
      ],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          4, ['case', ['<=', ['to-number', ['get', 'rank'], 99], 3], 13, 11],
          10, ['case', ['<=', ['to-number', ['get', 'rank'], 99], 3], 17, 14],
        ],
        'text-letter-spacing': 0.04,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: {
        'text-color': P.label,
        'text-halo-color': P.ink,
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'place-dots',
      type: 'circle',
      source: 'omt',
      'source-layer': 'place',
      filter: ['all', ['==', ['get', 'class'], 'city'], ['<=', ['to-number', ['get', 'rank'], 99], 6]],
      paint: { 'circle-radius': 1.8, 'circle-color': P.dot },
    },
    {
      id: 'countries',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': ['upcase', ['coalesce', ['get', 'name:en'], ['get', 'name']]],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-letter-spacing': 0.35,
      },
      paint: { 'text-color': P.countryLabel, 'text-halo-color': P.ink, 'text-halo-width': 1 },
    },
  ],
};
}

// Recolour a live map without reloading tiles.
export function applyMapTheme(map: import('maplibre-gl').Map, theme: Theme) {
  const p = PALETTES[theme];
  const set = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop, v);
  set('bg', 'background-color', p.land);
  set('relief', 'hillshade-shadow-color', p.shadow);
  set('relief', 'hillshade-highlight-color', p.highlight);
  set('relief', 'hillshade-accent-color', p.accent);
  set('sea', 'fill-color', p.sea);
  set('lakes', 'fill-color', p.lakes);
  set('coast', 'line-color', p.coast);
  set('roads', 'line-color', p.roads);
  set('province', 'line-color', p.province);
  set('country', 'line-color', p.country);
  set('places', 'text-color', p.label);
  set('places', 'text-halo-color', p.ink);
  set('place-dots', 'circle-color', p.dot);
  set('countries', 'text-color', p.countryLabel);
  set('countries', 'text-halo-color', p.ink);
  set('outside-dim', 'fill-color', p.ink);
  set('thai-edge', 'line-color', p.edge);
  set('canals', 'line-color', p.canal);
  set('canal-labels', 'text-color', p.canal);
  set('canal-labels', 'text-halo-color', p.ink);
  set('streets', 'line-color', p.street);
  set('buildings', 'fill-color', p.building);
  map.setSky({ ...map.getSky(), 'sky-color': p.sky, 'horizon-color': p.horizon, 'fog-color': p.fog });
}

// Spotlight: everything outside Thailand sits under a translucent veil; a fine line traces the border.
export function addSpotlight(map: import('maplibre-gl').Map, theme: Theme, thailand: GeoJSON.Feature) {
  const holes = (thailand.geometry as GeoJSON.MultiPolygon).coordinates.map((poly) => poly[0].slice().reverse());
  map.addSource('spotlight', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[60, -20], [150, -20], [150, 50], [60, 50], [60, -20]], ...holes] },
    },
  });
  map.addSource('thailand', { type: 'geojson', data: thailand });
  map.addLayer(
    { id: 'outside-dim', type: 'fill', source: 'spotlight', paint: { 'fill-color': PALETTES[theme].ink, 'fill-opacity': 0.64 } },
    'coast',
  );
  map.addLayer(
    { id: 'thai-edge', type: 'line', source: 'thailand', paint: { 'line-color': PALETTES[theme].edge, 'line-width': 1.2, 'line-opacity': 0.8 } },
    'places',
  );
  // Label restraint: place names only inside Thailand, plus neighbouring national capitals.
  const inThailand = ['within', thailand] as any;
  const capital = ['==', ['to-number', ['get', 'capital'], 0], 2];
  for (const id of ['places', 'place-dots']) {
    const base = map.getFilter(id);
    if (base) map.setFilter(id, ['all', base, ['any', inThailand, capital]] as any);
  }
}
