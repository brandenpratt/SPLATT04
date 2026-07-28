"""Build the VICE ESTATE 04 modular blockout kit in Blender.

    blender --background --python tools/blender/build_vice_estate_kit.py -- [--save]

Reads the approved layout and asset manifest, constructs one original module per manifest
asset, then instances those modules at every layout placement. Deterministic: the same
inputs always produce the same scene, so the pipeline reproduces outside an MCP session
and can run in CI.

This is a BLOCKOUT. Proportions are provisional until the Gate A composition review.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from viceestate_common import (  # noqa: E402
    BLEND_DIR,
    KIT_COLLECTION,
    LAYOUT_COLLECTION,
    SCENERY_COLLECTION,
    add_box,
    add_cone,
    add_cylinder,
    add_sphere,
    deselect_all,
    ensure_collection,
    game_scale_to_blender,
    game_to_blender,
    game_yaw_to_blender,
    join_as,
    apply_transforms,
    link_only,
    load_layout,
    load_manifest,
    log,
    reset_scene,
    script_args,
)

TAU = math.tau


# ---------------------------------------------------------------------------
# Module builders — one per asset id in the manifest.
# Each returns a single joined object with its origin at the world origin.
# ---------------------------------------------------------------------------


def build_villa(name: str, width: float, depth: float, accent: str, kit):
    """Two-storey Miami villa: glossy white panelled shell, aqua glass band, neon garage.

    Matched to the reference close-ups: thick rounded shell, a recessed upper glazing band
    with a glass balcony rail, and a bright neon garage door with a ramp at ground level.
    Only the ground floor is playable; everything above the slab is scenery.
    """
    parts = []
    hw, hd = width / 2, depth / 2
    g_h, u_h = 5.2, 5.4

    # Ground mass, slightly wider than the upper storey so the slab reads as an overhang.
    parts.append(add_box(f"{name}_ground", (width, depth, g_h), (0, 0, g_h / 2), material="villa_white"))
    # Panel seams.
    for i in range(4):
        parts.append(add_box(f"{name}_seam{i}", (width + 0.04, depth + 0.04, 0.05),
                             (0, 0, 1.0 + i * 1.0), material="panel_white"))
    parts.append(add_box(f"{name}_slab", (width + 1.1, depth + 1.1, 0.5), (0, 0, g_h + 0.25),
                         material="villa_white"))

    # Upper storey with a deep aqua glazing band on the courtyard face.
    parts.append(add_box(f"{name}_upper", (width - 1.8, depth - 1.6, u_h),
                         (0, 0, g_h + 0.5 + u_h / 2), material="villa_white"))
    parts.append(add_box(f"{name}_glassband", (width - 1.5, 0.3, u_h * 0.56),
                         (0, hd - 0.9, g_h + 0.5 + u_h * 0.56), material="glass_aqua"))
    parts.append(add_box(f"{name}_glassside", (0.3, depth - 2.6, u_h * 0.5),
                         (-(hw - 1.1), 0, g_h + 0.5 + u_h * 0.56), material="glass_aqua"))
    # Glass balcony rail on the slab edge.
    parts.append(add_box(f"{name}_rail", (width + 0.9, 0.12, 0.9), (0, hd + 0.5, g_h + 1.0),
                         material="glass_aqua"))
    parts.append(add_box(f"{name}_railcap", (width + 1.0, 0.2, 0.1), (0, hd + 0.5, g_h + 1.45),
                         material="chrome"))

    # Ground-floor glazing either side of the garage.
    for sign in (-1, 1):
        parts.append(add_box(f"{name}_gwin{sign}", (width * 0.26, 0.25, g_h * 0.5),
                             (sign * width * 0.31, hd + 0.02, g_h * 0.55), material="glass_aqua"))

    # Neon garage entry: recessed opening, glowing door bars, chrome surround, ramp.
    door_w = width * 0.30
    parts.append(add_box(f"{name}_garage", (door_w + 0.5, 0.5, g_h * 0.72),
                         (0, hd + 0.1, g_h * 0.36), material="chrome"))
    for i in range(5):
        parts.append(add_box(f"{name}_bar{i}", (door_w, 0.16, 0.22),
                             (0, hd + 0.3, 0.55 + i * 0.62), material=accent))
    parts.append(add_box(f"{name}_ramp", (door_w + 0.4, 3.4, 0.16), (0, hd + 2.0, 0.12),
                         material="panel_white"))
    # Accent light strip under the slab, washing the facade.
    parts.append(add_box(f"{name}_wash", (width - 1.0, 0.14, 0.14), (0, hd + 0.5, g_h - 0.25),
                         material=accent))
    return join_as(name, parts, kit)


def build_villa_roof(name: str, width: float, depth: float, kit):
    """Thick glossy orange roof slab with rounded corners — the reference's loudest cue."""
    parts = []
    t = 1.05  # slab thickness: the reference roof is a chunky solid, not a thin cap
    parts.append(add_box(f"{name}_slab", (width, depth, t), (0, 0, t / 2), material="roof_orange"))
    # Rounded corners and edges via capsule-ish cylinders along the perimeter.
    for sx in (-1, 1):
        parts.append(add_cylinder(f"{name}_edge_x{sx}", t / 2, depth, (sx * width / 2, 0, t / 2),
                                  rotation=(TAU / 4, 0, 0), material="roof_orange", vertices=16))
    for sy in (-1, 1):
        parts.append(add_cylinder(f"{name}_edge_y{sy}", t / 2, width, (0, sy * depth / 2, t / 2),
                                  rotation=(0, TAU / 4, 0), material="roof_orange", vertices=16))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(add_sphere(f"{name}_c{sx}{sy}", t / 2,
                                    (sx * width / 2, sy * depth / 2, t / 2), material="roof_orange"))
    # Panel joints across the roof.
    for i in range(-2, 3):
        parts.append(add_box(f"{name}_joint{i}", (0.06, depth * 0.96, 0.03),
                             (i * width / 5.5, 0, t + 0.01), material="roof_orange"))
    return join_as(name, parts, kit)


