import { defineConfig } from 'vite';

// Pre-bundle every deck.gl/luma.gl package together so they share one luma.gl instance.
// BASE lets the same build serve from a subpath, e.g. GitHub Pages at /waterways/.
export default defineConfig({
  base: process.env.BASE ?? '/',
  optimizeDeps: {
    include: [
      '@deck.gl/core',
      '@deck.gl/layers',
      '@deck.gl/extensions',
      '@deck.gl/geo-layers',
      '@deck.gl/mapbox',
      '@deck.gl/aggregation-layers',
      'maplibre-gl',
    ],
  },
});
