#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["numpy", "scipy", "netCDF4", "scikit-image", "shapely"]
# ///
"""Sunda maps for PAO:3:1 and PAO:3:2, drawn from ETOPO 2022 as panel SVGs.

    ./scripts/sunda-maps.py            # writes riverbanks/maps/sunda-*.svg

The last glacial lowstand coast is the −120 m contour (Voris 2000). The drowned rivers are not
traced from anyone's map: they come out of flow routing on the same grid, with everything below
−120 m as sea. Downloads and the routing are cached in ~/.cache/sunda-maps.
"""
import heapq, pathlib, subprocess, sys

import netCDF4
import numpy as np
from scipy import ndimage
from shapely.geometry import LineString, Polygon
from skimage import measure

CACHE = pathlib.Path.home() / ".cache/sunda-maps"
OUT = pathlib.Path(__file__).resolve().parent.parent / "riverbanks/maps"
WEST, SOUTH, EAST, NORTH = 88, -12, 128, 24
URL = (
    "https://www.ngdc.noaa.gov/thredds/wcs/global/ETOPO2022/60s/60s_surface_elev_netcdf/"
    "ETOPO_2022_v1_60s_N90W180_surface.nc?service=WCS&version=1.0.0&request=GetCoverage"
    f"&coverage=z&bbox={WEST},{SOUTH},{EAST},{NORTH}&format=NetCDF3"
)
LOWSTAND = -120

PALETTE = {
    "deep": "#A9CAC4",  # beyond the shelf break
    "sea": "#C9DDD6",  # river teal, much lightened
    "shelf": "#F3ECDC",  # paper cream: land then, sea now
    "land": "#DCC79B",  # silt/ochre, land now
    "river": "#2E6B67",  # river teal
    "ink": "#111111",
    "mark": "#C4553A",  # brick red accent
}

# Each map: extent (west, east, centre latitude), river threshold in cells, the panel's box on the
# board (to print where label balloons go) and the places to label.
MAPS = {
    "sunda-landmass": dict(
        west=88.2, east=127.8, lat=2.5, threshold=30000, rivers=0.9, mark=None, legend=True,
        panel=(0, 125, 495, 295),
        labels={"SUNDA": (106, 3), "SUMATRA": (101.5, -1), "BORNEO": (114, 0.5), "JAVA": (110, -7.4),
                "MALAY PENINSULA": (102, 4.5), "INDOCHINA": (106, 13.5)},
    ),
    "sunda-river": dict(
        west=96, east=122, lat=4.5, threshold=3000, rivers=1.0, mark=(110, 5), legend=False,
        panel=(505, 125, 495, 295),
        labels={"FLOTEL 5°N 110°E": (110, 5), "PALEO-LAKE": (101.3, 10.5),
                "SIAM RIVER": (102.5, 7.5), "NORTH SUNDA RIVER": (107, 1.5),
                "MALACCA STRAITS RIVER": (99.5, 4), "SUMATRA": (101, -1), "BORNEO": (114, 1),
                "MALAY PENINSULA": (102.2, 4)},
    ),
}
W, H = 1000, 596  # PAO:3:1 and 3:2 are 495 × 295


def load():
    CACHE.mkdir(parents=True, exist_ok=True)
    nc = CACHE / "etopo.nc"
    if not nc.exists():
        subprocess.run(["curl", "-sSf", "-o", nc, URL], check=True)
    ds = netCDF4.Dataset(nc)
    names = list(ds.variables)
    lat = ds.variables[next(n for n in names if n.startswith("lat"))][:].astype(float)
    lon = ds.variables[next(n for n in names if n.startswith("lon"))][:].astype(float)
    z = np.ma.filled(ds.variables["z"][:], -1e4).astype(float)
    if lat[0] < lat[-1]:  # north up
        lat, z = lat[::-1], z[::-1]
    return lon, lat, z


def ocean(z):
    """Sea at the lowstand: below −120 m and joined to the open ocean. Pits deeper than that in the
    middle of the shelf were lakes, not sea."""
    labels, _ = ndimage.label(z <= LOWSTAND)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == sizes.argmax()


