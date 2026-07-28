"""VICE ESTATE 04 — reference-quality vertical slice.

    blender --background --python tools/blender/build_vertical_slice.py -- [--samples 256]
                                                                          [--shot all|slice|flamingo|villa]

Builds a small, fully-finished corner of the estate at final quality and renders it in
Cycles. The point is not coverage — it is to prove one convincing piece of art before the
modular kit is built and exported.

Contents: a curved villa facade with a chunky orange roof, recessed aqua glass and a lit
garage portal; the chrome flamingo and its fountain; a glossy black inflatable bunker; a
white curved planter; authored cyan and magenta paint decals; Golden Hour sun and a sky
that doubles as the reflection environment.

Why Cycles and not EEVEE: the slice has to demonstrate mirror chrome carrying real scene
colour, dark reflective glass and soft contact shadows. Those are the things screen-space
reflections cannot do, and they are exactly what the blockout was failing to show.

Nothing here is procedural placeholder geometry. Every hero surface is beveled, smooth
shaded and given roughness variation.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from viceestate_common import ART_DIR, log, script_args  # noqa: E402

TAU = math.tau
SLICE_DIR = ART_DIR / "slice"


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------


def _principled(name: str):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    return mat, mat.node_tree, bsdf


def _set(bsdf, key: str, value) -> None:
    """Set a Principled input if this Blender version exposes it under that name."""
    if key in bsdf.inputs:
        bsdf.inputs[key].default_value = value


def _noise_roughness(tree, bsdf, scale: float, low: float, high: float) -> None:
    """Break up roughness with procedural noise.

    A single flat roughness value is most of why the blockout reads as plastic: every
    highlight is the same size and shape across an entire surface.
    """
    tex = tree.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 6.0
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (low, low, low, 1.0)
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = (high, high, high, 1.0)
    tree.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    return tex


def _bump(tree, bsdf, scale: float, strength: float) -> None:
    tex = tree.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 8.0
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def make_materials() -> dict:
    mats = {}

    # Villa: warm off-white composite panel, clear-coated, with fine surface breakup so it
    # holds highlight detail instead of blowing to flat white.
    mat, tree, bsdf = _principled("slice_villa_white")
    _set(bsdf, "Base Color", (0.86, 0.845, 0.815, 1.0))
    _set(bsdf, "Metallic", 0.0)
    _set(bsdf, "Coat Weight", 0.35)
    _set(bsdf, "Coat Roughness", 0.12)
    _noise_roughness(tree, bsdf, 22.0, 0.28, 0.46)
    _bump(tree, bsdf, 90.0, 0.06)
    mats["villa_white"] = mat

    # Roof: saturated Miami orange, glossy and waterproof. Sampled from the reference roofs
    # and kept just below clipping.
    mat, tree, bsdf = _principled("slice_roof_orange")
    _set(bsdf, "Base Color", (0.98, 0.20, 0.020, 1.0))
    _set(bsdf, "Coat Weight", 0.7)
    _set(bsdf, "Coat Roughness", 0.06)
    _noise_roughness(tree, bsdf, 14.0, 0.09, 0.20)
    mats["roof_orange"] = mat

    # Dark aqua architectural glass: reflective, tinted, with a dim interior behind it.
    mat, tree, bsdf = _principled("slice_glass_aqua")
    _set(bsdf, "Base Color", (0.10, 0.34, 0.36, 1.0))
    _set(bsdf, "Metallic", 0.0)
    _set(bsdf, "Roughness", 0.045)
    _set(bsdf, "Transmission Weight", 0.55)
    _set(bsdf, "IOR", 1.48)
    _set(bsdf, "Coat Weight", 0.5)
    mats["glass_aqua"] = mat

    # Black inflatable vinyl: near-black but never crushed, broad soft highlights, and
    # roughness variation so the seams and folds read.
    mat, tree, bsdf = _principled("slice_vinyl_black")
    _set(bsdf, "Base Color", (0.021, 0.021, 0.024, 1.0))
    _set(bsdf, "Coat Weight", 0.45)
    _set(bsdf, "Coat Roughness", 0.10)
    _noise_roughness(tree, bsdf, 8.0, 0.13, 0.34)
    _bump(tree, bsdf, 26.0, 0.10)
    mats["vinyl_black"] = mat

    mat, tree, bsdf = _principled("slice_chrome")
    _set(bsdf, "Base Color", (0.93, 0.93, 0.95, 1.0))
    _set(bsdf, "Metallic", 1.0)
    _noise_roughness(tree, bsdf, 55.0, 0.015, 0.055)
    mats["chrome"] = mat

    mat, tree, bsdf = _principled("slice_planter_white")
    _set(bsdf, "Base Color", (0.90, 0.895, 0.88, 1.0))
    _set(bsdf, "Coat Weight", 0.25)
    _noise_roughness(tree, bsdf, 30.0, 0.30, 0.52)
    mats["planter_white"] = mat

    mat, tree, bsdf = _principled("slice_stone")
    _set(bsdf, "Base Color", (0.615, 0.596, 0.564, 1.0))
    _noise_roughness(tree, bsdf, 45.0, 0.40, 0.66)
    # Tile grid cut in as a bump, so the courtyard has scale instead of reading as paper.
    grid = tree.nodes.new("ShaderNodeTexBrick")
    grid.inputs["Scale"].default_value = 0.42
    grid.inputs["Mortar Size"].default_value = 0.016
    grid.inputs["Color1"].default_value = (1, 1, 1, 1)
    grid.inputs["Color2"].default_value = (1, 1, 1, 1)
    grid.inputs["Mortar"].default_value = (0, 0, 0, 1)
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.34
    bump.inputs["Distance"].default_value = 0.02
    tree.links.new(grid.outputs["Color"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mats["stone"] = mat

    mat, tree, bsdf = _principled("slice_turf")
    _set(bsdf, "Base Color", (0.16, 0.30, 0.07, 1.0))
    _noise_roughness(tree, bsdf, 120.0, 0.55, 0.85)
    _bump(tree, bsdf, 380.0, 0.30)
    mats["turf"] = mat

    # Wet paint: thick, glossy, with a coat and enough bump that the edges catch light.
    for key, colour in (("paint_cyan", (0.02, 0.42, 0.92, 1.0)),
                        ("paint_magenta", (0.92, 0.03, 0.45, 1.0))):
        mat, tree, bsdf = _principled(f"slice_{key}")
        _set(bsdf, "Base Color", colour)
        _set(bsdf, "Coat Weight", 0.9)
        _set(bsdf, "Coat Roughness", 0.05)
        _noise_roughness(tree, bsdf, 40.0, 0.06, 0.22)
        _bump(tree, bsdf, 60.0, 0.22)
        mats[key] = mat

    for key, colour, power in (("neon_cyan", (0.10, 0.85, 1.0), 14.0),
                               ("neon_magenta", (1.0, 0.12, 0.62), 14.0)):
        mat = bpy.data.materials.new(f"slice_{key}")
        mat.use_nodes = True
        tree = mat.node_tree
        tree.nodes.clear()
        out = tree.nodes.new("ShaderNodeOutputMaterial")
        emit = tree.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*colour, 1.0)
        emit.inputs["Strength"].default_value = power
        tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        mats[key] = mat

    mat, tree, bsdf = _principled("slice_foliage")
    _set(bsdf, "Base Color", (0.09, 0.22, 0.05, 1.0))
    _set(bsdf, "Roughness", 0.62)
    mats["foliage"] = mat

    # Distant skyline: pale and close to the sky it sits against. EEVEE and Cycles apply
    # no atmospheric perspective of their own, so the haze is baked into the albedo.
    mat, tree, bsdf = _principled("slice_skyline_haze")
    _set(bsdf, "Base Color", (0.72, 0.60, 0.62, 1.0))
    _set(bsdf, "Roughness", 0.95)
    mats["skyline_haze"] = mat

    mat, tree, bsdf = _principled("slice_water")
    _set(bsdf, "Base Color", (0.075, 0.420, 0.450, 1.0))
    _set(bsdf, "Roughness", 0.045)
    _set(bsdf, "Coat Weight", 0.6)
    _bump(tree, bsdf, 9.0, 0.09)
    mats["water"] = mat

    mat, tree, bsdf = _principled("slice_interior")
    _set(bsdf, "Base Color", (0.035, 0.045, 0.05, 1.0))
    _set(bsdf, "Roughness", 0.75)
    mats["interior"] = mat

    return mats


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _new_mesh(name: str):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def shade_smooth(obj, angle_deg: float = 40.0) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # Blender 4.1+ replaced mesh auto-smooth with a modifier; support both.
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(angle_deg)
    else:
        mod = obj.modifiers.new("SmoothByAngle", "NODES")
        group = bpy.data.node_groups.get("Smooth by Angle")
        if group is None:
            try:
                bpy.ops.object.modifier_add_node_group(
                    asset_library_type="ESSENTIALS",
                    relative_asset_identifier="geometry_nodes/smooth_by_angle.blend/NodeTree/Smooth by Angle")
                return
            except Exception:
                obj.modifiers.remove(mod)
                return
        mod.node_group = group


def bevel(obj, width: float, segments: int = 3) -> None:
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35.0)
    mod.harden_normals = True


def rounded_rect(width: float, depth: float, radius: float, arc: int = 8):
    """Outline of a rectangle with rounded corners, counter-clockwise."""
    hw, hd = width / 2 - radius, depth / 2 - radius
    pts = []
    for cx, cy, start in ((hw, hd, 0.0), (-hw, hd, TAU / 4),
                          (-hw, -hd, TAU / 2), (hw, -hd, 3 * TAU / 4)):
        for i in range(arc + 1):
            a = start + (i / arc) * (TAU / 4)
            pts.append((cx + math.cos(a) * radius, cy + math.sin(a) * radius))
    return pts


def prism(name: str, outline, z0: float, height: float, material=None):
    """Extrude a closed 2D outline into a solid."""
    obj = _new_mesh(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z0)) for x, y in outline]
    face = bm.faces.new(verts)
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [v for v in result["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, height)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    if material:
        obj.data.materials.append(material)
    return obj


def box(name: str, size, location, material=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    return obj


def cylinder(name, radius, depth, location, material=None, rotation=(0, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location,
                                        rotation=rotation, vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------------------
# The flamingo — one continuous mesh
# ---------------------------------------------------------------------------


def _skin_chain(name, nodes, subsurf=2, root=0):
    """Continuous tube through a list of ((x, y, z), radius) nodes."""
    obj = _new_mesh(name)
    bm = bmesh.new()
    verts = [bm.verts.new(pos) for pos, _ in nodes]
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bm.to_mesh(obj.data)
    bm.free()
    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    layer = obj.data.skin_vertices[0].data
    for i, (_, r) in enumerate(nodes):
        layer[i].radius = (r, r)
        layer[i].use_root = False
    layer[root].use_root = True
    sub = obj.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = subsurf
    sub.render_levels = subsurf + 1
    return obj


def build_flamingo(mats, location=(0, 0, 0), height_scale=1.0):
    """Hero flamingo, assembled from explicit parts and joined into one mesh.

    The previous skin-only version swallowed the legs and beak: at two subdivision levels
    a 0.9-radius body simply absorbs anything an order of magnitude thinner, which is why
    it read as a swan on a pole. Body, neck, legs, feet, beak and wing are now built
    separately at their own scales and joined, so every element survives and the
    silhouette carries the hooked beak, the S-neck and two articulated legs.
    """
    parts = []

    # Body: a single elongated ellipsoid, substantial and slightly tail-heavy.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=48, ring_count=32,
                                         location=(0, -0.30, 2.72))
    body = bpy.context.active_object
    body.name = "Flamingo_body"
    body.scale = (0.80, 1.32, 0.94)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    shade_smooth(body, 80.0)
    parts.append(body)

    # Neck: thick where it leaves the chest, tapering into the head. The base radius
    # overlaps the body so the two read as one continuous form.
    neck = _skin_chain("Flamingo_neck", [
        ((0.00, -0.96, 2.92), 0.50),
        ((0.00, -1.26, 3.24), 0.38),
        ((0.00, -1.38, 3.74), 0.285),
        ((0.00, -1.30, 4.24), 0.245),
        ((0.00, -0.96, 4.66), 0.230),
        ((0.00, -0.48, 4.92), 0.245),
        ((0.00, -0.06, 5.02), 0.290),   # head
    ], subsurf=2, root=0)
    shade_smooth(neck, 80.0)
    parts.append(neck)

    # Hooked beak: heavy at the head, angling forward then breaking downward.
    beak = _skin_chain("Flamingo_beak", [
        ((0.00, 0.10, 5.02), 0.235),
        ((0.00, 0.42, 4.96), 0.175),
        ((0.00, 0.66, 4.80), 0.125),
        ((0.00, 0.78, 4.56), 0.075),
        ((0.00, 0.76, 4.38), 0.035),
    ], subsurf=2, root=0)
    shade_smooth(beak, 80.0)
    parts.append(beak)

    # Two articulated legs: thigh, backward-breaking knee, shank, and a chrome foot with
    # three toes. One planted, one striding, so it never reads as mounted on a pole.
    for side, (hx, hy), lift, splay in ((-1, (-0.34, 0.06), 0.0, 0.10), (1, (0.36, 0.28), 0.16, -0.14)):
        leg = _skin_chain(f"Flamingo_leg{side}", [
            ((hx, hy, 2.30), 0.235),
            ((hx + splay * 0.4, hy + 0.10, 1.72), 0.150),
            ((hx + splay, hy + 0.22, 1.24), 0.135),          # knee
            ((hx + splay * 1.3, hy - 0.06, 0.72 + lift), 0.105),
            ((hx + splay * 1.5, hy - 0.16, 0.16 + lift), 0.095),
        ], subsurf=2, root=0)
        shade_smooth(leg, 80.0)
        parts.append(leg)

        fx, fy = hx + splay * 1.5, hy - 0.16
        for toe in (-1, 0, 1):
            foot = _skin_chain(f"Flamingo_toe{side}{toe}", [
                ((fx, fy, 0.10 + lift), 0.090),
                ((fx + toe * 0.16, fy - 0.30, 0.062 + lift), 0.062),
                ((fx + toe * 0.27, fy - 0.55, 0.045 + lift), 0.036),
            ], subsurf=1, root=0)
            shade_smooth(foot, 80.0)
            parts.append(foot)

    # Layered faceted wing: overlapping plates, largest at the shoulder, stepping back and
    # down so the edges catch separate highlights.
    for side in (-1, 1):
        for i in range(4):
            t = i / 3.0
            plate = box(f"Flamingo_wing{side}_{i}",
                        (0.115, 1.85 - t * 0.55, 1.10 - t * 0.34), (0, 0, 0),
                        material=mats["chrome"])
            bevel(plate, 0.055, 4)
            shade_smooth(plate)
            plate.location = (side * (0.92 - t * 0.075), -0.34 + t * 0.30, 2.86 - t * 0.19)
            plate.rotation_euler = (math.radians(-4 - t * 6), side * math.radians(9 + t * 12), 0)
            parts.append(plate)

    for obj in parts:
        if not obj.data.materials:
            obj.data.materials.append(mats["chrome"])
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    bird = bpy.context.active_object
    bird.name = "Flamingo"
    bird.data.materials.clear()
    bird.data.materials.append(mats["chrome"])
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bird.scale = (height_scale, height_scale, height_scale)
    bird.location = location
    bpy.ops.object.select_all(action="DESELECT")
    return [bird]


def build_fountain(mats, location=(0, 0, 0), radius=6.2):
    parts = []
    r = radius
    parts.append(cylinder("Fountain_outer", r, 0.62, (0, 0, 0.31), mats["chrome"], verts=96))
    parts.append(cylinder("Fountain_lip", r * 0.94, 0.30, (0, 0, 0.72), mats["planter_white"], verts=96))
    parts.append(cylinder("Fountain_neon", r * 0.86, 0.14, (0, 0, 0.90), mats["neon_cyan"], verts=96))
    parts.append(cylinder("Fountain_bowl", r * 0.80, 0.34, (0, 0, 0.82), mats["chrome"], verts=96))
    parts.append(cylinder("Fountain_water", r * 0.76, 0.10, (0, 0, 0.99), mats["glass_aqua"], verts=96))
    parts.append(cylinder("Fountain_plinth", 0.95, 0.42, (0, 0, 1.15), mats["chrome"], verts=48))
    for p in parts:
        bevel(p, 0.05, 3)
        shade_smooth(p)
        p.location = (p.location.x + location[0], p.location.y + location[1],
                      p.location.z + location[2])
    return parts


# ---------------------------------------------------------------------------
# Architecture and props
# ---------------------------------------------------------------------------


def build_villa_facade(mats, location=(0, 0, 0), accent="neon_magenta",
                       rotation=0.0, width=17.0, depth=12.0):
    """A curved villa corner with real architectural depth.

    The first version was a rounded white box: every opening sat flush with the wall, so
    there were no shadow lines anywhere and the whole mass read as a lunchbox. Every
    opening now has a reveal, the storeys are separated by a shadow gap, and the panel
    grid is cut in rather than drawn on.
    """
    parts = []
    W, D = width, depth
    ground_h, upper_h = 5.0, 4.6
    front = -D / 2

    RECESS = 3.0
    lower = prism("Villa_lower", rounded_rect(W, D - RECESS, 2.6, arc=12), 0.0, ground_h,
                  mats["villa_white"])
    lower.location.y = RECESS / 2
    bevel(lower, 0.10, 3)
    shade_smooth(lower)
    parts.append(lower)

    # Cut-in panel seams: narrow dark recesses, not surface decals.
    for i, z in enumerate((1.30, 2.55, 3.80)):
        seam = prism(f"Villa_seam{i}", rounded_rect(W - 0.26, D - RECESS - 0.26, 2.48, arc=12),
                     z, 0.14, mats["interior"])
        seam.location.y = RECESS / 2
        parts.append(seam)

    # Shadow gap, then the cantilevered slab with a chrome edge.
    parts.append(prism("Villa_gap", rounded_rect(W - 0.45, D - 0.45, 2.4, arc=12),
                       ground_h, 0.22, mats["interior"]))
    slab = prism("Villa_slab", rounded_rect(W + 1.1, D + 1.1, 3.1, arc=12),
                 ground_h + 0.22, 0.5, mats["villa_white"])
    bevel(slab, 0.12, 3)
    shade_smooth(slab)
    parts.append(slab)
    trim = prism("Villa_slabtrim", rounded_rect(W + 1.18, D + 1.18, 3.14, arc=12),
                 ground_h + 0.30, 0.09, mats["chrome"])
    shade_smooth(trim)
    parts.append(trim)

    upper = prism("Villa_upper", rounded_rect(W - 2.2, D - 2.0 - 1.4, 2.4, arc=12),
                  ground_h + 0.72, upper_h, mats["villa_white"])
    upper.location.y = 0.7
    bevel(upper, 0.10, 3)
    shade_smooth(upper)
    parts.append(upper)

    # Thicker curved roof cap with a heavy rounded edge, plus a chrome drip line.
    roof = prism("Villa_roof", rounded_rect(W - 1.2, D - 1.0, 2.9, arc=12),
                 ground_h + 0.72 + upper_h, 1.25, mats["roof_orange"])
    bevel(roof, 0.55, 8)
    shade_smooth(roof, 70.0)
    parts.append(roof)
    fascia = prism("Villa_fascia", rounded_rect(W - 1.14, D - 0.94, 2.92, arc=12),
                   ground_h + 0.72 + upper_h - 0.12, 0.12, mats["chrome"])
    shade_smooth(fascia)
    parts.append(fascia)

    # Upper glazing, genuinely recessed 0.9 m behind the wall face.
    band_z = ground_h + 0.72 + upper_h / 2
    uw = W - 2.2
    parts.append(box("Villa_reveal_box", (uw + 0.5, 0.3, upper_h - 0.5),
                     (0, front + 2.85, band_z), mats["interior"]))
    parts.append(box("Villa_glass_up", (uw, 0.14, upper_h - 0.9),
                     (0, front + 2.35, band_z), mats["glass_aqua"]))
    for i in range(6):
        parts.append(box(f"Villa_mullion{i}", (0.11, 0.42, upper_h - 0.9),
                         (-uw / 2 + i * (uw / 5), front + 2.28, band_z), mats["chrome"]))
    for name, size, loc in (
        ("head", (uw + 0.7, 1.4, 0.40), (0, front + 1.60, band_z + (upper_h - 0.9) / 2 + 0.20)),
        ("sill", (uw + 0.7, 1.2, 0.30), (0, front + 1.75, band_z - (upper_h - 0.9) / 2 - 0.15)),
    ):
        piece = box(f"Villa_{name}", size, loc, mats["chrome"])
        bevel(piece, 0.04, 2)
        shade_smooth(piece)
        parts.append(piece)

    # Ground floor: piers, a deeply recessed garage portal, chrome surround and light wash.
    door_w = 6.6
    for sign in (-1, 1):
        pier = prism(f"Villa_pier{sign}", rounded_rect(4.2, RECESS, 0.9, arc=8), 0.0, ground_h,
                     mats["villa_white"])
        pier.location = (sign * (door_w / 2 + 2.5), front + RECESS / 2, 0)
        bevel(pier, 0.10, 3)
        shade_smooth(pier)
        parts.append(pier)

    # Back wall of the recess, at the pulled-back mass face.
    parts.append(box("Villa_portal_back", (door_w + 0.4, 0.3, ground_h - 0.9),
                     (0, front + RECESS - 0.15, (ground_h - 0.9) / 2), mats["interior"]))
    for sign in (-1, 1):
        jamb = box(f"Villa_jamb{sign}", (0.30, RECESS, ground_h - 0.9),
                   (sign * (door_w / 2 + 0.15), front + RECESS / 2, (ground_h - 0.9) / 2),
                   mats["chrome"])
        bevel(jamb, 0.05, 2)
        shade_smooth(jamb)
        parts.append(jamb)
    lintel = box("Villa_lintel", (door_w + 1.0, RECESS, 0.42),
                 (0, front + RECESS / 2, ground_h - 0.68), mats["chrome"])
    bevel(lintel, 0.06, 3)
    shade_smooth(lintel)
    parts.append(lintel)
    for i in range(8):
        parts.append(box(f"Villa_portalbar{i}", (door_w - 0.45, 0.09, 0.17),
                         (0, front + RECESS - 0.34, 0.45 + i * 0.52), mats[accent]))
    parts.append(box("Villa_wash", (door_w + 1.4, 0.09, 0.09),
                     (0, front + 1.55, ground_h - 0.95), mats[accent]))

    ramp = box("Villa_ramp", (door_w + 0.5, 4.4, 0.24), (0, front - 1.0, 0.12), mats["stone"])
    bevel(ramp, 0.05, 2)
    parts.append(ramp)

    cos_r, sin_r = math.cos(rotation), math.sin(rotation)
    for part in parts:
        x, y = part.location.x, part.location.y
        part.location = (x * cos_r - y * sin_r + location[0],
                         x * sin_r + y * cos_r + location[1],
                         part.location.z + location[2])
        part.rotation_euler = (part.rotation_euler[0], part.rotation_euler[1],
                               part.rotation_euler[2] + rotation)
    return parts


def build_inflatable(mats, name, size, location, rotation=0.0):
    """Welded vinyl bunker: stacked inflated lobes, valve, and asymmetric tension.

    The previous version was a rounded box with thin cylinders laid on top, which read as
    a wireless router. Real competition inflatables are welded from panels, so the form is
    built as stacked lobes of slightly different width — the seams are where the lobes
    meet, which is also where the broad highlight breaks.
    """
    import random
    rng = random.Random(hash(name) & 0xFFFF)
    parts = []
    lobes = 2
    lobe_h = size[2] / lobes
    for i in range(lobes):
        t = i / (lobes - 1)
        # Waist slightly narrower than base and crown: inflated panels bulge unevenly.
        swell = 1.0 - 0.045 * math.sin(t * math.pi) + rng.uniform(-0.018, 0.018)
        taper = 1.0 - 0.10 * t
        w = size[0] * swell * taper
        d = size[1] * swell * taper
        lobe = prism(f"{name}_lobe{i}", rounded_rect(w, d, min(w, d) * 0.38, arc=12),
                     i * lobe_h * 0.82, lobe_h * 1.45, mats["vinyl_black"])
        bevel(lobe, min(w, d) * 0.20, 6)
        shade_smooth(lobe, 65.0)
        # A touch of lean so no two bunkers are identical.
        lobe.rotation_euler = (math.radians(rng.uniform(-1.4, 1.4)),
                               math.radians(rng.uniform(-1.4, 1.4)), 0)
        parts.append(lobe)

    # Inflation valve on one flank, and a reinforced patch under it.
    valve = cylinder(f"{name}_valve", 0.085, 0.13,
                     (size[0] * 0.30, -size[1] * 0.46, size[2] * 0.34),
                     mats["vinyl_black"], rotation=(TAU / 4, 0, 0), verts=20)
    shade_smooth(valve)
    parts.append(valve)
    patch = cylinder(f"{name}_patch", 0.22, 0.03,
                     (size[0] * 0.30, -size[1] * 0.455, size[2] * 0.34),
                     mats["vinyl_black"], rotation=(TAU / 4, 0, 0), verts=24)
    shade_smooth(patch)
    parts.append(patch)

    for part in parts:
        part.rotation_euler = (part.rotation_euler[0], part.rotation_euler[1], rotation)
        part.location = (part.location.x + location[0], part.location.y + location[1],
                         part.location.z + location[2])
    return parts


def build_planter(mats, name, location, rotation=0.0, length=7.0):
    parts = []
    shell = prism(f"{name}_shell", rounded_rect(length, 2.4, 1.1, arc=8), 0.0, 1.15,
                  mats["planter_white"])
    bevel(shell, 0.12, 4)
    shade_smooth(shell)
    parts.append(shell)
    trim = prism(f"{name}_trim", rounded_rect(length + 0.16, 2.56, 1.16, arc=8), 0.86, 0.16,
                 mats["chrome"])
    bevel(trim, 0.05, 2)
    shade_smooth(trim)
    parts.append(trim)
    parts.append(prism(f"{name}_strip", rounded_rect(length + 0.10, 2.5, 1.14, arc=8),
                       0.30, 0.09, mats["neon_cyan"]))
    soil = prism(f"{name}_soil", rounded_rect(length - 0.7, 1.7, 0.8, arc=8), 1.02, 0.08,
                 mats["foliage"])
    parts.append(soil)
    import random
    rng = random.Random(hash(name) & 0xFFFF)
    for i in range(int(length * 2.2)):
        x = -length / 2 + 0.7 + rng.random() * (length - 1.4)
        bush = cylinder(f"{name}_bush{i}", 0.34 + rng.random() * 0.16, 0.55,
                        (x, -0.3 + rng.random() * 0.6, 1.32), mats["foliage"], verts=8)
        bush.scale = (1.0, 1.0, 0.8 + rng.random() * 0.5)
        shade_smooth(bush)
        parts.append(bush)
    for p in parts:
        p.rotation_euler = (0, 0, rotation)
        p.location = (p.location.x + location[0], p.location.y + location[1],
                      p.location.z + location[2])
    return parts


def build_paint_decal(mats, name, colour_key, location, scale=1.0, seed=0, rotation=0.0):
    """Authored splat: irregular core, starburst points, satellite droplets.

    Built as real geometry rather than a disc so the edge silhouette is ragged and the
    coat catches light along it — the thing that makes paint read as wet.
    """
    import random
    rng = random.Random(seed)
    obj = _new_mesh(name)
    bm = bmesh.new()

    ring = []
    steps = 160
    # A few broad lobes dominate, with a little fine detail on top and a handful of
    # tapered points. Equal-amplitude high-frequency terms read as a snowflake, which is
    # exactly what the first attempt produced.
    lobes = rng.randint(5, 8)
    phase = [rng.random() * TAU for _ in range(4)]
    spikes = [(rng.random() * TAU, rng.uniform(0.10, 0.22), rng.uniform(0.075, 0.130))
              for _ in range(rng.randint(5, 9))]
    for i in range(steps):
        a = (i / steps) * TAU
        r = (1.0
             + 0.19 * math.sin(a * lobes + phase[0])
             + 0.11 * math.sin(a * (lobes + 2) + phase[1])
             + 0.05 * math.sin(a * (lobes * 3 + 1) + phase[2]))
        for centre, amp, width in spikes:
            d = abs((a - centre + math.pi) % TAU - math.pi)
            r += amp * math.exp(-(d * d) / (2 * width * width))
        ring.append(bm.verts.new((math.cos(a) * r * scale, math.sin(a) * r * scale, 0.0)))
    bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mats[colour_key])
    obj.location = (location[0], location[1], location[2] + 0.004)
    obj.rotation_euler = (0, 0, rotation)

    # Thin. The earlier 35 mm slab with a bevelled rim read as a plastic cutout lying on
    # the ground; paint is a film, and its edge should be a line of specular, not a wall.
    solid = obj.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = 0.006
    solid.offset = 1.0
    shade_smooth(obj)

    parts = [obj]
    for i in range(rng.randint(6, 11)):
        a = rng.random() * TAU
        d = scale * rng.uniform(1.35, 2.5)
        rad = scale * rng.uniform(0.05, 0.17)
        drop = cylinder(f"{name}_drop{i}", rad, 0.008,
                        (location[0] + math.cos(a) * d, location[1] + math.sin(a) * d,
                         location[2] + 0.005), mats[colour_key], verts=12)
        drop.scale = (1.0, rng.uniform(0.6, 1.5), 1.0)
        shade_smooth(drop)
        parts.append(drop)
    # A couple of directional streaks flung from the impact.
    for i in range(rng.randint(2, 4)):
        a = rng.random() * TAU
        length = scale * rng.uniform(1.2, 2.4)
        streak = box(f"{name}_streak{i}", (scale * 0.10, length, 0.007),
                     (location[0] + math.cos(a) * length * 0.6,
                      location[1] + math.sin(a) * length * 0.6, location[2] + 0.005),
                     mats[colour_key], rotation=(0, 0, -a + TAU / 4))
        shade_smooth(streak)
        parts.append(streak)
    return parts


# ---------------------------------------------------------------------------
# Lighting, camera, render
# ---------------------------------------------------------------------------


SUN_DIR = (0.615, 0.775, 0.140)   # toward the sun: rear-right, just above the horizon


def setup_world() -> None:
    """Hand-built Golden Hour dome with a real sun disk.

    The Nishita sky was rendering as flat lavender-grey no matter how its haze parameters
    were set, so the gradient is now explicit and under direct control: hot orange at the
    horizon lifting through peach into a deep evening blue, with aqua bounce below the
    horizon line for the water. A sharp sun disk is added on top, because chrome needs a
    bright small highlight source to read as metal rather than as pale plastic.
    """
    world = bpy.data.worlds.new("SliceGoldenHour")
    bpy.context.scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputWorld")
    bg = tree.nodes.new("ShaderNodeBackground")

    coords = tree.nodes.new("ShaderNodeTexCoord")
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords.outputs["Generated"], sep.inputs["Vector"])

    remap = tree.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0
    remap.inputs["To Min"].default_value = 0.0
    remap.inputs["To Max"].default_value = 1.0
    tree.links.new(sep.outputs["Z"], remap.inputs["Value"])

    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    e = ramp.color_ramp.elements
    e[0].position = 0.34
    e[0].color = (0.055, 0.135, 0.150, 1.0)      # bay below the horizon
    e[1].position = 0.500
    e[1].color = (1.000, 0.360, 0.105, 1.0)      # hot horizon
    for pos, col in ((0.545, (1.000, 0.520, 0.230, 1.0)),
                     (0.620, (0.940, 0.470, 0.360, 1.0)),
                     (0.760, (0.420, 0.330, 0.520, 1.0)),
                     (1.000, (0.105, 0.140, 0.320, 1.0))):
        el = ramp.color_ramp.elements.new(pos)
        el.color = col
    tree.links.new(remap.outputs["Result"], ramp.inputs["Fac"])

    # Sun disk: dot the view direction against the sun vector and clip it very tight.
    dot = tree.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = SUN_DIR
    tree.links.new(coords.outputs["Generated"], dot.inputs[0])
    disc = tree.nodes.new("ShaderNodeValToRGB")
    disc.color_ramp.interpolation = "EASE"
    disc.color_ramp.elements[0].position = 0.9975
    disc.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    disc.color_ramp.elements[1].position = 0.9995
    disc.color_ramp.elements[1].color = (18.0, 11.0, 5.4, 1.0)
    tree.links.new(dot.outputs["Value"], disc.inputs["Fac"])

    add = tree.nodes.new("ShaderNodeMixRGB")
    add.blend_type = "ADD"
    add.inputs["Fac"].default_value = 1.0
    tree.links.new(ramp.outputs["Color"], add.inputs["Color1"])
    tree.links.new(disc.outputs["Color"], add.inputs["Color2"])

    bg.inputs["Strength"].default_value = 1.0
    tree.links.new(add.outputs["Color"], bg.inputs["Color"])
    tree.links.new(bg.outputs["Background"], out.inputs["Surface"])


def _card(name, size, location, rotation, colour, strength):
    """Large off-camera emissive plane. These are what chrome actually reflects."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mat = bpy.data.materials.new(f"card_{name}")
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    o = tree.nodes.new("ShaderNodeOutputMaterial")
    emit = tree.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*colour, 1.0)
    emit.inputs["Strength"].default_value = strength
    tree.links.new(emit.outputs["Emission"], o.inputs["Surface"])
    obj.data.materials.append(mat)
    # Visible to reflections and to nothing else, so the cards never appear in frame.
    obj.visible_camera = False
    obj.visible_shadow = False
    return obj