def build_glass_bridge(name: str, span: float, kit):
    """Aqua glass walkway with orange structural rails. Scenery: no collider is emitted."""
    parts = [
        add_box(f"{name}_deck", (span, 3.4, 0.28), (0, 0, -1.3), material="roof_orange"),
        add_box(f"{name}_glass", (span, 3.2, 2.2), (0, 0, -0.1), material="glass_aqua"),
    ]
    for sy in (-1, 1):
        parts.append(add_box(f"{name}_rail{sy}", (span + 0.3, 0.14, 0.16), (0, sy * 1.7, 1.05),
                             material="chrome"))
        for i in range(9):
            parts.append(add_cylinder(f"{name}_post{sy}{i}", 0.05, 1.1,
                                      (-span / 2 + i * span / 8, sy * 1.7, 0.45),
                                      material="chrome", vertices=8))
    return join_as(name, parts, kit)


def build_flamingo_fountain(name: str, kit, detail: int = 1, scale: float = 1.0):
    """The hero landmark: a huge polished chrome flamingo in a tiered, cyan-lit basin.

    Deliberately oversized — in the reference it dominates the courtyard and stays
    recognisable at thumbnail size, which a small sculpture would not.
    """
    parts = []
    # Tiered basin: chrome outer lip, cyan neon inner ring, turquoise water.
    parts.append(add_cylinder(f"{name}_outer", 4.6, 0.55, (0, 0, 0.275), material="chrome", vertices=48))
    parts.append(add_cylinder(f"{name}_step", 4.15, 0.30, (0, 0, 0.62), material="panel_white", vertices=48))
    parts.append(add_cylinder(f"{name}_neon", 3.75, 0.16, (0, 0, 0.80), material="neon_cyan", vertices=48))
    parts.append(add_cylinder(f"{name}_inner", 3.45, 0.20, (0, 0, 0.86), material="chrome", vertices=48))
    parts.append(add_cylinder(f"{name}_water", 3.30, 0.10, (0, 0, 0.92), material="water", vertices=48))

    if detail > 0:
        # Legs: one straight, one tucked, as in the reference.
        parts.append(add_cylinder(f"{name}_leg_a", 0.17, 3.1, (0.10, 0.05, 2.5), material="chrome", vertices=14))
        parts.append(add_cylinder(f"{name}_leg_b", 0.16, 1.5, (-0.42, 0.10, 2.2),
                                  rotation=(0, TAU / 7, 0), material="chrome", vertices=14))
        parts.append(add_sphere(f"{name}_foot", 0.34, (0.10, 0.05, 1.05), (1.5, 1.9, 0.5), material="chrome"))

        # Body: large teardrop with a wing panel.
        parts.append(add_sphere(f"{name}_body", 1.0, (0, -0.15, 4.35), (1.30, 2.05, 1.20), material="chrome"))
        parts.append(add_sphere(f"{name}_wing", 1.0, (0.42, -0.20, 4.55), (0.55, 1.55, 0.85), material="chrome"))
        parts.append(add_cone(f"{name}_tail", 0.62, 1.5, (0, 1.62, 4.55),
                              rotation=(-TAU / 4.6, 0, 0), material="chrome"))

        # S-curved neck built from segments.
        neck = [(0.0, -1.05, 5.35, 0.34), (0.02, -1.45, 6.05, 0.30),
                (0.03, -1.42, 6.75, 0.27), (0.02, -1.10, 7.30, 0.25)]
        for i, (nx, ny, nz, r) in enumerate(neck):
            parts.append(add_sphere(f"{name}_neck{i}", r, (nx, ny, nz), (1, 1.35, 1.25), material="chrome"))
        parts.append(add_sphere(f"{name}_head", 0.42, (0, -0.86, 7.62), (1, 1.25, 1.0), material="chrome"))
        # Down-curved black-tipped beak.
        parts.append(add_cone(f"{name}_beak", 0.24, 1.05, (0, -1.42, 7.42),
                              rotation=(-TAU / 3.4, 0, 0), material="chrome"))
        parts.append(add_cone(f"{name}_beaktip", 0.15, 0.42, (0, -1.78, 7.16),
                              rotation=(-TAU / 3.1, 0, 0), material="graphite"))
    merged = join_as(name, parts, kit)
    if scale != 1.0:
        # Scaled after joining so the whole landmark grows together, basin included.
        merged.scale = (scale, scale, scale)
        apply_transforms(merged)
    return merged


