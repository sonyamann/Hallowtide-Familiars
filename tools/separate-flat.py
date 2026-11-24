# Cuts each familiar's picture out of its background, so the cards can show
# it in its own colours and texture. Reads art-incoming/, and for each
# picture writes two files to the edition's art/pictures folder: the picture
# (image, a JPEG) and its outline (cut, a greyscale mask, white inside).
# Also writes a preview sheet to out/pictures-preview.png.
#
#   python3 tools/separate-flat.py            every picture
#   python3 tools/separate-flat.py owl-ghost  only the named ones
#
# The outline is found by colour. Each pixel is matched to the picture's
# listed colours: a colour with a role (fill, key, accent, or body for a dark
# body) is part of the figure, and a colour with no role is background. The
# roles are left from when the pictures were re-inked; only "body" and
# "none" now differ in effect.
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
EDITION = ROOT / "content/editions/familiars-2026"
SRC = ROOT / "art-incoming"
OUT = EDITION / "art/pictures"
SIZE = 720
ROLES = ("fill", "accent", "key")
# How far a pixel between two inks blends them: 0 is a hard edge.
SOFT = 0.12

# name: source file, palette, and colours as [role or None, "#hex"]. A third
# entry, from 0 to 1, prints that colour's ink thinly, so the card's ground
# shows through it.
# Options: crop (left, top, right, bottom) cuts away a frame before anything
# else; disc names the ink of a round backdrop, and drops whatever lies
# outside it; complete names the ink of a round shape the frame cut off at
# the top, and draws the missing part back in (complete_box also fills a
# bite out of its edge inside that box, and complete_round holds its upper
# edge to the circle, trimming bulges and filling nicks of that depth); rim draws the outline of a
# dark figure in the key ink, as the card edge of a die-cut (rim_width makes
# it an even line of about that width); speck is the
# smallest blob kept, in pixels across; ragged names an ink whose flat bottom
# edge, cut by the frame, is torn into tufts; edge rounds off the outline,
# smoothing bumps and nicks up to about that many pixels; joined keeps thin
# lines that are attached to the figure, which speck alone would drop; faint
# (0 to 1) lets fainter marks print; soft replaces SOFT for one picture;
# backdrop names the ink for a disc of the original's pale paper, kept
# behind a dark figure (colours with the role "paper" count as that paper);
# The picture's own black is kept wherever colour encloses it (close sets
# how wide a gap in the enclosure is shut first; inside=False turns this
# off), and seal lists edges, as points, that close the figure where black
# meets black; seal_disc names the ink of a disc and closes the figure along
# its circle. Enclosed ground that is not the creature is opened again: open
# lists a point inside each such area, and inside_max opens every enclosed
# area larger than that many pixels;
# omit lists outlines (as points) whose contents are left out of the figure;
# source names the file in art-incoming when it differs from the picture's
# name; only_main keeps the largest piece and drops the rest; outline draws a thin line (colour, width) around the cut-out;
# tint maps a colour's position in the list to the colour it should become
# in the cut-out; body_hint sketches a body the picture only implies, as
# chalk strokes through the given points;
# within maps a colour's position in the list to a box (left, top, right,
# bottom), and that colour is only looked for inside it.
PICTURES = {
    "bat-ghost": dict(palette="ghost-light", colours=[[None, "#17160f"], ["fill", "#9cc8b8"], ["key", "#ecd9b4"], ["fill", "#3c4a40", 0.45]]),
    "goat-ghost": dict(palette="ghost-light", edge=2.5, colours=[[None, "#302c23"], ["fill", "#a9cdc4"], ["key", "#ead9bd"]]),
    "moth-ghost": dict(palette="ghost-light", colours=[[None, "#1f1b13"], ["fill", "#a9c9a4"], ["key", "#f3c796"], [None, "#3a352a"]]),
    "owl-ghost": dict(palette="ghost-light", crop=(40, 60, 990, 1000), joined=True, open=[(824, 344)], faint=0.12, colours=[[None, "#12140e"], ["fill", "#b4cfb0"], ["key", "#f6c996"]]),
    "spider-ghost": dict(palette="ghost-light", inside_max=3500, colours=[[None, "#2a2318"], ["fill", "#cbd8a5"], ["key", "#f4d9a3"], [None, "#6e6040"]]),
    "toad-ghost": dict(palette="ghost-light", speck=13, joined=True, faint=0.15, colours=[[None, "#262315"], ["fill", "#b9d2b4"], ["key", "#ecd0a6"], [None, "#6f7a5c"]]),
    "bat-vampire": dict(palette="blood-moon", crop=(122, 84, 915, 952), joined=True, seal=[[(245, 866), (455, 866)], [(484, 402), (512, 436)], [(516, 472), (584, 486)], [(578, 674), (620, 660)]], faint=0.15, colours=[[None, "#1c1a12"], ["fill", "#ec6642"], ["key", "#f2d9b0"], ["fill", "#4a261a", 0.5]]),
    "goat-vampire": dict(palette="blood-moon", only_main=True, colours=[[None, "#221b13"], ["fill", "#d93a26"], ["key", "#f3e3c4"], ["accent", "#e0914f"], ["fill", "#7a2318"]]),
    "moth-vampire": dict(palette="blood-moon", colours=[[None, "#110d07"], ["fill", "#e2501f"], ["accent", "#f0a04a"], ["key", "#f3e2c0"], ["fill", "#6b3a22"]]),
    "owl-vampire": dict(palette="blood-moon", source="owl vampire cape.webp", crop=(40, 70, 958, 970), close=9, seal=[[(645, 97), (652, 110), (651, 125), (649, 142), (651, 158), (658, 174), (672, 195)]], joined=True, colours=[[None, "#14120f"], ["fill", "#f0564a"], ["accent", "#6fa89a"], ["key", "#d9b48c"]]),
    "spider-vampire": dict(palette="blood-moon", rim="key", colours=[[None, "#d6cbb4"], ["body", "#3a1a0f"], ["fill", "#d8432a"], ["accent", "#e08a3a"], [None, "#a89a80"], [None, "#b9a077"]]),
    "toad-vampire": dict(palette="blood-moon", only_main=True, source="toad vampire tile.webp", crop=(120, 70, 935, 922), colours=[[None, "#e6dcc3"], ["fill", "#e8392d"], ["accent", "#b59a35"], ["key", "#6f8c3c"], ["body", "#5b2a22"], [None, "#ece6d8"], [None, "#b5a98e"]]),
    "bat-monstrous": dict(palette="witchs-brew", only_main=True, outline=dict(colour="#9a6fdc", width=3), source="bat monstrous orange.webp", crop=(48, 70, 971, 951), colours=[[None, "#fa9866"], ["body", "#1a1218"], ["fill", "#9ad040"], ["body", "#3d2a4a"]]),
    "goat-monstrous": dict(palette="witchs-brew", crop=(30, 30, 990, 1000), colours=[[None, "#2e2b22"], ["fill", "#8e6ab0"], ["accent", "#a9a868"]]),
    "moth-monstrous": dict(palette="witchs-brew", seal=[[(412, 350), (462, 282), (548, 282), (608, 350)]], colours=[[None, "#231f14"], ["fill", "#7b59a0"], ["accent", "#b0c070"]]),
    "owl-monstrous": dict(palette="witchs-brew", disc="accent", seal_disc="accent", colours=[[None, "#18150d"], ["accent", "#a9c046"], ["fill", "#5a4468"], ["key", "#e8884a"]]),
    "spider-monstrous": dict(palette="witchs-brew", crop=(20, 20, 1004, 1004), seal=[[(456, 236), (512, 228)], [(578, 506), (570, 548), (585, 600), (589, 645), (591, 700), (593, 748), (588, 792), (552, 820), (420, 818), (396, 795), (386, 748), (389, 700), (392, 645), (401, 600), (410, 548), (398, 506), (578, 506)]], colours=[[None, "#2a2914"], ["accent", "#5fae4c"], ["fill", "#8c5aa8"], ["key", "#d8588c"]]),
    "toad-monstrous": dict(palette="witchs-brew", seal=[[(290, 153), (340, 153), (366, 198), (352, 222), (306, 264), (262, 196), (290, 153)], [(192, 230), (177, 250), (170, 275), (170, 305), (178, 330), (192, 347), (202, 354)]], colours=[[None, "#252414"], ["accent", "#aacc78"], ["fill", "#9a84d8"], ["key", "#c8a0b8"]]),
    "black-cat": dict(palette="jack-o-lantern", crop=(0, 20, 1000, 1010), seal_disc="fill", colours=[[None, "#1a1d10"], ["fill", "#f05c30"], ["accent", "#4f9a62"]]),
    "werewolf": dict(palette="witching-hour", crop=(60, 21, 975, 1002), complete="accent", seal=[[(333, 508), (354, 522)], [(660, 512), (630, 534)]], complete_box=(690, 0, 840, 120), complete_round=26, colours=[[None, "#1f1d14"], ["fill", "#f4703c"], ["accent", "#5a3f68"]]),
}