def build_reflection_cards():
    """An estate-like reflection rig.

    Empty sky gives milky chrome: every direction reflects roughly the same pale value, so
    the flamingo reads as white plastic. Real chrome needs contrast — large dark forms to
    fall to black, and small saturated sources to spike. These stand in for the black
    inflatables, the orange roofs and the team-lit portals until the full estate exists.
    """
    v = TAU / 4
    cards = [
        # Deep black slabs low on both sides: the inflatable perimeter.
        _card("Card_black_L", (26, 9), (-26, 2, 4.0), (v, 0, v), (0.004, 0.004, 0.005), 0.6),
        _card("Card_black_R", (26, 9), (26, 2, 4.0), (v, 0, -v), (0.004, 0.004, 0.005), 0.6),
        _card("Card_black_F", (34, 8), (0, -28, 3.5), (v, 0, 0), (0.004, 0.004, 0.006), 0.6),
        # Rooftop orange, warm and broad, from the sun side.
        _card("Card_orange", (22, 7), (17, 22, 7.5), (v, 0, -2.3), (1.00, 0.34, 0.06), 5.5),
        # Team portals: small, saturated, opposite sides.
        _card("Card_cyan", (9, 4), (-17, -4, 3.2), (v, 0, v), (0.06, 0.72, 1.00), 7.0),
        _card("Card_magenta", (9, 4), (15, -6, 3.2), (v, 0, -v), (1.00, 0.10, 0.55), 7.0),
        # Warm key bounce overhead, cool aqua fill from the bay side.
        _card("Card_skywarm", (30, 18), (6, 14, 26.0), (0, 0, 0), (1.00, 0.66, 0.38), 2.2),
        _card("Card_aqua", (26, 10), (-8, 26, 6.0), (v, 0, TAU / 2), (0.10, 0.52, 0.60), 2.0),
    ]
    return cards


