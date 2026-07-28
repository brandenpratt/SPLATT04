"""Render the Gate A composition review sheets and measure the reference mismatch.

    blender --background --python tools/blender/render_vice_estate_review.py -- [--samples 64]

Produces, into ``docs/art/vice-estate/``:

  * ``current-render.png``     — the Golden Hour reference camera
  * ``reference-overlay.png``  — render blended 50% over the master reference
  * ``side-by-side.png``       — reference and render at matched size
  * ``mismatch-report.md``     — measured differences, not impressions

The render matches the master's exact pixel dimensions, so the overlay is a per-pixel
comparison. Every number in the report is computed from the two images by the same code
path; nothing here is eyeballed.

The comparison requires ``docs/references/vice-estate-master.png``. If it is missing the
render still happens and the script says exactly what is absent — it does not invent a
comparison.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from viceestate_common import (  # noqa: E402
    ART_DIR,
    REFERENCE_ESTATE,
    REFERENCE_HEIGHT,
    REFERENCE_WIDTH,
    game_to_blender,
    load_layout,
    load_manifest,
    log,
    script_args,
)

import build_vice_estate_kit as builder  # noqa: E402
import landmarks  # noqa: E402

RENDER_WIDTH = REFERENCE_WIDTH
RENDER_HEIGHT = REFERENCE_HEIGHT


def setup_world(strength: float = 1.0) -> None:
    """Late sunset into early night: warm horizon, deep navy zenith."""
    world = bpy.data.worlds.new("ViceEstateDusk")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    gradient = nodes.new("ShaderNodeTexGradient")
    mapping = nodes.new("ShaderNodeMapping")
    coords = nodes.new("ShaderNodeTexCoord")
    ramp = nodes.new("ShaderNodeValToRGB")

    gradient.gradient_type = "LINEAR"
    mapping.inputs["Rotation"].default_value = (0.0, math.radians(90.0), 0.0)

    # Bright Golden Hour, matched to the master reference: a hot peach horizon lifting
    # into soft warm pink overhead. The previous dusk values rendered the estate almost
    # black, which is exactly the look being rejected.
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[0].color = (1.00, 0.58, 0.34, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (0.72, 0.63, 0.72, 1.0)
    # Calibrated: sky strength plus three suns plus positive exposure blew the whole
    # frame to white. The sky carries ambient; the key carries the modelling.
    background.inputs["Strength"].default_value = strength * 1.05

    links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], gradient.inputs["Vector"])
    links.new(gradient.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])


def setup_lighting() -> None:
    """Warm coral key low over the waterfront, cool rim from the opposite side."""
    key_data = bpy.data.lights.new("GoldenHourKey", type="SUN")
    key_data.energy = 3.1
    key_data.color = (1.0, 0.80, 0.62)
    key_data.angle = math.radians(3.0)
    key = bpy.data.objects.new("GoldenHourKey", key_data)
    bpy.context.scene.collection.objects.link(key)
    # Low in the north-west, matching the sun position in the master reference.
    # Low sun out over the bay, behind the estate, as in the reference.
    key.rotation_euler = (math.radians(74.0), 0.0, math.radians(6.0))

    rim_data = bpy.data.lights.new("CoolRim", type="SUN")
    rim_data.energy = 0.85
    rim_data.color = (0.72, 0.86, 1.0)
    rim = bpy.data.objects.new("CoolRim", rim_data)
    bpy.context.scene.collection.objects.link(rim)
    rim.rotation_euler = (math.radians(52.0), 0.0, math.radians(196.0))

    # Broad warm bounce so the courtyard and lower facades never fall into black.
    fill_data = bpy.data.lights.new("WarmFill", type="SUN")
    fill_data.energy = 0.55
    fill_data.color = (1.0, 0.86, 0.74)
    fill = bpy.data.objects.new("WarmFill", fill_data)
    bpy.context.scene.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(28.0), 0.0, math.radians(-60.0))


def setup_camera(layout: dict):
    """Golden Hour review camera, driven entirely by the layout's `reviewCamera`."""
    cam_spec = layout["reviewCamera"]
    cam_data = bpy.data.cameras.new("GoldenHourReview")
    cam_data.lens = cam_spec["focalLengthMm"]
    cam_data.sensor_width = cam_spec["sensorWidthMm"]
    camera = bpy.data.objects.new("GoldenHourReview", cam_data)
    bpy.context.scene.collection.objects.link(camera)

    camera.location = game_to_blender(*cam_spec["position"])
    target = game_to_blender(*cam_spec["target"])

    # Aim the camera with a damped track so the framing is reproducible.
    empty = bpy.data.objects.new("ReviewTarget", None)
    empty.location = target
    bpy.context.scene.collection.objects.link(empty)
    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.target = empty
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    bpy.context.scene.camera = camera
    return camera