def _planter_shell(name, parts, length, width_, accent):
    """Shared planter treatment: white shell, neon strip, dense planting."""
    parts.append(add_box(f"{name}_shell", (length, width_, 1.05), (0, 0, 0.52), material="panel_white"))
    parts.append(add_box(f"{name}_cap", (length + 0.12, width_ + 0.12, 0.12), (0, 0, 1.06),
                         material="villa_white"))
    parts.append(add_box(f"{name}_strip", (length * 0.94, width_ + 0.16, 0.1), (0, 0, 0.72),
                         material=accent))
    parts.append(add_box(f"{name}_soil", (length - 0.4, width_ - 0.4, 0.16), (0, 0, 1.06),
                         material="graphite"))
    count = max(3, int(length))
    for i in range(count):
        px = -length / 2 + 0.5 + i * (length - 1.0) / max(1, count - 1)
        parts.append(add_sphere(f"{name}_plant{i}", 0.46, (px, 0, 1.34), (1.0, 0.9, 0.75),
                                material="foliage"))
        for f in range(4):
            ang = (f / 4) * TAU
            parts.append(add_cone(f"{name}_frond{i}_{f}", 0.16, 0.8,
                                  (px + math.cos(ang) * 0.3, math.sin(ang) * 0.22, 1.62),
                                  rotation=(TAU / 5, 0, ang), material="foliage"))
    return parts