def setup_sun() -> None:
    key = bpy.data.lights.new("GoldenKey", type="SUN")
    key.energy = 6.8
    key.color = (1.0, 0.60, 0.30)
    key.angle = math.radians(1.1)          # tight enough for crisp contact shadows
    obj = bpy.data.objects.new("GoldenKey", key)
    bpy.context.scene.collection.objects.link(obj)
    # Aimed straight down the world's sun vector so shadows agree with the sunset.
    obj.rotation_euler = (-Vector(SUN_DIR)).to_track_quat("-Z", "Y").to_euler()

    fill = bpy.data.lights.new("AquaFill", type="SUN")
    fill.energy = 0.9
    fill.color = (0.36, 0.62, 0.78)
    fobj = bpy.data.objects.new("AquaFill", fill)
    bpy.context.scene.collection.objects.link(fobj)
    fobj.rotation_euler = (math.radians(58.0), 0.0, math.radians(30.0))


def setup_render(samples: int, width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 8
    try:
        scene.cycles.device = "GPU"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
    except Exception as exc:
        log(f"GPU unavailable, rendering on CPU ({exc})")
        scene.cycles.device = "CPU"

    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    view = scene.view_settings
    # Capability probing is useless here: in background mode the enum introspects as
    # {'NONE'} even though the OCIO config is loaded, so the earlier feature check
    # silently downgraded every render to Filmic with no look — which is exactly what was
    # desaturating the rooftop orange into tan. Assign directly and fall back on failure.
    for transform in ("AgX", "Filmic", "Standard"):
        try:
            view.view_transform = transform
            break
        except TypeError:
            continue
    for look in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast",
                 "Medium High Contrast", "None"):
        try:
            view.look = look
            break
        except TypeError:
            continue
    view.exposure = -0.10
    log(f"view transform {view.view_transform}, look {view.look}")
    scene.render.filter_size = 1.6