def route(z):
    """Flow accumulation on the lowstand landscape: priority-flood fill with an epsilon so flats
    drain, steepest-descent (D8) directions, then accumulation from the top down. Also returns the
    lakes: depressions the fill had to raise by more than a few metres."""
    cached = CACHE / "routing-v2.npz"
    if cached.exists():
        d = np.load(cached)
        return d["down"], d["acc"], d["depth"]
    rows, cols = z.shape
    sea = ocean(z)
    z = np.where(sea, z, ndimage.gaussian_filter(z, 1.2))
    filled = z.copy()
    done = sea.copy()
    heap = []
    edge = np.zeros_like(sea)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    # Seeds: land touching the sea or the edge of the grid.
    seeds = ~sea & (edge | ndimage.binary_dilation(sea, np.ones((3, 3))))
    for r, c in zip(*np.nonzero(seeds)):
        heapq.heappush(heap, (filled[r, c], r, c))
        done[r, c] = True
    nbrs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while heap:
        e, r, c = heapq.heappop(heap)
        for dr, dc in nbrs:
            rr, cc = r + dr, c + dc
            if 0 <= rr < rows and 0 <= cc < cols and not done[rr, cc]:
                done[rr, cc] = True
                filled[rr, cc] = max(filled[rr, cc], e + 1e-3)
                heapq.heappush(heap, (filled[rr, cc], rr, cc))

    # D8 on the filled surface. Sea cells point nowhere (-1).
    idx = np.arange(rows * cols).reshape(rows, cols)
    pad = np.pad(filled, 1, constant_values=np.inf)
    best = np.zeros_like(filled)
    down = np.full(filled.shape, -1, int)
    for dr, dc in nbrs:
        nb = pad[1 + dr : rows + 1 + dr, 1 + dc : cols + 1 + dc]
        drop = (filled - nb) / np.hypot(dr, dc)
        better = drop > best
        best = np.where(better, drop, best)
        target = np.roll(np.roll(idx, -dr, 0), -dc, 1)
        down = np.where(better, target, down)
    down[sea] = -1
    down = down.ravel()

    acc = np.where(sea.ravel(), 0, 1).astype(np.int64)
    for i in np.argsort(-filled.ravel(), kind="stable"):
        j = down[i]
        if j >= 0:
            acc[j] += acc[i]
    depth = (filled - z).astype(np.float32)
    np.savez_compressed(cached, down=down, acc=acc, depth=depth)
    return down, acc, depth


def lakes(z, depth):
    """Lowstand lakes: big depressions on what is now sea floor. Highland pits and pools along the
    channels are artefacts of the grid, and would break the rivers."""
    lake = ndimage.binary_opening((depth > 3) & (z < 0), np.ones((3, 3)))
    labels, _ = ndimage.label(lake)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return sizes[labels] >= 400


class Frame:
    def __init__(self, lon, lat, west, east, lat_c):
        self.lon, self.lat = lon, lat
        self.west, self.east = west, east
        k = np.cos(np.radians(lat_c))
        span = (east - west) * k * H / W  # degrees of latitude the panel holds
        self.north, self.south = lat_c + span / 2, lat_c - span / 2
        self.sx = W / (east - west)
        self.sy = H / (self.north - self.south)
        self.dlon = lon[1] - lon[0]
        self.dlat = lat[0] - lat[1]

    def xy(self, lo, la):
        return (lo - self.west) * self.sx, (self.north - la) * self.sy

    def cell(self, r, c):
        """Grid index (fractional) to panel coordinates."""
        return self.xy(self.lon[0] + c * self.dlon, self.lat[0] - r * self.dlat)


def num(v):
    """Shortest form of a coordinate in tenths: 0.5 → .5, -0.5 → -.5, 2.0 → 2."""
    t = f"{v / 10:.1f}".rstrip("0").rstrip(".")
    t = t.replace("0.", ".", 1) if t.startswith("0.") else t.replace("-0.", "-.", 1)
    return t if t not in ("", "-") else "0"


def pair(x, y):
    a, b = num(x), num(y)
    return a + ("" if b.startswith("-") else " ") + b


def path(pts, close=False):
    """An SVG subpath in relative coordinates, rounded to a tenth of a unit without drift."""
    q = [(round(x * 10), round(y * 10)) for x, y in pts]
    q = [p for i, p in enumerate(q) if i == 0 or p != q[i - 1]]
    if len(q) < 2:
        return ""
    d = "M" + pair(*q[0]) + "l" + "".join(
        (" " if i and not num(x1 - x0).startswith("-") else "") + pair(x1 - x0, y1 - y0)
        for i, ((x0, y0), (x1, y1)) in enumerate(zip(q, q[1:]))
    )
    return d + ("z" if close else "")


def rings(z, level, f, min_area=6.0, tol=0.5):
    """Closed contours of z at level, as one even-odd SVG path, inside the frame only."""
    r0 = max(int((f.lat[0] - f.north) / f.dlat) - 4, 0)
    r1 = min(int((f.lat[0] - f.south) / f.dlat) + 4, z.shape[0])
    c0 = max(int((f.west - f.lon[0]) / f.dlon) - 4, 0)
    c1 = min(int((f.east - f.lon[0]) / f.dlon) + 4, z.shape[1])
    sub = np.pad(z[r0:r1, c0:c1], 1, constant_values=-1e4)
    sub = ndimage.gaussian_filter(sub, 1.0)
    parts = []
    for ring in measure.find_contours(sub, level):
        pts = [f.cell(r - 1 + r0, c - 1 + c0) for r, c in ring]
        poly = Polygon(pts)
        if poly.area < min_area:
            continue
        coords = LineString(pts).simplify(tol).coords
        if len(coords) >= 4:
            parts.append(path(coords, close=True))
    return "".join(parts)