def configure_render(samples: int) -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    # EEVEE keeps the review loop fast; this is a composition check, not a beauty pass.
    engines = {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        if candidate in engines:
            scene.render.engine = candidate
            break
    log(f"render engine: {scene.render.engine}")

    eevee = getattr(scene, "eevee", None)
    if eevee is not None:
        if hasattr(eevee, "taa_render_samples"):
            eevee.taa_render_samples = samples
        # Chrome needs something to reflect. Without this the flamingo and the orb render
        # as flat shaded blobs, which is most of why they read as primitives.
        for flag in ("use_raytracing", "use_ssr", "use_ssr_refraction", "use_gtao"):
            if hasattr(eevee, flag):
                setattr(eevee, flag, True)
        if hasattr(eevee, "gtao_distance"):
            eevee.gtao_distance = 2.0
    scene.view_settings.view_transform = "Filmic" if _has_view_transform("Filmic") else "Standard"
    scene.view_settings.exposure = -0.15
    scene.view_settings.look = "None"


def _has_view_transform(name: str) -> bool:
    try:
        return name in {
            item.identifier
            for item in bpy.context.scene.view_settings.bl_rna.properties["view_transform"].enum_items
        }
    except Exception:
        return False


# --- image composition -------------------------------------------------------


def load_pixels(path: Path, width: int, height: int) -> np.ndarray:
    """Load an image, resize to the target, and return HxWx4 float RGBA."""
    image = bpy.data.images.load(str(path))
    if image.size[0] != width or image.size[1] != height:
        image.scale(width, height)
    buffer = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(buffer)
    bpy.data.images.remove(image)
    return buffer.reshape(height, width, 4)


def save_pixels(pixels: np.ndarray, path: Path) -> None:
    height, width = pixels.shape[0], pixels.shape[1]
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=True)
    image.pixels.foreach_set(pixels.reshape(-1).astype(np.float32))
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def build_overlay(render_path: Path, reference_path: Path, out_path: Path) -> None:
    render = load_pixels(render_path, RENDER_WIDTH, RENDER_HEIGHT)
    reference = load_pixels(reference_path, RENDER_WIDTH, RENDER_HEIGHT)
    blended = reference * 0.5 + render * 0.5
    blended[..., 3] = 1.0
    save_pixels(blended, out_path)
    log(f"wrote {out_path.name}")


def build_side_by_side(render_path: Path, reference_path: Path, out_path: Path) -> None:
    # Both halves are scaled by the same factor in both axes. Halving only the width
    # squashes each frame 2:1 and makes every proportion in the comparison a lie.
    half_w = RENDER_WIDTH // 2
    half_h = RENDER_HEIGHT // 2
    render = load_pixels(render_path, half_w, half_h)
    reference = load_pixels(reference_path, half_w, half_h)
    sheet = np.concatenate([reference, render], axis=1)
    sheet[..., 3] = 1.0
    save_pixels(sheet, out_path)
    log(f"wrote {out_path.name}")


# --- measurement -------------------------------------------------------------
#
# Blender hands back scene-linear floats for sRGB-tagged images. Every threshold below is
# expressed in display space, so linearised pixels are encoded back before analysis —
# otherwise "dark" and "saturated" would mean two different things in the two images.