def build_planter_curved(name: str, kit):
    """Banana-shaped luxury planter, as in the courtyard close-up."""
    parts = []
    segments = 5
    for i in range(segments):
        t = (i / (segments - 1)) - 0.5
        ang = t * 1.15
        px, py = math.sin(ang) * 3.1, (math.cos(ang) - 0.94) * 3.1
        parts.append(add_box(f"{name}_seg{i}", (1.35, 1.5, 1.05), (px, py, 0.52),
                             rotation=(0, 0, -ang), material="panel_white"))
        parts.append(add_box(f"{name}_cap{i}", (1.42, 1.6, 0.12), (px, py, 1.06),
                             rotation=(0, 0, -ang), material="villa_white"))
        parts.append(add_box(f"{name}_strip{i}", (1.36, 1.66, 0.1), (px, py, 0.72),
                             rotation=(0, 0, -ang), material="neon_cyan"))
        parts.append(add_sphere(f"{name}_plant{i}", 0.5, (px, py, 1.32), (1.0, 0.9, 0.75),
                                material="foliage"))
        for f in range(4):
            a2 = (f / 4) * TAU
            parts.append(add_cone(f"{name}_fr{i}_{f}", 0.17, 0.85,
                                  (px + math.cos(a2) * 0.32, py + math.sin(a2) * 0.32, 1.62),
                                  rotation=(TAU / 5, 0, a2), material="foliage"))
    return join_as(name, parts, kit)


def build_planter_straight(name: str, kit):
    parts = _planter_shell(name, [], 5.2, 2.2, "neon_cyan")
    return join_as(name, parts, kit)


def _inflatable(name, parts, material="vinyl_black"):
    return parts


def build_bunker_dome(name: str, kit):
    """Glossy black inflatable pill — soft, pressurised, with a seam."""
    parts = [
        add_sphere(f"{name}_body", 2.3, (0, 0, 1.05), (1.0, 1.35, 0.78), material="vinyl_black", segments=28),
        add_cylinder(f"{name}_seam", 2.31, 0.06, (0, 0, 1.05), material="graphite", vertices=32),
        add_cylinder(f"{name}_skirt", 2.25, 0.22, (0, 0, 0.12), material="vinyl_black", vertices=32),
    ]
    return join_as(name, parts, kit)


def build_bunker_wedge(name: str, kit):
    """Rounded inflatable wedge with a team stripe."""
    parts = [
        add_box(f"{name}_body", (3.2, 3.2, 1.6), (0, 0, 0.8), material="vinyl_black"),
        add_cylinder(f"{name}_top", 0.8, 3.2, (0, 0, 1.6), rotation=(0, TAU / 4, 0),
                     material="vinyl_black", vertices=20),
        add_box(f"{name}_stripe", (3.26, 0.16, 0.14), (0, -1.5, 0.95), material="neon_cyan"),
    ]
    return join_as(name, parts, kit)


def build_bunker_block(name: str, kit):
    """Soft-edged inflatable cube."""
    parts = [add_box(f"{name}_body", (3.8, 4.4, 2.4), (0, 0, 1.2), material="vinyl_black")]
    for sx in (-1, 1):
        parts.append(add_cylinder(f"{name}_ex{sx}", 0.42, 4.4, (sx * 1.9, 0, 1.2),
                                  rotation=(TAU / 4, 0, 0), material="vinyl_black", vertices=14))
    for sy in (-1, 1):
        parts.append(add_cylinder(f"{name}_ey{sy}", 0.42, 3.8, (0, sy * 2.2, 1.2),
                                  rotation=(0, TAU / 4, 0), material="vinyl_black", vertices=14))
    parts.append(add_box(f"{name}_seam", (3.9, 4.5, 0.06), (0, 0, 1.2), material="graphite"))
    return join_as(name, parts, kit)


def build_bunker_can(name: str, kit):
    parts = [
        add_cylinder(f"{name}_body", 1.35, 2.7, (0, 0, 1.35), material="vinyl_black", vertices=28),
        add_sphere(f"{name}_cap", 1.35, (0, 0, 2.7), (1, 1, 0.45), material="vinyl_black"),
        add_cylinder(f"{name}_seam", 1.37, 0.06, (0, 0, 1.5), material="graphite", vertices=28),
    ]
    return join_as(name, parts, kit)


def build_bunker_ramp(name: str, kit):
    """Long angular inflatable ramp on the cyan lane."""
    parts = [
        add_box(f"{name}_body", (6.0, 8.4, 2.6), (0, 0, 1.3), material="vinyl_black"),
        add_box(f"{name}_slope", (6.1, 3.6, 1.4), (0, 3.4, 0.7), rotation=(0.42, 0, 0),
                material="vinyl_black"),
        add_box(f"{name}_stripe", (6.06, 0.18, 0.16), (0, -4.2, 1.7), material="neon_cyan"),
        add_box(f"{name}_window", (1.6, 0.3, 0.9), (0, -4.25, 1.2), material="graphite"),
    ]
    return join_as(name, parts, kit)