def chaikin(pts, n=2):
    p = np.asarray(pts, float)
    for _ in range(n):
        if len(p) < 3:
            break
        q = 0.75 * p[:-1] + 0.25 * p[1:]
        r = 0.25 * p[:-1] + 0.75 * p[1:]
        p = np.vstack([p[:1], np.column_stack([q, r]).reshape(-1, 2), p[-1:]])
    return p


def rivers(down, acc, lake, shape, f, threshold, scale):
    """River segments where accumulation passes threshold, stroke width by log(accumulation)."""
    rows, cols = shape
    stream = (acc >= threshold) & ~lake.ravel()
    ups = np.zeros(acc.shape, int)
    s_idx = np.nonzero(stream)[0]
    targets = down[s_idx]
    np.add.at(ups, targets[targets >= 0], 1)
    starts = [i for i in s_idx if ups[i] != 1]  # heads (0 upstream) and junctions (2+)
    widths = {}
    for i in starts:
        seg = [i]
        j = down[i]
        while j >= 0 and stream[j]:
            seg.append(j)
            if ups[j] != 1:
                break
            j = down[j]
        if j >= 0 and not stream[j]:
            pass
        if len(seg) < 2:
            continue
        pts = [f.cell(k // cols, k % cols) for k in seg]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        if max(xs) < -5 or min(xs) > W + 5 or max(ys) < -5 or min(ys) > H + 5:
            continue
        a = acc[seg[-1]]
        w = scale * min(0.6 + 0.55 * np.log2(a / threshold), 5.0)
        w = round(max(w, 0.6 * scale) * 4) / 4
        line = LineString(chaikin(pts)).simplify(0.4)
        widths.setdefault(w, []).append(path(line.coords))
    return widths


def draw(name, spec, lon, lat, z, down, acc, lake):
    f = Frame(lon, lat, spec["west"], spec["east"], spec["lat"])
    dry = np.where(ocean(z), z, np.maximum(z, LOWSTAND + 1))
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">',
        f'<rect width="{W}" height="{H}" fill="{PALETTE["deep"]}"/>',
        f'<path d="{rings(z, -1000, f, min_area=20)}" fill="{PALETTE["sea"]}" fill-rule="evenodd"/>',
        f'<path d="{rings(dry, LOWSTAND, f)}" fill="{PALETTE["shelf"]}" fill-rule="evenodd" '
        f'stroke="{PALETTE["ink"]}" stroke-width="1.6" stroke-linejoin="round"/>',
        f'<path d="{rings(z, 0, f, min_area=3)}" fill="{PALETTE["land"]}" fill-rule="evenodd" '
        f'stroke="{PALETTE["ink"]}" stroke-width="0.7" stroke-linejoin="round"/>',
    ]
    svg.append(
        f'<path d="{rings(np.where(lake, 1.0, -1.0), 0, f, min_area=4)}" fill="{PALETTE["sea"]}" '
        f'fill-rule="evenodd" stroke="{PALETTE["river"]}" stroke-width="0.8"/>'
    )
    for w, ds in sorted(rivers(down, acc, lake, z.shape, f, spec["threshold"], spec["rivers"]).items()):
        svg.append(
            f'<path d="{"".join(ds)}" fill="none" stroke="{PALETTE["river"]}" stroke-width="{w}" '
            'stroke-linecap="round" stroke-linejoin="round"/>'
        )
    if spec["mark"]:
        x, y = f.xy(*spec["mark"])
        svg.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="none" stroke="{PALETTE["mark"]}" stroke-width="2.5"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{PALETTE["mark"]}" stroke="{PALETTE["ink"]}" stroke-width="1"/>'
        )
    if spec["legend"]:
        for k, (key, edge) in enumerate([("land", 0.7), ("shelf", 1.6)]):
            y = 492 + k * 30
            stroke = f' stroke="{PALETTE["ink"]}" stroke-width="{edge}"' if edge else ""
            svg.append(f'<rect x="22" y="{y}" width="34" height="20" fill="{PALETTE[key]}"{stroke}/>')
    svg.append("</svg>")
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.svg"
    path.write_text("\n".join(svg))
    print(f"{path.relative_to(OUT.parent.parent)}  {path.stat().st_size / 1000:.0f} KB  "
          f"lat {f.south:.1f}–{f.north:.1f}")
    px, py, pw, ph = spec["panel"]
    for label, (lo, la) in spec["labels"].items():
        x, y = f.xy(lo, la)
        print(f"  {label:24} board x={px + x * pw / W:.0f} y={py + y * ph / H:.0f}")


def main():
    lon, lat, z = load()
    down, acc, depth = route(z)
    lake = lakes(z, depth)
    for name in sys.argv[1:] or MAPS:
        draw(name, MAPS[name], lon, lat, z, down, acc, lake)


if __name__ == "__main__":
    main()