def add_camera(name, location, look_at, focal):
    data = bpy.data.cameras.new(name)
    data.lens = focal
    data.sensor_width = 36.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    direction = Vector(look_at) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def build_slice(mats):
    """The staged corner: ground, villa, fountain, bunker, planter, paint."""
    ground = box("Ground_stone", (74, 74, 0.4), (0, 4, -0.2), mats["stone"])
    turf = box("Ground_turf", (46, 22, 0.42), (-4, 17.5, -0.19), mats["turf"])

    objects = [ground, turf]
    objects += build_villa_facade(mats, location=(-6.0, 20.0, 0.0))
    objects += build_fountain(mats, location=(3.0, -1.0, 0.0), radius=6.2)
    objects += build_flamingo(mats, location=(3.0, -1.0, 1.35), height_scale=1.55)
    objects += build_inflatable(mats, "Bunker_A", (5.4, 3.2, 2.5), (-13.5, 4.5, 0.0), rotation=0.22)
    objects += build_inflatable(mats, "Bunker_B", (3.0, 3.0, 1.7), (14.0, 6.5, 0.0), rotation=-0.4)
    objects += build_planter(mats, "Planter_A", (12.5, -3.0, 0.0), rotation=-0.35, length=8.0)
    objects += build_planter(mats, "Planter_B", (-11.0, -5.5, 0.0), rotation=0.5, length=6.0)

    splats = [
        ("cyan", (-9.0, 8.0), 2.1, 11, 0.4), ("cyan", (-15.0, 1.0), 1.5, 23, 1.2),
        ("cyan", (-4.0, -6.5), 1.8, 37, 2.6), ("cyan", (-13.0, 13.0), 1.3, 51, 0.9),
        ("magenta", (11.0, 4.0), 2.0, 67, 1.9), ("magenta", (16.0, -2.0), 1.6, 83, 0.2),
        ("magenta", (7.5, 10.5), 1.4, 97, 2.2), ("magenta", (13.5, -8.0), 1.7, 113, 1.1),
    ]
    for team, (x, y), s, seed, rot in splats:
        objects += build_paint_decal(mats, f"Splat_{team}_{seed}", f"paint_{team}",
                                     (x, y, 0.0), scale=s, seed=seed, rotation=rot)
    return objects


