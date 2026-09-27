# Living Waterways Implementation Plan

> Execution: native, using executing-plans. The user approved the design direction and all six audit recommendations in the conversation.

**Goal:** Make Waterways understandable, trustworthy and visually distinctive on desktop and mobile.
**Architecture:** Preserve the vanilla TypeScript, MapLibre and deck.gl app. Add pure presentation/domain helpers, extend existing cards and timeline, and reorganize the existing interface in place.
**Tech Stack:** TypeScript, Vite, MapLibre, deck.gl, CSS. No additional product dependencies.
**Spec:** The approved UX review in the conversation: living river atlas, clear provenance/time, place-first exploration, quieter ribbons, connected-network focus, date comparison, distinct explanatory graphics and a collapsible mobile detail sheet.

## Global Constraints
- Preserve Thai and English, both themes, all public data integrations and existing routes.
- Never call model anomalies confirmed flooding; never display unavailable measurements as zero.
- Keep today's observations out of historical and forecast views.
- Keep a visible return-to-latest action at every width.
- Use source-backed connections; do not simulate flood propagation or claim local safety.
- Respect reduced motion, keyboard navigation and 320/375/414/768 pixel layouts.

## Review Focus
- Missing/old observations must not produce reassuring normal/zero statements.
- Historical cards and current observations must never be combined silently.
- Date comparison must handle zero, same day, dates after refresh and forecast labels.
- Network tracing must handle tributaries, missing downstream reaches and cycles.
- Mobile sheets, help, timeline and layer panel must stay operable on short screens.

## Tasks
- [x] 1. Add regression tests and pure helpers for time, freshness, comparison and network tracing; watch failure then pass.
- [x] 2. Correct model/observation labels and missing-data handling; add distinct river/rain/station/area graphics with tests.
- [x] 3. Reorganize the interface around selecting a place; add compact/expanded sheets, accessible timeline, two-date comparison and event markers.
- [x] 4. Refine map ribbons, hierarchy, selection/network focus and camera behavior. Add an explicitly selected cinematic view.
- [x] 5. Verify build/tests and browser flows, both languages/themes and responsive widths; independent final review; update README.

## Execution ledger
- Ruling: Work directly in the existing folder because this workspace is not a Git repository. Source snapshot stored in .cache/pre-ux-redesign for local recovery; no files deleted.
- Ruling: Approval of the preceding concrete review plus “ปรับปรุงทั้งหมดตามที่แนะนำ” authorizes implementation; do not request the same permission again.

- Delivered all five tasks without new product dependencies. Updated README to describe the implemented visual and data semantics.
- Independent reviewer found temporal-selection, refresh, comparison, missing-reading and mobile pointer issues. All fixed; bounded re-review found no remaining blockers.
- Verification: 13 Node regression tests pass; TypeScript and production Vite build pass. Existing large-bundle warning remains (~508 KB gzipped main bundle).
- Browser checked at 320, 375, 414, 768 and 1280 pixel widths, including 375×568 short screen; no horizontal document overflow in sampled 320/375/768 layouts. Thai/English, light/dark, province selection, mobile detail expansion, river network selection, national/reach comparison, same-date comparison, past/future/current visibility, keyboard date slider, playback and help focus verified. Browser reported no errors/warnings in final check.
- Real geolocation permission flow not exercised; near-me selection ordering reviewed and corrected. Mobile layouts tested by browser viewport, not physical devices.
- Temporary browser viewport override reset before handoff. No deployment or Git commit performed (workspace has no Git repository).