def build_perimeter_straight(name: str, length: float, kit):
    """Thick stacked inflatable tubes with a neon pipe — the reference fence is chunky."""
    parts = []
    for i, (r, z) in enumerate([(0.62, 0.62), (0.56, 1.62), (0.44, 2.40)]):
        parts.append(add_cylinder(f"{name}_tube{i}", r, length, (0, 0, z),
                                  rotation=(0, TAU / 4, 0), material="vinyl_black", vertices=20))
    parts.append(add_box(f"{name}_pipe", (length * 0.98, 0.14, 0.14), (0, 0.6, 1.15),
                         material="neon_cyan"))
    for i in range(3):
        parts.append(add_cylinder(f"{name}_rib{i}", 0.66, 0.1,
                                  (-length / 2 + (i + 1) * length / 4, 0, 1.3),
                                  rotation=(0, TAU / 4, 0), material="graphite", vertices=18))
    return join_as(name, parts, kit)


def build_perimeter_corner(name: str, kit):
    parts = [
        add_cylinder(f"{name}_post", 0.8, 2.9, (0, 0, 1.45), material="vinyl_black", vertices=24),
        add_sphere(f"{name}_cap", 0.8, (0, 0, 2.9), (1, 1, 0.5), material="vinyl_black"),
        add_cylinder(f"{name}_ring", 0.84, 0.12, (0, 0, 1.15), material="neon_cyan", vertices=24),
    ]
    return join_as(name, parts, kit)


def build_ground_court(name: str, width: float, depth: float, kit):
    """Bright turf field with a large-paver terrazzo courtyard and tile paths."""
    parts = [add_box(f"{name}_turf", (width, depth, 0.10), (0, 0, -0.05), material="turf")]
    # Central paved courtyard.
    parts.append(add_box(f"{name}_court", (width * 0.46, depth * 0.52, 0.08), (0, 0, 0.0),
                         material="terrazzo"))
    # Paver joints.
    for i in range(-5, 6):
        parts.append(add_box(f"{name}_jx{i}", (0.07, depth * 0.52, 0.02),
                             (i * width * 0.046, 0, 0.045), material="panel_white"))
    for j in range(-5, 6):
        parts.append(add_box(f"{name}_jz{j}", (width * 0.46, 0.07, 0.02),
                             (0, j * depth * 0.052, 0.045), material="panel_white"))
    # Tile patches reaching into the turf lanes, as in the reference.
    for sx in (-1, 1):
        for k in range(3):
            parts.append(add_box(f"{name}_patch{sx}{k}", (7.0, 7.0, 0.07),
                                 (sx * (width * 0.30 + k * 0.6), -14 + k * 13, 0.0),
                                 material="terrazzo"))
    return join_as(name, parts, kit)


def build_paint_splat(name: str, kit, material: str):
    """Authored pre-match paint: an irregular star burst with satellite droplets."""
    parts = []
    seed = 7 if "cyan" in name else 23
    rng = seed
    def rnd():
        nonlocal rng
        rng = (rng * 1103515245 + 12345) % 2147483648
        return rng / 2147483648
    parts.append(add_cylinder(f"{name}_core", 1.5, 0.03, (0, 0, 0.015), material=material, vertices=22))
    for i in range(11):
        ang = (i / 11) * TAU + rnd() * 0.4
        dist = 1.2 + rnd() * 1.9
        r = 0.25 + rnd() * 0.55
        parts.append(add_cylinder(f"{name}_lobe{i}", r, 0.03,
                                  (math.cos(ang) * dist, math.sin(ang) * dist, 0.015),
                                  material=material, vertices=12))
    for i in range(9):
        ang = rnd() * TAU
        dist = 2.4 + rnd() * 2.2
        r = 0.10 + rnd() * 0.2
        parts.append(add_cylinder(f"{name}_drop{i}", r, 0.03,
                                  (math.cos(ang) * dist, math.sin(ang) * dist, 0.015),
                                  material=material, vertices=8))
    return join_as(name, parts, kit)