def main() -> None:
    args = script_args()
    samples = 256
    if "--samples" in args:
        samples = int(args[args.index("--samples") + 1])
    shot = args[args.index("--shot") + 1] if "--shot" in args else "all"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"

    mats = make_materials()
    build_slice(mats)
    setup_world()
    build_reflection_cards()
    setup_sun()

    SLICE_DIR.mkdir(parents=True, exist_ok=True)

    shots = {
        # Wide elevated three-quarter, deliberately off-centre.
        "beauty": (add_camera("Cam_beauty", (19.0, -21.5, 13.5), (-0.5, 6.0, 3.0), 34.0),
                   1672, 941),
        # Side-on against the sky, so the silhouette is judged on outline alone.
        "flamingo_silhouette": (add_camera("Cam_fsil", (22.5, -3.0, 7.6), (3.0, -1.0, 5.4), 85.0),
                                1100, 1500),
        # Close on the body and neck to read what the chrome is actually carrying.
        "flamingo_chrome": (add_camera("Cam_fchrome", (10.0, -11.5, 7.2), (3.2, -1.2, 5.0), 90.0),
                            1400, 1200),
        "villa": (add_camera("Cam_villa", (10.5, -9.0, 8.2), (-6.5, 13.0, 4.2), 48.0), 1600, 1000),
        "vinyl": (add_camera("Cam_vinyl", (-8.0, -1.5, 3.4), (-13.5, 4.5, 1.3), 85.0), 1400, 1000),
        "paint": (add_camera("Cam_paint", (-5.0, -1.0, 5.2), (-9.0, 7.5, 0.0), 70.0), 1400, 1000),
    }
    wanted = shots.keys() if shot == "all" else [shot]

    for name in wanted:
        camera, w, h = shots[name]
        bpy.context.scene.camera = camera
        setup_render(samples, w, h)
        path = SLICE_DIR / f"{name}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        log(f"wrote slice/{path.name}  ({w}x{h}, {samples} samples)")


if __name__ == "__main__":
    main()