def rgb(hex_):
    return np.array([int(hex_[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)


def lab(a):
    """sRGB (0-255, any shape ending in 3) to CIE Lab."""
    c = a / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def unlab(a):
    """CIE Lab back to sRGB (0-255)."""
    fy = (a[..., 0] + 16) / 116
    f = np.stack([fy + a[..., 1] / 500, fy, fy - a[..., 2] / 200], axis=-1)
    xyz = np.where(f > 0.2069, f**3, (f - 16 / 116) / 7.787) * np.array([0.9505, 1.0, 1.089])
    m = np.linalg.inv(np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]))
    c = np.clip(xyz @ m.T, 0, 1)
    return np.clip(np.where(c > 0.0031308, 1.055 * c ** (1 / 2.4) - 0.055, 12.92 * c) * 255, 0, 255)


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def filtered(mask, f):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(f)).astype(np.float64) / 255


def filled(figure, close):
    """The figure with its inside filled: everything the ground around it
    cannot reach, once gaps up to `close` pixels wide are shut."""
    closed = filtered(filtered(figure > 0.5, ImageFilter.MaxFilter(close)), ImageFilter.MinFilter(close)) > 0.5
    outside = Image.fromarray(np.pad(closed, 1).astype(np.uint8) * 255).copy()
    ImageDraw.floodfill(outside, (0, 0), 128)
    return filtered(np.asarray(outside)[1:-1, 1:-1] != 128, ImageFilter.GaussianBlur(1))


