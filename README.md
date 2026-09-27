# น้ำอยู่ไหน? — Where's the water?

A 3D map of river flow, flooding and rain across Thailand and mainland Southeast Asia, built only on public data — designed so a child or a grandparent understands it at a glance, without losing the spectacle.

**Start with a place.** Pick a province or use your location to inspect recent ThaiWater measurements, then explore the river model across time. Observations, modelled flow and forecasts carry separate source labels. High modelled flow is not confirmation of flooding.

- **Living river atlas** — translucent, bounded-height river ribbons provide a quieter 3D overview. Height is a visual scale, not water depth. Model colours compare flow with the reference: below 0.5× low, 0.5–less than 2× typical, 2–less than 3.5× high, at least 3.5× very high.
- **Connected rivers** — selecting a reach highlights its actual upstream and downstream network, with separate line styles and a daily flow chart.
- **Explore time** — date picker, keyboard-accessible day slider, history/peak/forecast shortcuts and a persistent return-to-latest button. Playback keeps the camera still; scenic orbit is an explicit option.
- **Compare dates** — compare a selected reach’s flow or nationwide river length with elevated modelled flow. Both dates show their source, scope, absolute change and percentage change. Zero-base and missing values are handled explicitly.
- **Recent observations** — measured water-level dots and overflow rings are kept separate from river model colours. Historical and forecast views hide present-day observations. Older than six hours, missing timestamps and incomplete water measurements are excluded from current area summaries.
- **Distinct detail graphics** — river trend and network, measured bank cross-section, rainfall vessel and province status tally. Unavailable readings stay unavailable, never zero.
- **Mobile** — compact details expand into a scrollable sheet. Chart and date comparison open on demand; short screens keep the primary controls reachable.
- **Optional layers** — rainfall, radar and satellite overlays remain available in the layer panel, with rain and satellite flood overlays off initially to keep the map legible.
- **Help and accessibility** — open the guide with `?` or the layer panel. Visible keyboard focus, reduced-motion support, labelled controls and no automatic guide interruption.
- **Light / dark** — follows the viewer’s clock by default (06:00–18:00 light); the sun/moon override is remembered.
- **ไทย / English** — follows the first supported browser language, with a remembered manual override. Copy lives in `src/i18n.ts` and `src/experience-copy.ts`.

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

Open http://localhost:5173. Keyboard: `Space` play/pause, `←/→` step a day (`Shift` for a week), `Home`/`End` start/today.

## Data

| Layer | Source | Cadence |
| --- | --- | --- |
| River network, long-term mean discharge | [HydroRIVERS v1.0](https://www.hydrosheds.org/products/hydrorivers) (Lehner & Grill 2013) | static, baked |
| Daily discharge + 30-day forecast | [GloFAS v4](https://global-flood.emergency.copernicus.eu/) via [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api) | baked history, topped up in the browser daily |
| Water level, rain 24 h | [ThaiWater / HII](https://www.thaiwater.net/) public API | live, 10 min |
| Rain radar | [RainViewer](https://www.rainviewer.com/api.html) | live, 10 min frames |
| Flood extent | NASA LANCE MODIS Combined Flood 2-Day via [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | daily |
| Satellite rain | NASA GPM IMERG via GIBS | daily |
| Basemap, relief | [OpenFreeMap](https://openfreemap.org/) (OSM), Mapzen terrarium tiles on AWS | — |

### What refreshes by itself

While the page is open: ThaiWater gauges and RainViewer radar every 5 minutes, GloFAS river flow checked hourly (it publishes once a day — new days are spliced in from Open-Meteo in the browser, however many are missing), and everything at once when the tab comes back into view. The overview shows the observation date and source; selected observation cards resolve refreshed readings by their stable station ID. Re-running the scripts below only refreshes the *baked* history that loads first.

### Rebuilding the baked data

```bash
npm run data:rivers      # downloads nothing; needs .cache/HydroRIVERS_v10_as_shp (see below)
npm run data:discharge   # ~230 virtual gauges; cached in .cache/open-meteo, safe to re-run
DAYS=365 npm run data:discharge   # a full year instead of six months
```

HydroRIVERS Asia (≈90 MB):

```bash
mkdir -p .cache && cd .cache
curl -LO https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip && unzip HydroRIVERS_v10_as_shp.zip
```

**How gauges work.** GloFAS is a 0.05° grid; the cell nearest a river line is often a side stream. `build-discharge.mjs` scans a 5×5 neighbourhood around each virtual gauge and keeps the cell whose late-monsoon flow best matches the reach's HydroRIVERS mean. Every reach then borrows the relative anomaly (flow ÷ annual mean) of the nearest gauge on the same river system, so small tributaries move with their basin while keeping their own scale.

Open-Meteo's free tier allows 10,000 weighted calls/day; a long history for 230 locations uses most of it, which is why the default window is six months.

## Caveats

- GloFAS is a model (reanalysis + forecast), not gauged observation. Treat the walls as the basin-scale picture; ThaiWater stations are the ground truth.
- "Ponding risk" is a rainfall-intensity flag, not a measured inundation map.
- MODIS flood extent is blind under cloud, which in the monsoon is often.

## Bangkok canal gauges (not yet included)

Bangkok's Drainage and Sewerage Department runs ~310 canal gauges with warning/critical levels on
[weather.bangkok.go.th/water](https://weather.bangkok.go.th/water). The data is public on that page, but the server
has no CORS headers and rejects non-browser clients, so this app does not scrape it. Using it needs permission or
an API from the department (ddsbma@gmail.com, 0-2248-5115); once available it can plug into `nearby.ts` as another
gauge source.