def build_chrome_sphere(name: str, kit):
    """Dark mirror orb on a magenta-lit dais with planting around the base."""
    parts = [
        add_cylinder(f"{name}_dais", 2.6, 0.42, (0, 0, 0.21), material="panel_white", vertices=36),
        add_cylinder(f"{name}_neon", 2.45, 0.12, (0, 0, 0.45), material="neon_magenta", vertices=36),
        add_cylinder(f"{name}_inner", 2.15, 0.14, (0, 0, 0.5), material="foliage", vertices=36),
        add_sphere(f"{name}_orb", 1.45, (0, 0, 1.85), material="chrome_dark", segments=32),
    ]
    return join_as(name, parts, kit)


def build_bench_low(name: str, kit):
    parts = [
        add_box(f"{name}_seat", (4.2, 1.3, 0.5), (0, 0, 0.45), material="panel_white"),
        add_box(f"{name}_base", (3.8, 1.0, 0.4), (0, 0, 0.2), material="villa_white"),
    ]
    return join_as(name, parts, kit)


def build_patio_set(name: str, kit):
    """Chrome table with a parasol, on the cyan lane."""
    parts = [
        add_cylinder(f"{name}_top", 1.1, 0.08, (0, 0, 0.78), material="chrome", vertices=24),
        add_cylinder(f"{name}_stem", 0.09, 2.6, (0, 0, 1.3), material="chrome", vertices=12),
        add_cone(f"{name}_parasol", 2.3, 0.7, (0, 0, 2.75), material="panel_white"),
    ]
    for i in range(4):
        ang = (i / 4) * TAU
        parts.append(add_cylinder(f"{name}_chair{i}", 0.42, 0.08,
                                  (math.cos(ang) * 1.7, math.sin(ang) * 1.7, 0.5),
                                  material="chrome", vertices=14))
    return join_as(name, parts, kit)


def build_ocean(name: str, kit):
    """Turquoise bay. Scenery only — never collidable, never paintable.

    Deliberately enormous. At 900 m deep the bay's far edge landed above the top of the
    review frame, so the render had no waterline at all and the entire upper third was
    flat turquoise. Pushing the far edge past 5 km puts it within a fraction of a degree
    of the true horizon, which is what gives the sunset band something to sit on.
    """
    parts = [add_box(f"{name}_surface", (12000, 12000, 0.2), (0, 0, 0), material="water")]
    return join_as(name, parts, kit)


def build_seawall(name: str, kit):
    parts = [
        add_box(f"{name}_wall", (110, 2.2, 1.6), (0, 0, 0.8), material="panel_white"),
        add_box(f"{name}_cap", (110.4, 2.6, 0.2), (0, 0, 1.65), material="villa_white"),
    ]
    return join_as(name, parts, kit)


def build_dock(name: str, kit):
    parts = [add_box(f"{name}_deck", (6.5, 22.0, 0.6), (0, 0, 0.3), material="panel_white")]
    for i, y in enumerate((-9.0, -3.0, 3.0, 9.0)):
        for sx in (-1, 1):
            parts.append(add_cylinder(f"{name}_pile{i}{sx}", 0.22, 2.6, (sx * 2.9, y, 0.9),
                                      material="trunk", vertices=10))
    return join_as(name, parts, kit)


def build_yacht(name: str, kit):
    parts = [
        add_box(f"{name}_hull", (4.6, 15.0, 1.7), (0, 0, 0.85), material="villa_white"),
        add_cone(f"{name}_bow", 2.3, 4.6, (0, 8.6, 0.85), rotation=(-TAU / 4, 0, 0),
                 material="villa_white"),
        add_box(f"{name}_house", (3.4, 6.0, 1.5), (0, -1.2, 2.4), material="villa_white"),
        add_box(f"{name}_glass", (3.2, 0.24, 0.8), (0, 1.8, 2.6), material="glass_aqua"),
        add_box(f"{name}_stripe", (4.65, 12.0, 0.14), (0, 0, 1.5), material="chrome"),
    ]
    return join_as(name, parts, kit)