def separate(name, spec):
    im = Image.open(SRC / spec.get("source", name.replace("-", " ") + ".png")).convert("RGB")
    if "crop" in spec:
        im = im.crop(spec["crop"])
    original = np.asarray(im)
    top = 0  # rows added above the picture, by `complete`
    px = lab(np.asarray(im.filter(ImageFilter.GaussianBlur(1.1))).astype(np.float64))
    h, w, _ = px.shape
    flat = px.reshape(-1, 3)
    roles = [c[0] for c in spec["colours"]]
    strength = np.array([c[2] if len(c) > 2 else 1.0 for c in spec["colours"]])
    centres = lab(np.stack([rgb(c[1]) for c in spec["colours"]]))

    # A colour listed in `within` can only claim pixels inside its box.
    yy, xx = np.mgrid[:h, :w]
    outside = {i: ~((xx >= l) & (xx < r) & (yy >= t) & (yy < b)).reshape(-1) for i, (l, t, r, b) in spec.get("within", {}).items()}

    def distances():
        d = np.stack([np.linalg.norm(flat - c, axis=1) for c in centres], axis=1)
        for i, out in outside.items():
            d[out, i] = 1e9
        return d

    # Settle each listed colour on the pixels it actually claims.
    for _ in range(3):
        near = distances().argmin(axis=1)
        for i in range(len(centres)):
            if (near == i).sum() > 200:
                centres[i] = np.median(flat[near == i], axis=0)
    d = distances()
    near = d.argmin(axis=1)
    # The body of a dark figure on pale paper counts as ground once the paper is gone.
    inked = np.array([r in ROLES for r in roles])
    d_ink = d[:, inked].min(axis=1)
    d_ground = d[:, ~inked].min(axis=1)
    faint = spec.get("faint", 0)
    cover = smooth((d_ground - d_ink) / (d_ground + d_ink + 1e-6), -0.12 - faint, 0.12 - faint)
    # Each ink's share of a pixel falls off with distance from the nearest
    # ink, measured against the gap between the two nearest.
    d_inks, c_inks = d[:, inked], centres[inked]
    two = np.argsort(d_inks, axis=1)[:, :2] if inked.sum() > 1 else np.zeros((len(flat), 2), dtype=int)
    gap = np.linalg.norm(c_inks[two[:, 0]] - c_inks[two[:, 1]], axis=1)
    share = np.exp(-(d_inks - d_inks.min(axis=1, keepdims=True)) / (spec.get("soft", SOFT) * gap[:, None] + 1e-6))
    share /= share.sum(axis=1, keepdims=True)
    ink_roles = np.array(roles)[inked]
    thin = (share * strength[inked]).sum(axis=1).reshape(h, w)
    cover_flat = cover
    masks = {r: (cover * share[:, ink_roles == r].sum(axis=1)).reshape(h, w) for r in ROLES if r in roles}

    if spec.get("disc"):
        yy, xx = np.mgrid[:h, :w]
        on = masks[spec["disc"]] > 0.5
        cy, cx = yy[on].mean(), xx[on].mean()
        radius = (xx[on].max() - xx[on].min() + yy[on].max() - yy[on].min()) / 4
        inside = np.hypot(yy - cy, xx - cx) < radius * 1.02
        masks = {r: m * inside for r, m in masks.items()}
    if spec.get("complete"):
        # Fit a circle to the shape's outer edge, then fill the part of it
        # that lies above the picture.
        on = masks[spec["complete"]] > 0.5
        rows = [y for y in range(h) if on[y].sum() > 20]
        edge = np.array([(x, y) for y in rows for x in (np.nonzero(on[y])[0][0], np.nonzero(on[y])[0][-1])], dtype=np.float64)
        keep = np.ones(len(edge), dtype=bool)
        for _ in range(4):
            x, y = edge[keep].T
            (a, b, c), *_ = np.linalg.lstsq(np.stack([x, y, np.ones_like(x)], axis=1), -(x**2 + y**2), rcond=None)
            cx, cy = -a / 2, -b / 2
            radius = np.sqrt(cx**2 + cy**2 - c)
            off = np.abs(np.hypot(edge[:, 0] - cx, edge[:, 1] - cy) - radius)
            keep = off < max(3.0, np.percentile(off, 60))
        pad = int(max(0, radius - cy)) + 4
        top = pad
        yy, xx = np.mgrid[-pad:h, :w]
        # The frame's edge dirties the top few rows, so redraw those too,
        # except in the columns where the figure crosses them.
        clean = 16
        cap = (np.hypot(xx - cx, yy - cy) < radius) & ((yy < 0) | ((yy < clean) & on[clean][None, :]))
        masks = {r: np.concatenate([np.zeros((pad, w)), m]) for r, m in masks.items()}
        masks[spec["complete"]] = np.maximum(masks[spec["complete"]], cap)
        near = np.concatenate([np.zeros(pad * w, dtype=near.dtype), near])
        if spec.get("complete_round"):
            # Hold the shape's upper edge to the fitted circle: trim what
            # bulges past it, and fill nicks up to this many pixels deep
            # with texture from just inside them.
            ring = spec["complete_round"]
            dist = np.hypot(xx - cx, yy - cy)
            upper = yy < cy + 0.6 * radius
            trim = 1 - smooth(dist - radius, -0.8, 0.8) * (dist < radius + 60) * upper
            masks = {r: m * trim for r, m in masks.items()}
            have = np.concatenate([np.zeros((pad, w), dtype=bool), on]) | cap
            nick = (dist < radius) & (dist >= radius - ring) & (yy < cy) & ~have
            ny, nx = np.nonzero(nick)
            scale = (2 * (radius - ring) - dist[nick]) / dist[nick]
            sy = np.clip(np.round(cy + (ny - pad - cy) * scale).astype(int) + pad, 0, have.shape[0] - 1)
            sx = np.clip(np.round(cx + (nx - cx) * scale).astype(int), 0, w - 1)
            ok = have[sy, sx] & (sy >= pad)
            round_fill = (ny[ok], nx[ok], sy[ok], sx[ok])
            masks[spec["complete"]] = np.maximum(masks[spec["complete"]], nick * (1 - smooth(dist - radius, -0.8, 0.8)))
        # The drawn-in part has no picture of its own, so it borrows the
        # shape's texture: each pixel is mirrored from below the seam, or
        # from the shape's other side where the figure is in the way.
        colour = np.median(original[on], axis=0).astype(np.uint8)
        original = np.concatenate([np.broadcast_to(colour, (pad, w, 3)), original])
        cy_, cx_ = np.nonzero(cap)
        src_y = np.clip(2 * clean - (cy_ - pad), 0, on.shape[0] - 1)
        other = np.clip(np.round(2 * cx - cx_).astype(int), 0, w - 1)
        src_x = np.where(on[src_y, cx_], cx_, other)
        usable = on[src_y, src_x]
        original[cy_[usable], cx_[usable]] = original[src_y[usable] + pad, src_x[usable]]
        # Where neither is the shape (the figure fills the middle), look
        # further down and then to either side, a step at a time.
        aside = [np.clip(cx_ + shift, 0, w - 1) for shift in (0, 120, -120, 180, -180, 240, -240)]
        for step in range(0, 121, 12):
            left = ~usable
            deeper = np.clip(src_y + step, 0, on.shape[0] - 1)
            for column in (other, *aside):
                found = left & on[deeper, column]
                original[cy_[found], cx_[found]] = original[deeper[found] + pad, column[found]]
                usable |= found
                left = ~usable
        if spec.get("complete_round"):
            fy, fx, sy, sx = round_fill
            original[fy, fx] = original[sy, sx]
        if spec.get("complete_box"):
            # A bite out of the shape's edge, inside the given box, is filled
            # to the fitted circle with texture from the shape's other side.
            l, t, r, b = spec["complete_box"]
            bite = (np.hypot(xx - cx, yy - cy) < radius) & (xx >= l) & (xx < r) & (yy >= t) & (yy < b)
            bite[pad:] &= ~on
            by, bx = np.nonzero(bite)
            mirror = np.clip(np.round(2 * cx - bx).astype(int), 0, w - 1)
            ok = (by >= pad) & on[np.clip(by - pad, 0, on.shape[0] - 1), mirror]
            original[by, bx] = colour
            original[by[ok], bx[ok]] = original[by[ok], mirror[ok]]
            masks[spec["complete"]] = np.maximum(masks[spec["complete"]], bite)
        h += pad
    if spec.get("ragged"):
        # Tufts of uneven width and depth, the same on every run.
        on = masks[spec["ragged"]] > 0.5
        bottom = np.nonzero(on.any(axis=1))[0][-1]
        rng = np.random.default_rng(7)
        depth = np.zeros(w)
        x = 0
        while x < w:
            width, tall = int(rng.integers(26, 64)), rng.uniform(0.4, 1.0) * h * 0.07
            span = np.arange(min(width, w - x))
            depth[x : x + width] = tall * np.abs(1 - 2 * span / width)
            x += width
        yy = np.mgrid[:h, :w][0]
        masks[spec["ragged"]] = masks[spec["ragged"]] * (yy < bottom - depth[None, :])
    figure = sum(masks.values())
    body = (np.array(roles)[near] == "body").reshape(h, w).astype(np.float64) if "body" in roles else None
    if body is not None:
        figure = np.clip(figure + body, 0, 1)
    # Dust: keep only what touches a blob that survives being worn away.
    speck = spec.get("speck", 7)
    solid = filtered(filtered(figure > 0.5, ImageFilter.MinFilter(speck)), ImageFilter.MaxFilter(speck + 6))
    if spec.get("joined"):
        # Also keep whatever is joined to those blobs, however thin: grow
        # them outward a step at a time, staying inside what prints.
        prints = figure > 0.3
        grown = solid > 0.5
        while True:
            wider = (filtered(grown, ImageFilter.MaxFilter(5)) > 0.5) & prints | grown
            if wider.sum() == grown.sum():
                break
            grown = wider
        solid = grown.astype(np.float64)
    solid = filtered(solid, ImageFilter.GaussianBlur(1.5))
    masks = {r: m * solid for r, m in masks.items()}
    figure = figure * solid
    if (strength < 1).any():
        # Thin inks are thinned only now, so they still count as figure above.
        masks = {r: m * thin for r, m in masks.items()}
    if spec.get("omit"):
        # Leave out whatever lies inside the given outlines.
        gone = Image.new("L", (w, h), 0)
        for outline in spec["omit"]:
            ImageDraw.Draw(gone).polygon(outline, fill=255)
        keep = 1 - filtered(np.asarray(gone) / 255, ImageFilter.GaussianBlur(1))
        figure, masks = figure * keep, {r: m * keep for r, m in masks.items()}
    whole = None
    if body is not None or spec.get("inside", True):
        # The whole figure, with its own black: everything the ground around
        # it cannot reach. Black that belongs to the creature is kept from
        # the picture, never swapped for the card's colour.
        sealed = Image.fromarray(((figure > 0.5) * 255).astype(np.uint8))
        pen = ImageDraw.Draw(sealed)
        for edge in spec.get("seal", []):
            # An edge the picture leaves to the eye, black against black:
            # measured from the picture and drawn in to close the figure.
            pen.line([(x, y + top) for x, y in edge], fill=255, width=3, joint="curve")
        if spec.get("seal_disc"):
            # A creature drawn in black on a disc runs off the disc's edge
            # into the black ground: close it along the disc's own circle.
            on = masks[spec["seal_disc"]] > 0.5
            ys, xs = np.nonzero(on)
            cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
            radius = (xs.max() - xs.min() + ys.max() - ys.min()) / 4 - 2
            pen.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=255, width=3)
        whole = filled(np.asarray(sealed) / 255, spec.get("close", 3))
        # Enclosed ground is not the creature: the slots of a die-cut, or a
        # loop of twigs. `open` names such areas by a point inside each, and
        # `inside_max` opens every enclosed area larger than that many pixels.
        holes = (whole > 0.5) & (np.asarray(sealed) < 128)
        if spec.get("open") or spec.get("inside_max"):
            marks = Image.fromarray((holes * 255).astype(np.uint8)).copy()
            drop = np.zeros(holes.shape, dtype=bool)
            for x, y in spec.get("open", []):
                if marks.getpixel((x, y + top)) == 255:
                    ImageDraw.floodfill(marks, (x, y + top), 100)
                    drop |= np.asarray(marks) == 100
                    ImageDraw.floodfill(marks, (x, y + top), 0)
            if spec.get("inside_max"):
                cores = filtered(holes, ImageFilter.MinFilter(9)) > 0.5
                while cores.any():
                    y, x = np.argwhere(cores)[0]
                    if marks.getpixel((int(x), int(y))) == 255:
                        ImageDraw.floodfill(marks, (int(x), int(y)), 100)
                        piece = np.asarray(marks) == 100
                        if piece.sum() > spec["inside_max"]:
                            drop |= piece
                        ImageDraw.floodfill(marks, (int(x), int(y)), 0)
                        cores &= ~piece
                    else:
                        cores[y, x] = False
            whole = whole * (1 - filtered(drop, ImageFilter.MaxFilter(3)))
    if spec.get("backdrop"):
        # A dark figure photographed on pale paper keeps a disc of that
        # paper behind it, in the named ink, so the figure shows dark on
        # light as it was made. Colours with the role "paper" are the paper.
        paper = filtered((np.array(roles)[near] == "paper").reshape(h, w), ImageFilter.MedianFilter(5))
        ys, xs = np.nonzero(figure > 0.5)
        cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
        radius = min(np.hypot(ys - cy, xs - cx).max() * 1.05, cx, cy, w - cx, h - cy)
        disc = smooth(radius - np.hypot(yy - cy, xx - cx), -1, 1)
        behind = filtered(paper, ImageFilter.GaussianBlur(0.8)) * disc
        masks[spec["backdrop"]] = np.clip(masks.get(spec["backdrop"], 0) + behind, 0, 1)
        figure = np.clip(figure + disc, 0, 1)
    if spec.get("rim") and body is not None:
        if spec.get("rim_width"):
            # An even line just outside the whole silhouette, holes ignored.
            spread = filtered(whole > 0.5, ImageFilter.GaussianBlur(spec["rim_width"]))
            rim = smooth(spread, 0.04, 0.1) * (1 - smooth(spread, 0.42, 0.5))
        else:
            spread = filtered(figure > 0.5, ImageFilter.GaussianBlur(5))
            rim = smooth(spread, 0.06, 0.14) * (1 - smooth(spread, 0.4, 0.5))
        masks[spec["rim"]] = np.clip(masks.get(spec["rim"], 0) + rim, 0, 1)
        figure = np.clip(figure + rim, 0, 1)

    if spec.get("only_main"):
        # Keep the largest piece of the figure and drop whatever sits apart.
        everything = np.maximum(figure, whole) if body is not None else figure
        piece = Image.fromarray((everything > 0.5).astype(np.uint8) * 255).copy()
        heart = np.unravel_index(filtered(everything > 0.5, ImageFilter.GaussianBlur(40)).argmax(), everything.shape)
        ImageDraw.floodfill(piece, (int(heart[1]), int(heart[0])), 128)
        keep = filtered(np.asarray(piece) == 128, ImageFilter.MaxFilter(3))
        figure, masks = figure * keep, {r: m * keep for r, m in masks.items()}
        if body is not None:
            whole = whole * keep
    # Frame the figure: a square around everything that prints, with a margin.
    ys, xs = np.nonzero(figure > 0.5)
    side = max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.04
    cx, cy = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2
    box = tuple(round(v) for v in (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2))
    for stale in OUT.glob(f"{name}-*"):
        stale.unlink()
    # The picture itself, cut out along its outline, with all its texture.
    whole_figure = np.clip(np.maximum(figure, whole if whole is not None else 0), 0, 1)
    for index, target in spec.get("tint", {}).items():
        # Move one of the picture's colours toward another, keeping its
        # texture: every pixel shifts by its share of that colour.
        weight = (cover_flat * share[:, list(np.nonzero(inked)[0]).index(index)]).reshape(original.shape[:2])
        shifted = lab(original.astype(np.float64)) + weight[..., None] * (lab(rgb(target)) - centres[index])
        original = unlab(shifted).astype(np.uint8)
    if spec.get("body_hint"):
        # A body the picture only implies, sketched behind the figure in
        # chalk: a few open strokes through the given points. Each is drawn
        # twice with a slight wobble, like a line gone over by hand, then
        # broken up with grain. Being behind, the strokes disappear under
        # the ears, wings, and legs they run into.
        hint = spec["body_hint"]
        rng = np.random.default_rng(11)
        line = Image.new("L", (w, h), 0)
        pen = ImageDraw.Draw(line)
        for stroke in hint["strokes"]:
            pts = np.array(stroke, dtype=np.float64)
            for _ in range(4):
                mid = np.stack([0.75 * pts[:-1] + 0.25 * pts[1:], 0.25 * pts[:-1] + 0.75 * pts[1:]], axis=1).reshape(-1, 2)
                pts = np.concatenate([pts[:1], mid, pts[-1:]])
            for _ in range(2):
                wobble = np.cumsum(rng.normal(0, 0.55, pts.shape), axis=0)
                wobble -= np.linspace(0, 1, len(pts))[:, None] * wobble[-1]
                pen.line([tuple(q) for q in pts + wobble + rng.normal(0, 1.2, 2)], fill=255, width=hint.get("width", 5), joint="curve")
        grain = filtered(rng.random((h, w)), ImageFilter.GaussianBlur(1.2))
        grain = (grain - grain.mean()) / grain.std()
        soft_line = filtered(np.asarray(line) / 255, ImageFilter.GaussianBlur(1.4))
        chalk = smooth(soft_line + hint.get("rough", 0.22) * grain, 0.42, 0.52) * (soft_line > 0.08)
        chalk = chalk * (0.72 + 0.28 * (rng.random((h, w)) > 0.3))
        under = whole_figure[..., None]
        original = np.where(chalk[..., None] > 0, original * under + rgb(hint["colour"]) * (1 - under), original).astype(np.uint8)
        whole_figure = np.maximum(whole_figure, chalk)
    if spec.get("outline"):
        # A thin line in one colour around the whole cut-out, overlapping its
        # edge a little so none of the original's paper shows there.
        spread = filtered(whole_figure > 0.5, ImageFilter.GaussianBlur(spec["outline"]["width"]))
        around = (smooth(spread, 0.08, 0.16) * (1 - smooth(spread, 0.62, 0.74)))[..., None]
        original = (original * (1 - around) + rgb(spec["outline"]["colour"]) * around).astype(np.uint8)
        whole_figure = np.maximum(whole_figure, around[..., 0])
    # Saved as a JPEG with its outline as a separate mask, which is a
    # fraction of the size of one PNG. Outside the outline it is black.
    inside = (whole_figure > 0.02)[..., None]
    image = Image.fromarray((original * inside).astype(np.uint8)).crop(box).resize((SIZE, SIZE), Image.LANCZOS)
    outline = Image.fromarray((whole_figure * 255).astype(np.uint8)).crop(box).resize((SIZE, SIZE), Image.LANCZOS)
    if spec.get("edge"):
        # Round off the outline: blur it and cut it again at half strength,
        # which drops bumps and fills nicks smaller than the blur.
        rounded = smooth(np.asarray(outline.filter(ImageFilter.GaussianBlur(spec["edge"]))) / 255, 0.42, 0.58)
        outline = Image.fromarray((rounded * 255).astype(np.uint8))
    image.save(OUT / f"{name}-image.jpg", quality=92, subsampling=0)
    outline.save(OUT / f"{name}-cut.png", optimize=True)
    return image, outline


