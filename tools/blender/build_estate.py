"""VICE ESTATE 04 — full estate, built from the approved vertical-slice assets.

    blender --background --python tools/blender/build_estate.py -- [--samples 128] [--shot wide]

The layout here is led by the reference composition rather than by the old 82x56 collider
table, which the brief explicitly released. Gameplay constraints that still hold:

  * compact 4v4 footprint, all play on one ground level
  * three readable lanes (waterfront / courtyard / party) with frequent cross-connections
  * short-to-medium sightlines — the villas frame the courtyard, they do not occupy it
  * central fountain landmark
  * the bridge, upper storeys and balconies are scenery only

Every hero module comes from `build_vertical_slice`, so the estate inherits the finished
materials, bevels and Golden Hour lighting instead of re-deriving a second, weaker set.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from viceestate_common import ART_DIR, log, script_args  # noqa: E402
import build_vertical_slice as vs  # noqa: E402

TAU = math.tau
ESTATE_DIR = ART_DIR / "estate"

# Property extents. Wider than deep, matching the reference's landscape composition.
ARENA_W, ARENA_D = 76.0, 52.0


# ---------------------------------------------------------------------------
# Modules the slice did not need
# ---------------------------------------------------------------------------


def build_perimeter_run(mats, name, length, location, rotation=0.0):
    """Stacked black inflatable tubes — the property boundary.

    Three tubes of decreasing radius, like the welded bunkers, so the fence reads as the
    same family of vinyl rather than as an extruded bar.
    """
    parts = []
    for i, (r, z) in enumerate(((0.62, 0.62), (0.56, 1.72), (0.44, 2.62))):
        tube = vs.cylinder(f"{name}_tube{i}", r, length, (0, 0, z), mats["vinyl_black"],
                           rotation=(0, TAU / 4, 0), verts=24)
        vs.shade_smooth(tube, 70.0)
        parts.append(tube)
    for i in range(max(2, int(length / 5.5))):
        x = -length / 2 + (i + 0.5) * (length / max(2, int(length / 5.5)))
        band = vs.cylinder(f"{name}_band{i}", 0.66, 0.16, (x, 0, 1.6), mats["vinyl_black"],
                           rotation=(0, TAU / 4, 0), verts=20)
        vs.shade_smooth(band)
        parts.append(band)
    for part in parts:
        part.rotation_euler = (part.rotation_euler[0], part.rotation_euler[1], rotation)
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_orb(mats, location, accent="neon_magenta"):
    """Chrome orb on a lit circular dais."""
    parts = []
    dais = vs.cylinder("Orb_dais", 4.2, 0.55, (0, 0, 0.275), mats["planter_white"], verts=64)
    vs.bevel(dais, 0.10, 3)
    vs.shade_smooth(dais)
    parts.append(dais)
    parts.append(vs.cylinder("Orb_ring", 4.28, 0.12, (0, 0, 0.44), mats[accent], verts=64))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.85, segments=64, ring_count=32,
                                         location=(0, 0, 2.35))
    orb = bpy.context.active_object
    orb.name = "Orb_sphere"
    vs.shade_smooth(orb, 80.0)
    orb.data.materials.append(mats["chrome"])
    parts.append(orb)
    parts.append(vs.cylinder("Orb_stem", 0.30, 0.9, (0, 0, 0.85), mats["chrome"], verts=24))
    for part in parts:
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_bridge(mats, span, location, rotation=0.0):
    """Glass-and-orange rear walkway. Scenery: no collider, not playable."""
    parts = []
    deck = vs.box("Bridge_deck", (span, 4.0, 0.34), (0, 0, 0), mats["roof_orange"])
    vs.bevel(deck, 0.08, 3)
    vs.shade_smooth(deck)
    parts.append(deck)
    parts.append(vs.box("Bridge_soffit", (span, 4.2, 0.16), (0, 0, -0.24), mats["chrome"]))
    for sy in (-1, 1):
        parts.append(vs.box(f"Bridge_glass{sy}", (span, 0.10, 1.5), (0, sy * 1.95, 0.92),
                            mats["glass_aqua"]))
        rail = vs.box(f"Bridge_rail{sy}", (span + 0.3, 0.16, 0.14), (0, sy * 1.95, 1.70),
                      mats["chrome"])
        vs.shade_smooth(rail)
        parts.append(rail)
        for i in range(int(span / 2.6)):
            x = -span / 2 + (i + 0.5) * (span / int(span / 2.6))
            parts.append(vs.cylinder(f"Bridge_post{sy}{i}", 0.05, 1.6, (x, sy * 1.95, 0.95),
                                     mats["chrome"], verts=10))
    for part in parts:
        part.rotation_euler = (0, 0, rotation)
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_palm(mats, name, location, height=11.0, seed=0):
    import random
    rng = random.Random(seed)
    parts = []
    trunk = vs._skin_chain(f"{name}_trunk", [
        ((0, 0, 0.0), 0.42), ((0.2, 0.1, height * 0.35), 0.30),
        ((0.5, 0.25, height * 0.72), 0.24), ((0.8, 0.4, height), 0.20),
    ], subsurf=1, root=0)
    vs.shade_smooth(trunk, 70.0)
    trunk.data.materials.append(mats["foliage"])
    parts.append(trunk)
    top = (0.8, 0.4, height)
    for i in range(9):
        a = (i / 9) * TAU + rng.random() * 0.2
        droop = 0.55 + rng.random() * 0.35
        frond = vs._skin_chain(f"{name}_frond{i}", [
            (top, 0.22),
            ((top[0] + math.cos(a) * 1.5, top[1] + math.sin(a) * 1.5, height + 0.8), 0.72),
            ((top[0] + math.cos(a) * 3.2, top[1] + math.sin(a) * 3.2, height + 0.4 - droop), 0.62),
            ((top[0] + math.cos(a) * 5.0, top[1] + math.sin(a) * 5.0, height - 1.0 - droop), 0.10),
        ], subsurf=2, root=0)
        vs.shade_smooth(frond, 70.0)
        frond.data.materials.append(mats["foliage"])
        frond.scale = (1.0, 1.0, 0.16)
        parts.append(frond)
    for part in parts:
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_floodlight(mats, name, location, rotation=0.0):
    parts = []
    mast = vs.cylinder(f"{name}_mast", 0.22, 14.0, (0, 0, 7.0), mats["chrome"], verts=16)
    vs.shade_smooth(mast)
    parts.append(mast)
    head = vs.box(f"{name}_head", (3.6, 0.5, 2.4), (0, 0.3, 14.2), mats["vinyl_black"])
    vs.bevel(head, 0.08, 3)
    vs.shade_smooth(head)
    parts.append(head)
    for ix in (-1, 0, 1):
        for iz in (-1, 1):
            lamp = vs.box(f"{name}_lamp{ix}{iz}", (1.0, 0.16, 0.9),
                          (ix * 1.15, 0.02, 14.2 + iz * 0.58), mats["neon_cyan"])
            parts.append(lamp)
    for part in parts:
        part.rotation_euler = (0, 0, rotation)
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_dock_and_yacht(mats, location):
    parts = []
    deck = vs.box("Dock_deck", (7.0, 26.0, 0.7), (0, 0, 0.35), mats["stone"])
    vs.bevel(deck, 0.07, 2)
    parts.append(deck)
    for i in range(6):
        for sx in (-1, 1):
            parts.append(vs.cylinder(f"Dock_pile{i}{sx}", 0.26, 3.0,
                                     (sx * 3.1, -11.0 + i * 4.4, 0.6), mats["foliage"], verts=12))
    hull = vs._skin_chain("Yacht_hull", [
        ((0, -8.0, 1.2), 1.6), ((0, -3.0, 1.2), 2.35), ((0, 3.0, 1.25), 2.2),
        ((0, 8.0, 1.35), 1.15), ((0, 10.4, 1.5), 0.30),
    ], subsurf=2, root=1)
    vs.shade_smooth(hull, 80.0)
    hull.data.materials.append(mats["planter_white"])
    hull.location = (8.6, 3.0, 0)
    parts.append(hull)
    house = vs.box("Yacht_house", (3.4, 6.4, 1.7), (8.6, 1.2, 3.0), mats["planter_white"])
    vs.bevel(house, 0.35, 4)
    vs.shade_smooth(house)
    parts.append(house)
    parts.append(vs.box("Yacht_glass", (3.2, 4.6, 0.9), (8.6, 2.4, 3.2), mats["glass_aqua"]))
    for part in parts:
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_grounds(mats):
    """Property deck, turf infield and the bay behind it."""
    parts = []
    deck = vs.prism("Grounds_deck", vs.rounded_rect(ARENA_W + 14, ARENA_D + 14, 6.0, arc=14),
                    -0.9, 0.9, mats["stone"])
    vs.bevel(deck, 0.25, 3)
    parts.append(deck)
    turf = vs.prism("Grounds_turf", vs.rounded_rect(ARENA_W - 3, ARENA_D - 3, 5.0, arc=14),
                    0.0, 0.06, mats["turf"])
    parts.append(turf)
    court = vs.prism("Grounds_court", vs.rounded_rect(46, 30, 4.0, arc=14), 0.06, 0.05,
                     mats["stone"])
    parts.append(court)
    import random as _r
    rng = _r.Random(9)
    x = -4200.0
    while x < 4200.0:
        w = 70 + rng.random() * 130
        h = 110 + rng.random() * 320
        tower = vs.box(f"Skyline_{int(x)}", (w, 24, h), (x + w / 2, 3200.0, h / 2 - 3.0),
                       mats["skyline_haze"])
        parts.append(tower)
        x += w * 0.82

    # The bay: large enough that its far edge sits at the true horizon.
    ocean = vs.box("Grounds_ocean", (9000, 9000, 0.4), (0, 0, -1.2), mats["water"])
    parts.append(ocean)
    return parts


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------


def build_estate(mats):
    objects = build_grounds(mats)

    hw, hd = ARENA_W / 2, ARENA_D / 2

    # Villas frame the rear corners, angled inward, with deliberately different footprints.
    objects += vs.build_villa_facade(mats, location=(-28.0, 3.0, 0.0), accent="neon_cyan",
                                     rotation=math.radians(72.0), width=17.0, depth=12.0)
    objects += vs.build_villa_facade(mats, location=(29.0, 1.0, 0.0), accent="neon_magenta",
                                     rotation=math.radians(-68.0), width=19.5, depth=13.5)
    # Rear connecting architecture, kept as a backdrop across the north edge rather than
    # spanning the courtyard. Scenery only — never playable.
    objects += build_bridge(mats, 26.0, (0.0, 23.0, 7.4), rotation=math.radians(-3.0))

    # Hero fountain, slightly forward of centre so it stays clear of the villas.
    objects += vs.build_fountain(mats, location=(0.0, -1.0, 0.0), radius=6.4)
    objects += vs.build_flamingo(mats, location=(0.0, -1.0, 1.30), height_scale=1.6)
    objects += build_orb(mats, (11.0, 13.0, 0.0), accent="neon_magenta")

    # Perimeter: four runs with the near fence prominent along the bottom of frame.
    for name, length, loc, rot in (
        ("Fence_N", ARENA_W, (0, hd, 0), 0.0),
        ("Fence_S", ARENA_W, (0, -hd, 0), 0.0),
        ("Fence_W", ARENA_D, (-hw, 0, 0), TAU / 4),
        ("Fence_E", ARENA_D, (hw, 0, 0), TAU / 4),
    ):
        objects += build_perimeter_run(mats, name, length, loc, rot)

    # --- the field ---------------------------------------------------------------
    #
    # Laid out like a competitive paintball field rather than scattered cover: every
    # bunker is defined once for the cyan half and mirrored through 180 deg rotation
    # (x, y) -> (-x, -y). Point symmetry is what makes a field fair — each team gets the
    # same snake, the same doritos and the same breakout, handed to the opposite flank.
    # Play runs along X, so each villa sits behind its own team's home.
    #
    # Snake bunkers are long and low enough to move behind; doritos are turned 45 deg so
    # they present a point down the lane.
    HALF = [
        # name          size                 (x,  y)      yaw
        ("home",        (4.6, 3.2, 2.5),   (-22.0,  0.0),  0.0),
        ("backleft",    (3.0, 3.0, 2.3),   (-19.5, -10.5), 0.5),
        ("backright",   (3.0, 3.0, 2.3),   (-19.5,  10.5), -0.5),
        ("snake",       (10.0, 1.7, 1.35), (-10.5, -15.5), 0.0),
        ("snakecorner", (2.6, 2.6, 2.0),   (-15.5, -14.0), 0.7),
        ("snakemid",    (2.4, 2.4, 1.9),   (-5.0,  -14.5), 0.0),
        ("dorito1",     (3.0, 3.0, 2.1),   (-14.0,  10.0), TAU / 8),
        ("dorito2",     (2.8, 2.8, 2.0),   (-8.5,   13.0), TAU / 8),
        ("dorito3",     (2.6, 2.6, 1.9),   (-3.0,   15.0), TAU / 8),
        ("midlow",      (5.4, 1.6, 1.4),   (-7.5,   -6.5), 0.25),
        ("midhigh",     (3.2, 3.2, 2.4),   (-8.0,    5.0), -0.3),
        ("wing",        (2.4, 2.4, 2.2),   (-13.0,   0.0), 0.0),
    ]
    for name, size, (x, y), yaw in HALF:
        objects += vs.build_inflatable(mats, f"Bnk_c_{name}", size, (x, y, 0.06), rotation=yaw)
        objects += vs.build_inflatable(mats, f"Bnk_m_{name}", size, (-x, -y, 0.06),
                                       rotation=yaw + math.pi)

    PLANTERS = [((-16.5, 5.5), 0.4, 6.0), ((-4.0, -9.5), -0.25, 5.5), ((-11.0, -2.5), 0.9, 5.0)]
    for (x, y), rot, length in PLANTERS:
        objects += vs.build_planter(mats, f"Pl_c_{int(x)}_{int(y)}", (x, y, 0.06),
                                    rotation=rot, length=length)
        objects += vs.build_planter(mats, f"Pl_m_{int(x)}_{int(y)}", (-x, -y, 0.06),
                                    rotation=rot + math.pi, length=length)

    # Behind the property: dock, yacht, palms, floodlights.
    objects += build_dock_and_yacht(mats, (6.0, 46.0, 0.0))
    for i, (x, y, h) in enumerate(((-40, 30, 12.5), (-34, 38, 10.5), (38, 30, 12.0),
                                   (44, 38, 11.0), (-46, 8, 11.5), (47, 6, 12.0))):
        objects += build_palm(mats, f"Palm{i}", (x, y, 0.0), height=h, seed=i * 17)
    for i, (x, y, rot) in enumerate(((-hw - 4, hd - 6, 0.5), (hw + 4, hd - 6, -0.5),
                                     (-hw - 4, -hd + 8, 2.6), (hw + 4, -hd + 8, -2.6))):
        objects += build_floodlight(mats, f"Flood{i}", (x, y, 0.0), rotation=rot)

    # Paint: cyan holds the west, magenta the east, mixed through the courtyard.
    splats = []
    import random
    rng = random.Random(4)
    for i in range(15):
        splats.append(("cyan", (rng.uniform(-30, -6), rng.uniform(-18, 18)),
                       rng.uniform(1.3, 2.5), 100 + i, rng.uniform(0, TAU)))
    for i in range(15):
        splats.append(("magenta", (rng.uniform(6, 30), rng.uniform(-18, 18)),
                       rng.uniform(1.3, 2.5), 200 + i, rng.uniform(0, TAU)))
    for i in range(8):
        team = "cyan" if i % 2 else "magenta"
        splats.append((team, (rng.uniform(-7, 7), rng.uniform(-16, 16)),
                       rng.uniform(1.1, 2.0), 300 + i, rng.uniform(0, TAU)))
    for team, (x, y), scale, seed, rot in splats:
        objects += vs.build_paint_decal(mats, f"Sp_{team}_{seed}", f"paint_{team}",
                                        (x, y, 0.11), scale=scale, seed=seed, rotation=rot)
    return objects


def main() -> None:
    args = script_args()
    samples = int(args[args.index("--samples") + 1]) if "--samples" in args else 128
    shot = args[args.index("--shot") + 1] if "--shot" in args else "wide"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"

    mats = vs.make_materials()
    build_estate(mats)
    vs.setup_world()
    vs.build_reflection_cards()
    vs.setup_sun()

    ESTATE_DIR.mkdir(parents=True, exist_ok=True)
    shots = {
        # Elevated three-quarter, off-centre, near fence along the bottom edge.
        "wide": (vs.add_camera("Cam_wide", (30.0, -70.0, 30.0), (-1.0, 6.0, 4.0), 28.0),
                 1672, 941),
        "courtyard": (vs.add_camera("Cam_court", (20.0, -34.0, 20.0), (-2.0, 6.0, 4.0), 45.0),
                      1672, 941),
    }
    for name in (shots.keys() if shot == "all" else [shot]):
        camera, w, h = shots[name]
        bpy.context.scene.camera = camera
        vs.setup_render(samples, w, h)
        path = ESTATE_DIR / f"{name}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        log(f"wrote estate/{path.name}  ({w}x{h}, {samples} samples)")


if __name__ == "__main__":
    main()