def build_palm(name: str, kit, fronds: int = 9):
    parts = [add_cylinder(f"{name}_trunk", 0.30, 11.0, (0, 0, 5.5), rotation=(0.06, 0, 0),
                          material="trunk", vertices=12)]
    for i in range(6):
        parts.append(add_cylinder(f"{name}_ring{i}", 0.33, 0.16, (0, 0, 1.4 + i * 1.6),
                                  material="trunk", vertices=12))
    for i in range(fronds):
        ang = (i / fronds) * TAU
        frond = add_cone(f"{name}_frond{i}", 0.95, 4.6,
                         (math.cos(ang) * 1.9, math.sin(ang) * 1.9, 10.6),
                         rotation=(TAU / 5.0, 0, ang), material="foliage")
        frond.scale = (1.0, 0.14, 1.0)
        parts.append(frond)
    parts.append(add_sphere(f"{name}_crown", 0.5, (0, 0, 11.0), material="trunk"))
    return join_as(name, parts, kit)


def build_floodlight(name: str, kit):
    parts = [
        add_cylinder(f"{name}_mast", 0.26, 13.0, (0, 0, 6.5), material="graphite", vertices=12),
        add_box(f"{name}_frame", (3.4, 0.4, 2.2), (0, 0, 13.2), material="graphite"),
    ]
    for ix in (-1, 0, 1):
        for iz in (-1, 1):
            parts.append(add_box(f"{name}_lamp{ix}{iz}", (0.95, 0.2, 0.85),
                                 (ix * 1.05, 0.28, 13.2 + iz * 0.52), material="lamp"))
    return join_as(name, parts, kit)


def build_skyline(name: str, span: float, height_scale: float, seed: int, kit):
    """Layered Miami skyline: varied towers, hazed by distance in the render."""
    parts = []
    rng = seed
    x = -span / 2
    index = 0
    while x < span / 2:
        rng = (rng * 1103515245 + 12345) % 2147483648
        r = rng / 2147483648
        width = 7 + r * 13
        rng = (rng * 1103515245 + 12345) % 2147483648
        r2 = rng / 2147483648
        height = (26 + r2 * 74) * height_scale
        parts.append(add_box(f"{name}_t{index}", (width, 8.0, height),
                             (x + width / 2, 0, height / 2), material="skyline"))
        if r2 > 0.62:
            parts.append(add_box(f"{name}_crown{index}", (width * 0.42, 8.2, height * 0.14),
                                 (x + width / 2, 0, height * 1.06), material="skyline"))
        x += width + 1.5 + r * 5
        index += 1
    return join_as(name, parts, kit)


# ---------------------------------------------------------------------------