def preview(done):
    palettes = {p["id"]: p for p in json.loads((EDITION / "edition.json").read_text())["inks"]}
    cell, cols = 360, 5
    rows = -(-len(done) // cols)
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 24)), "#000000")
    draw = ImageDraw.Draw(sheet)
    for i, (name, (image, outline)) in enumerate(done.items()):
        tile = Image.new("RGB", (SIZE, SIZE), palettes[PICTURES[name]["palette"]]["paper"])
        tile.paste(image, (0, 0), outline)
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        sheet.paste(tile.resize((cell, cell), Image.LANCZOS), (x, y + 24))
        draw.text((x + 6, y + 6), name, fill="#ffffff")
    (ROOT / "out").mkdir(exist_ok=True)
    sheet.save(ROOT / "out/pictures-preview.png")


OUT.mkdir(parents=True, exist_ok=True)
names = sys.argv[1:] or list(PICTURES)
done = {}
for name in names:
    done[name] = separate(name, PICTURES[name])
    print(name)
preview(done)

# Name each result's cut-out in its species file.
for file in sorted((EDITION / "species").glob("*.json")):
    species = json.loads(file.read_text())
    slug = species["slug"]

    def layers(name):
        return {"image": f"pictures/{name}-image.jpg", "cut": f"pictures/{name}-cut.png"}

    if species.get("variants") is False:
        species["art"]["layers"] = layers(slug)
    else:
        species["art"]["pictures"] = {v: layers(f"{slug}-{v}") for v in ("ghost", "vampire", "monstrous")}
    file.write_text(json.dumps(species, indent=2, ensure_ascii=False) + "\n")
