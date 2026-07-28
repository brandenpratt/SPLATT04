# Reference inventory

Every art-direction reference used by the VICE ESTATE 04 visual pass. These files are the
source of truth. Do not recolour, regenerate, downscale or substitute them — the Blender
review scripts and the loading-screen implementation read them directly from disk.

Recorded 2026-07-27.

| File | Pixels | Bytes | SHA-256 (first 16) | Role |
|---|---|---|---|---|
| `vice-estate-master.png` | 1672 × 941 | 2,698,415 | `9c018b44a6318bad` | Estate art-direction master |
| `loading-screen-master.png` | 1672 × 941 | 2,529,995 | `12d8c0bc944466d4` | Approved interface composition |
| `player-mask-orange.png` | 376 × 430 | 173,778 | `baeae102a48ff7cd` | Mask construction reference |
| `player-jersey-black-orange.png` | 380 × 424 | 230,461 | `8738eff1f0ed021b` | Jersey construction reference |
| `player-pants-black-orange.png` | 622 × 564 | 445,040 | `2de1e56e56f41928` | Pants construction reference |
| `player-jersey-black-alt.png` | 542 × 550 | 311,869 | `94cd90aaa4cb02b8` | Supplementary: worn jersey drape and glove detail |
| `player-pants-black-orange-alt.png` | 356 × 478 | 212,944 | `2882ac12fff53bfd` | Supplementary: alternate knee/thigh panel layout |

Both masters are 1672 × 941 — 16:9 to within a pixel (1.7768 vs 1.7778). The Blender review
render is configured to the reference's exact pixel dimensions so the overlay is a direct
per-pixel comparison with no resampling.

## Visual verification

Each file was opened and confirmed before use.

**`vice-estate-master.png`** — bright wide Golden Hour estate. Two white villa wings with
curved glossy orange roofs, aqua architectural glass, cyan-lit west garage and pink-lit east
garage, large mirror-chrome flamingo in a chrome fountain basin, chrome orb on a rear-right
dais, thick glossy black inflatable perimeter and bunker families, curved white planters with
cyan and pink light strips, green turf, cyan paint across the west half and pink across the
east, dock with a white yacht, palms, four floodlight towers, peach sunset over turquoise
water, hazy skyline band on the horizon. This is the correct file.

**`loading-screen-master.png`** — the approved interface. SPLAT 04 logo upper-left with a
cyan splat left and a pink splat right; PLAY / LOCKER / CREW navigation with the active PLAY
tab in glossy orange; hero player centre-left in black gear with orange panels and an orange
mask, holding a marker, entirely free of paint; QUICK SPLAT panel lower-left over a large
orange PLAY button; COVERAGE / COREBALL / PRACTICE mode cards along the bottom outlined in
orange, pink and cyan respectively; CREW 1/4 control upper-right; the Golden Hour estate and
chrome flamingo behind. **Not** the all-green reinterpretation.

> An earlier pass installed a later green variant under this name. That file has been
> replaced; hash `faa4d3cec746e836` is superseded and must not be used.

**Gear references** — the mask is a vented orange shell with a smoked lens and a black strap
mount; the jersey is black with orange sleeve and flank panels, padded shoulders and elbows;
the pants are black with orange patterning, padded knees and thighs and mesh cuffs. These are
construction and colour-blocking references only.

## Trademark constraint

The gear photographs are commercial products and carry visible manufacturer wordmarks and
logos. Reproduce **none** of them — not the wordmarks, not the logo shapes, not the
distinctive graphic prints. What is taken from these images is limited to:

- black-and-orange colour blocking
- vent shapes and mesh placement
- layered fabric and armour construction
- padded knee, thigh, elbow and torso panels
- smoked visor geometry
- overall technical paintball silhouette

The SPLAT 04 player gear is original work carrying no third-party marks.