def to_display(rgb: np.ndarray) -> np.ndarray:
    low = rgb * 12.92
    high = 1.055 * np.power(np.clip(rgb, 1e-6, None), 1.0 / 2.4) - 0.055
    return np.where(rgb <= 0.0031308, low, high)


def top_down(pixels: np.ndarray) -> np.ndarray:
    """Blender stores images bottom-up; report in screen order."""
    return pixels[::-1]


class Frame:
    """Measurable features of one 1672x941 estate image."""

    def __init__(self, pixels: np.ndarray, label: str) -> None:
        self.label = label
        self.rgb = to_display(top_down(pixels)[..., :3])
        self.h, self.w = self.rgb.shape[:2]
        r, g, b = self.rgb[..., 0], self.rgb[..., 1], self.rgb[..., 2]
        self.luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

        # The black inflatable perimeter and bunkers are the darkest things in either
        # image by a wide margin, and they wrap the whole arena. Their bounding box is
        # therefore a reliable, automatic stand-in for "where the estate sits in frame".
        #
        # The threshold is a percentile rather than a constant. A fixed cutoff measures
        # exposure as much as composition — an overexposed render simply reports "no dark
        # pixels" and the framing becomes unmeasurable, which is exactly what happened on
        # the first pass. Taking the darkest 3% of each frame isolates the same physical
        # objects in both regardless of how they are exposed.
        self.structure_threshold = float(np.percentile(self.luma, 3.0))
        self.structure = self.luma <= self.structure_threshold
        self.bbox = self._bbox(self.structure)

        self.horizon = self._horizon()
        self.cyan = (b > 0.30) & (b > r * 1.30) & (g > r * 1.08)
        self.pink = (r > 0.30) & (r > g * 1.30) & (b > g * 1.10)

    def _bbox(self, mask: np.ndarray):
        rows = np.where(mask.any(axis=1))[0]
        cols = np.where(mask.any(axis=0))[0]
        if rows.size == 0 or cols.size == 0:
            return None
        return int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])

    def _horizon(self) -> int:
        """Row where sky gives way to water, measured in the clear left margin.

        Sky is warm above the horizon and the bay is cool below it, so the first downward
        crossing of the midpoint between the two is the boundary. A max-derivative search
        was tried first and latched onto the turf/water edge much further down the frame.
        """
        margin = self.rgb[:, : self.w // 6]
        coolness = margin[..., 2] * 0.5 + margin[..., 1] * 0.5 - margin[..., 0]
        profile = coolness.mean(axis=1)
        kernel = np.ones(9) / 9.0
        smooth = np.convolve(profile, kernel, mode="same")
        upper = int(self.h * 0.60)
        sky = float(smooth[: max(1, int(self.h * 0.04))].mean())
        below = float(smooth[int(self.h * 0.30) : upper].mean())
        midpoint = (sky + below) / 2.0
        rising = below > sky
        for row in range(upper):
            if (smooth[row] > midpoint) if rising else (smooth[row] < midpoint):
                return row
        return 0

    def paint_fraction(self, mask: np.ndarray) -> float:
        """Paint coverage as a share of the arena footprint, not of the whole frame."""
        if self.bbox is None:
            return 0.0
        x0, y0, x1, y1 = self.bbox
        # Only below the horizon: the ocean is turquoise and would read as cyan paint.
        y0 = max(y0, self.horizon)
        region = mask[y0 : y1 + 1, x0 : x1 + 1]
        return float(region.mean()) if region.size else 0.0

    def paint_centroid_x(self, mask: np.ndarray) -> float | None:
        cols = np.where(mask.any(axis=0))[0]
        if cols.size == 0:
            return None
        weights = mask.sum(axis=0).astype(float)
        return float((np.arange(self.w) * weights).sum() / weights.sum())


def _pct(value: float, total: float) -> str:
    return f"{100.0 * value / total:.1f}%"


def measure(render_path: Path, reference_path: Path, out_path: Path) -> None:
    ref = Frame(load_pixels(reference_path, RENDER_WIDTH, RENDER_HEIGHT), "reference")
    cur = Frame(load_pixels(render_path, RENDER_WIDTH, RENDER_HEIGHT), "render")

    lines: list[str] = []
    ranked: list[tuple[float, str]] = []
    add = lines.append
    add("# VICE ESTATE 04 — measured mismatch report")
    add("")
    add(f"Both frames {RENDER_WIDTH}x{RENDER_HEIGHT}. Generated by")
    add("`tools/blender/render_vice_estate_review.py`. Every figure is computed from the")
    add("two images; none are estimates.")
    add("")
    add("| Measure | Reference | Render | Delta |")
    add("|---|---|---|---|")

    def row(name: str, a, b, fmt=lambda v: f"{v}", delta=None) -> None:
        if a is None or b is None:
            add(f"| {name} | {'n/a' if a is None else fmt(a)} | "
                f"{'n/a' if b is None else fmt(b)} | n/a |")
            return
        d = (b - a) if delta is None else delta(a, b)
        add(f"| {name} | {fmt(a)} | {fmt(b)} | {d:+.1f} |")
        # Rank by size relative to the reference value, so a 100 px row shift and a
        # 5-point coverage shift can be compared on the same scale.
        ranked.append((abs(d) / max(abs(a), 1.0), f"{name}: reference {fmt(a)}, render {fmt(b)}"))

    row("Horizon row (px from top)", ref.horizon, cur.horizon, lambda v: f"{v} px")

    if ref.bbox and cur.bbox:
        rx0, ry0, rx1, ry1 = ref.bbox
        cx0, cy0, cx1, cy1 = cur.bbox
        row("Estate left edge (px)", rx0, cx0, lambda v: f"{v} px")
        row("Estate right edge (px)", rx1, cx1, lambda v: f"{v} px")
        row("Estate top edge (px)", ry0, cy0, lambda v: f"{v} px")
        row("Estate bottom edge (px)", ry1, cy1, lambda v: f"{v} px")
        row("Frame width occupancy",
            100.0 * (rx1 - rx0) / ref.w, 100.0 * (cx1 - cx0) / cur.w,
            lambda v: f"{v:.1f}%")
        row("Frame height occupancy",
            100.0 * (ry1 - ry0) / ref.h, 100.0 * (cy1 - cy0) / cur.h,
            lambda v: f"{v:.1f}%")
        row("Estate centre X (px)", (rx0 + rx1) / 2, (cx0 + cx1) / 2, lambda v: f"{v:.0f} px")
        row("Estate centre Y (px)", (ry0 + ry1) / 2, (cy0 + cy1) / 2, lambda v: f"{v:.0f} px")

    row("Mean luminance", ref.luma.mean(), cur.luma.mean(), lambda v: f"{v:.3f}",
        lambda a, b: 100.0 * (b - a) / max(a, 1e-6))
    row("Cyan paint coverage",
        100.0 * ref.paint_fraction(ref.cyan), 100.0 * cur.paint_fraction(cur.cyan),
        lambda v: f"{v:.1f}%")
    row("Pink paint coverage",
        100.0 * ref.paint_fraction(ref.pink), 100.0 * cur.paint_fraction(cur.pink),
        lambda v: f"{v:.1f}%")
    row("Cyan centroid X (px)", ref.paint_centroid_x(ref.cyan), cur.paint_centroid_x(cur.cyan),
        lambda v: f"{v:.0f} px")
    row("Pink centroid X (px)", ref.paint_centroid_x(ref.pink), cur.paint_centroid_x(cur.pink),
        lambda v: f"{v:.0f} px")
    row("Structure luma cutoff", ref.structure_threshold, cur.structure_threshold,
        lambda v: f"{v:.3f}", lambda a, b: 100.0 * (b - a) / max(a, 1e-6))

    add("")
    add("## Three largest measured mismatches")
    add("")
    for i, (_, text) in enumerate(sorted(ranked, reverse=True)[:3], start=1):
        add(f"{i}. {text}")
    add("")
    add("> The estate footprint here is the bounding box of the darkest 3% of each frame.")
    add("> It is **diagnostic only and is retired as an optimisation target** — it rewards")
    add("> moving the camera closer whatever the composition does, and it ranked an")
    add("> obviously wrong view above a good one. Camera framing is scored by")
    add("> `landmark-report.md`; exposure is what this table is still good for.")
    add("")
    add("Cyan and pink coverage are measured inside that footprint and below the horizon,")
    add("so ocean turquoise is not counted as team paint.")
    add("")

    out_path.write_text("\n".join(lines) + "\n")
    log(f"wrote {out_path.name}")
    for line in lines:
        if line.startswith("|"):
            log(line)


def build_landmark_sheets(render_path: Path, camera) -> None:
    """Landmark debug sheet, annotation check sheet and the fit report."""
    summary = landmarks.evaluate(bpy.context.scene, camera, RENDER_WIDTH, RENDER_HEIGHT)

    render = top_down(load_pixels(render_path, RENDER_WIDTH, RENDER_HEIGHT))
    landmarks.build_debug_sheet(render, summary, ART_DIR / "landmark-debug.png", save_pixels)
    log("wrote landmark-debug.png")

    # The same rings drawn on the master alone, so the annotation itself can be checked.
    # An instrument built on misread coordinates would fail the camera silently.
    reference = top_down(load_pixels(REFERENCE_ESTATE, RENDER_WIDTH, RENDER_HEIGHT))
    annotation = reference.copy()
    for anchor in summary["anchors"]:
        rx, ry = anchor["reference"]
        landmarks._ring(annotation, rx, ry, 12, landmarks.REF_COLOUR)
    save_pixels(annotation[::-1], ART_DIR / "landmark-annotation.png")
    log("wrote landmark-annotation.png")

    landmarks.write_report(summary, ART_DIR / "landmark-report.md")
    log("wrote landmark-report.md")

    passed, failures = landmarks.gate_status(summary)
    log(f"landmark fit: mean {summary['mean']:.2f}%  median {summary['median']:.2f}%  "
        f"max {summary['max']:.2f}%  -> {'PASS' if passed else 'FAIL'}")
    for failure in failures[:6]:
        log(f"  fail: {failure}")


def main() -> None:
    args = script_args()
    samples = 64
    if "--samples" in args:
        samples = int(args[args.index("--samples") + 1])

    # Re-measure the sheets already on disk without rebuilding and re-rendering the
    # estate. Used when the measurement code itself changes.
    if "--measure-only" in args:
        ART_DIR.mkdir(parents=True, exist_ok=True)
        measure(ART_DIR / "current-render.png", REFERENCE_ESTATE, ART_DIR / "mismatch-report.md")
        return

    layout = load_layout()
    manifest = load_manifest()

    builder.reset_scene()
    _kit, built = builder.build_kit(layout, manifest)
    builder.place_layout(layout, built)

    setup_world()
    setup_lighting()
    camera = setup_camera(layout)
    configure_render(samples)

    ART_DIR.mkdir(parents=True, exist_ok=True)
    render_path = ART_DIR / "current-render.png"
    bpy.context.scene.render.filepath = str(render_path)
    bpy.ops.render.render(write_still=True)
    log(f"wrote {render_path.name}")

    if not REFERENCE_ESTATE.exists():
        log("")
        log("=" * 74)
        log("MISSING REFERENCE — overlay and side-by-side were NOT produced.")
        log(f"  expected: {REFERENCE_ESTATE}")
        log("  The render above is therefore NOT camera-matched, and the layout's")
        log("  reviewCamera remains a provisional estimate.")
        log("=" * 74)
        return

    build_overlay(render_path, REFERENCE_ESTATE, ART_DIR / "reference-overlay.png")
    build_side_by_side(render_path, REFERENCE_ESTATE, ART_DIR / "side-by-side.png")
    measure(render_path, REFERENCE_ESTATE, ART_DIR / "mismatch-report.md")
    build_landmark_sheets(render_path, camera)
    log("Gate A review sheets ready")


if __name__ == "__main__":
    main()
