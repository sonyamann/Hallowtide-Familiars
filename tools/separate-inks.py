# Splits a two-ink print into two masks, one per ink, so each can be
# re-inked in any colour. Works in optical density: a pixel's darkness is
# treated as a mix of the two inks' densities, solved per pixel.
import sys
from PIL import Image
import numpy as np
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float64) / 255
h, w, _ = im.shape
# Paper: the median of the image's border.
b = max(8, w // 40)
border = np.concatenate([im[:b].reshape(-1, 3), im[-b:].reshape(-1, 3), im[:, :b].reshape(-1, 3), im[:, -b:].reshape(-1, 3)])
paper = np.median(border, axis=0)
od = -np.log(np.clip(im / paper, 1e-3, 1.0))            # density above paper
px = od.reshape(-1, 3)
strength = px.sum(axis=1)
inked = px[strength > np.percentile(strength, 70)]
# The two inks: split the inked pixels by hue (blue-ish density vs red-ish).
ratio = inked[:, 0] / (inked.sum(axis=1) + 1e-6)          # share of density in red = absorbs red = teal/blue
key_px = inked[ratio > np.percentile(ratio, 80)]
fill_px = inked[ratio < np.percentile(ratio, 30)]
key = np.percentile(key_px, 90, axis=0)
fill = np.percentile(fill_px, 80, axis=0)
A = np.stack([key, fill], axis=1)                         # 3 x 2
coef, *_ = np.linalg.lstsq(A, px.T, rcond=None)
k = np.clip(coef[0], 0, 1).reshape(h, w)
f = np.clip(coef[1], 0, 1).reshape(h, w)
# Clean the floor so paper grain doesn't print.
def clean(m, lo, hi): return np.clip((m - lo) / (hi - lo), 0, 1)
k = clean(k, 0.16, 0.85); f = clean(f, 0.18, 0.8)
Image.fromarray((k * 255).astype(np.uint8), "L").save(out + "-key.png", optimize=True)
Image.fromarray((f * 255).astype(np.uint8), "L").save(out + "-fill.png", optimize=True)
print("paper", (paper * 255).round(), "key ink od", key.round(2), "fill ink od", fill.round(2))