def build_kit(layout: dict, manifest: dict):
    """Construct one module per manifest asset."""
    kit = ensure_collection(KIT_COLLECTION)
    built: dict[str, "bpy.types.Object"] = {}
    dims = layout["dimensions"]

    builders = {
        "villa-west": lambda n: build_villa(n, 17.0, 14.0, "neon_cyan", kit),
        "villa-east": lambda n: build_villa(n, 18.0, 15.4, "neon_magenta", kit),
        "villa-roof-west": lambda n: build_villa_roof(n, 18.6, 15.6, kit),
        "villa-roof-east": lambda n: build_villa_roof(n, 19.6, 17.0, kit),
        "glass-bridge": lambda n: build_glass_bridge(n, 22.0, kit),
        "flamingo-fountain": lambda n: build_flamingo_fountain(n, kit, detail=1, scale=2.05),
        "planter-curved": lambda n: build_planter_curved(n, kit),
        "planter-straight": lambda n: build_planter_straight(n, kit),
        "bunker-can": lambda n: build_bunker_can(n, kit),
        "bunker-ramp": lambda n: build_bunker_ramp(n, kit),
        "chrome-sphere": lambda n: build_chrome_sphere(n, kit),
        "bench-low": lambda n: build_bench_low(n, kit),
        "patio-set": lambda n: build_patio_set(n, kit),
        "ocean": lambda n: build_ocean(n, kit),
        "seawall": lambda n: build_seawall(n, kit),
        "paint-splat-cyan": lambda n: build_paint_splat(n, kit, "paint_cyan"),
        "paint-splat-magenta": lambda n: build_paint_splat(n, kit, "paint_magenta"),
        "bunker-dome": lambda n: build_bunker_dome(n, kit),
        "bunker-wedge": lambda n: build_bunker_wedge(n, kit),
        "bunker-block": lambda n: build_bunker_block(n, kit),
        "perimeter-straight": lambda n: build_perimeter_straight(n, 8.0, kit),
        "perimeter-corner": lambda n: build_perimeter_corner(n, kit),
        "ground-court": lambda n: build_ground_court(n, dims["width"], dims["depth"], kit),
        "dock": lambda n: build_dock(n, kit),
        "yacht": lambda n: build_yacht(n, kit),
        "palm": lambda n: build_palm(n, kit),
        "floodlight": lambda n: build_floodlight(n, kit),
        # Wide and low. At the old 620 m span the skyline covered a third of the frame
        # and stood as tall as the villas; the reference wants a thin hazy band across
        # the whole horizon, subordinate to the estate.
        "skyline-far": lambda n: build_skyline(n, 3000.0, 0.55, 7, kit),
        "skyline-near": lambda n: build_skyline(n, 2600.0, 0.34, 23, kit),
        # Lower-detail variants referenced by the manifest's LOD entries.
        "flamingo-fountain-lod1": lambda n: build_flamingo_fountain(n, kit, detail=0),
        "palm-lod1": lambda n: build_palm(n, kit, fronds=4),
    }

    wanted = [asset["id"] for asset in manifest["assets"]]
    # LOD variants are built too, so the exporter can emit every url the manifest names.
    for asset in manifest["assets"]:
        for lod in asset.get("lods", []):
            lod_id = Path(lod["url"]).stem
            if lod_id not in wanted:
                wanted.append(lod_id)

    for asset_id in wanted:
        builder = builders.get(asset_id)
        if builder is None:
            log(f"WARNING: no builder for manifest asset '{asset_id}' — skipped")
            continue
        deselect_all()
        built[asset_id] = builder(asset_id)

    log(f"built {len(built)} kit modules")
    return kit, built


def place_layout(layout: dict, built: dict):
    """Instance the kit at every placement in the approved layout."""
    play = ensure_collection(LAYOUT_COLLECTION)
    scenery = ensure_collection(SCENERY_COLLECTION)
    placed = 0
    missing = set()

    for placement in layout["placements"]:
        source = built.get(placement["asset"])
        if source is None:
            missing.add(placement["asset"])
            continue
        # Linked duplicate: one mesh, many instances. Keeps the .blend small and makes the
        # kit genuinely modular rather than 75 unique meshes.
        instance = bpy.data.objects.new(placement["id"], source.data)
        location, yaw = game_to_blender(*placement["transform"]["position"]), game_yaw_to_blender(
            placement["transform"]["rotationY"]
        )
        instance.location = location
        instance.rotation_euler = (0.0, 0.0, yaw)
        sx, sy, sz = placement["transform"]["scale"]
        instance.scale = game_scale_to_blender(sx, sy, sz)
        target = scenery if placement.get("inaccessible") else play
        target.objects.link(instance)
        placed += 1

    if missing:
        log(f"WARNING: {len(missing)} placements referenced unbuilt assets: {sorted(missing)}")
    log(f"placed {placed} instances ({len(layout['placements'])} in layout)")

    # Kit masters are authoring sources, not part of the arena render.
    kit = bpy.data.collections.get(KIT_COLLECTION)
    if kit is not None:
        kit.hide_viewport = True
        kit.hide_render = True
    return placed


def main() -> None:
    args = script_args()
    layout = load_layout()
    manifest = load_manifest()

    log(f"layout status: {layout['status']} (referenceLocked={layout['referenceLocked']})")
    if layout["status"] != "gate-a-approved":
        log("NOTE: this is a provisional blockout. Proportions are not final art.")

    reset_scene()
    kit, built = build_kit(layout, manifest)
    place_layout(layout, built)

    if "--save" in args:
        BLEND_DIR.mkdir(parents=True, exist_ok=True)
        out = BLEND_DIR / "vice-estate-blockout.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(out))
        log(f"saved {out}")

    log("build complete")


if __name__ == "__main__":
    main()
