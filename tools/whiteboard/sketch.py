"""Turns one rendered 3D frame into a whiteboard source image: beige paper, dark-grey pencil lines, pale colour wash,
plus an annotation.json that tells the stream renderer (srt-whiteboard-animation, MIT) in what order to draw the regions.
Usage: python sketch.py frame.jpg out_prefix duration_ms
Writes out_prefix.png and out_prefix.annotation.json"""
import json
import sys

import cv2
import numpy as np

PAPER = np.array([0xD7, 0xEB, 0xF5], dtype=np.float32)  # #F5EBD7 in BGR
W = 720


def sketch(img):
    h, w = img.shape[:2]
    img = cv2.resize(img, (W, round(h * W / w)), interpolation=cv2.INTER_AREA)
    smooth = cv2.bilateralFilter(img, 7, 40, 7)
    gray = cv2.cvtColor(smooth, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 35, 100)
    local = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 9)
    local = cv2.morphologyEx(local, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    lines = cv2.dilate(cv2.bitwise_or(edges, local), np.ones((2, 2), np.uint8))
    # pale colour wash: quantised colours blended into the paper (muted, so it still reads as a hand-coloured drawing)
    q = (smooth // 40 * 40 + 20).astype(np.float32)
    wash = 0.42 * q + 0.58 * PAPER
    out = wash.copy()
    out[lines > 0] = (62, 62, 66)
    return img, np.clip(out, 0, 255).astype(np.uint8), lines


def regions(lines, w, h):
    """Background first (the whole frame), then up to 3 biggest subjects, biggest first."""
    blobs = cv2.dilate(lines, np.ones((41, 41), np.uint8))
    n, _, st, _ = cv2.connectedComponentsWithStats(blobs)
    found = []
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if bw * bh >= 0.04 * w * h and bw * bh <= 0.85 * w * h:
            pad = int(0.03 * w)
            x0, y0 = max(0, x - pad), max(0, y - pad)
            found.append((bw * bh, x0, y0, min(w, x + bw + pad) - x0, min(h, y + bh + pad) - y0))
    found.sort(reverse=True)
    return [{"x": int(x), "y": int(y), "width": int(a), "height": int(b)} for _, x, y, a, b in found[:3]]


def main():
    src, prefix, dur = sys.argv[1], sys.argv[2], int(sys.argv[3])
    img = cv2.imread(src)
    if img is None:
        raise SystemExit(f"cannot read {src}")
    img, art, lines = sketch(img)
    h, w = art.shape[:2]
    cv2.imwrite(prefix + ".png", art)
    subjects = regions(lines, w, h)
    boxes = [("background", "scene setup", {"x": 0, "y": 0, "width": w, "height": h})]
    boxes += [(f"subject_{i + 1}", "key object or character", r) for i, r in enumerate(subjects)]
    usable = max(600, dur - 600)  # the finished drawing stays on screen for at least 0.5 s
    weights = [3.0] + [2.0] * (len(boxes) - 1)
    gap = 100
    span = usable - gap * (len(boxes) - 1)
    t = 150
    elements = []
    for k, ((eid, role, r), wt) in enumerate(zip(boxes, weights)):
        d = max(250, int(span * wt / sum(weights)))
        elements.append({
            "id": eid, "label": eid, "sequence": k + 1, "narrativeRole": role, "subtitle": "", "type": "structure" if k == 0 else "character",
            "region": r,
            "reveal": {"direction": "top_to_bottom", "startMs": t, "durationMs": d, "maskPaddingPx": 18, "protectedRegions": []},
            "handPath": {"start": [r["x"] + r["width"] // 2, r["y"]], "end": [r["x"] + r["width"] // 2, r["y"] + r["height"]], "easing": "easeInOut"},
        })
        t += d + gap
    json.dump({"sceneId": prefix.split("/")[-1], "canvas": {"width": w, "height": h}, "storyBasis": "auto", "sceneDurationMs": dur, "elements": elements},
              open(prefix + ".annotation.json", "w"), ensure_ascii=False, indent=2)
    print(f"sketch: {w}x{h}, {len(elements)} regions")


main()
