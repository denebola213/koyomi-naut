#!/usr/bin/env python3
"""天の川の外側輪郭線を算出して milky-way.js を生成する。

入力は d3-celestial の milkyway.json（全202リング）。
リングは球面上の閉曲線で、銀河座標 (l, b) 平面に展開すると帯を一周する
ものが螺旋状になり平面の内側判定が壊れる。そこで北銀極からの
立体射影（stereographic）で平面に移し、shapely で和集合を取って
帯の外周（北側・南側の2ループ）だけを抽出する。
出力は赤道座標 (RA, Dec) のループ列。J2000。
"""
import argparse, json, math, sys

POLE = (192.859508, 27.128336)   # 北銀極
CENTER = (266.405, -29.008)      # 銀河中心方向 (l=0, b=0)


def unit(ra, dec):
    r, d = math.radians(ra), math.radians(dec)
    return (math.cos(d) * math.cos(r), math.cos(d) * math.sin(r), math.sin(d))


ZG = unit(*POLE)
XG = unit(*CENTER)
YG_RAW = (ZG[1] * XG[2] - ZG[2] * XG[1],
          ZG[2] * XG[0] - ZG[0] * XG[2],
          ZG[0] * XG[1] - ZG[1] * XG[0])
_n = math.sqrt(sum(c * c for c in YG_RAW))
YG = tuple(c / _n for c in YG_RAW)


def stereo(v):
    """単位ベクトル → 北銀極からの立体射影座標。"""
    d = 1.0 + sum(v[i] * ZG[i] for i in range(3))
    return (sum(v[i] * XG[i] for i in range(3)) / d,
            sum(v[i] * YG[i] for i in range(3)) / d)


def unstereo(X, Y):
    q = X * X + Y * Y
    s = 1.0 + q
    return tuple((2 * X * XG[i] + 2 * Y * YG[i] + (1 - q) * ZG[i]) / s for i in range(3))


def to_eq(v):
    ra = math.degrees(math.atan2(v[1], v[0])) % 360.0
    return ra, math.degrees(math.asin(max(-1.0, min(1.0, v[2]))))


def signed_area(ring):
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def contains(outer, pt):
    x, y = pt
    ins = False
    for i in range(len(outer)):
        x1, y1 = outer[i]
        x2, y2 = outer[(i + 1) % len(outer)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def classify(feature_rings):
    """赤道面で、他リングの内側にあり巻き方向が逆のものを穴にする。"""
    areas = [signed_area(r) for r in feature_rings]
    holes = {}
    for j, r in enumerate(feature_rings):
        cands = [i for i, o in enumerate(feature_rings)
                 if i != j and areas[i] * areas[j] < 0
                 and abs(areas[i]) > abs(areas[j]) and contains(o, r[0])]
        if cands:
            holes[j] = min(cands, key=lambda i: abs(areas[i]))
    shells = [i for i in range(len(feature_rings)) if i not in holes]
    return shells, holes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="milkyway.json のパス")
    ap.add_argument("-o", "--output", default="milky-way.js")
    ap.add_argument("--tol", type=float, default=0.004,
                    help="輪郭の単純化許容（立体射影座標）")
    args = ap.parse_args()

    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    from shapely import make_valid

    raw = json.load(open(args.source))
    polys = []
    for f in raw["features"]:
        feat_rings = [[tuple(p) for p in r] for r in f["geometry"]["coordinates"]]
        shells, holes = classify(feat_rings)
        hole_map = {s: [] for s in shells}
        for j, s in holes.items():
            if s in hole_map:
                hole_map[s].append(j)
        for s in shells:
            sh = [stereo(unit(lon if lon >= 0 else lon + 360.0, lat))
                  for lon, lat in feat_rings[s]]
            hs = [[stereo(unit(lon if lon >= 0 else lon + 360.0, lat))
                   for lon, lat in feat_rings[j]] for j in hole_map[s]]
            if len(sh) >= 3:
                p = make_valid(Polygon(sh, hs))
                if not p.is_empty:
                    polys.append(p)

    merged = unary_union(polys)
    parts = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
    parts.sort(key=lambda p: p.area, reverse=True)
    print(f"components={len(parts)} areas={[round(p.area, 3) for p in parts]}", file=sys.stderr)

    out_rings = []
    for k, part in enumerate(parts):
        rings = [part.exterior]
        if k == 0:
            # 最大成分の内側（南極側の帽）＝帯のもう一方の外周。暗い筋などの
            # 小さな内側ループは除く
            rings += [r for r in part.interiors if Polygon(r).area > 0.5]
        for ring in rings:
            simp = ring.simplify(args.tol, preserve_topology=True)
            eq = [to_eq(unstereo(x, y)) for x, y in simp.coords]
            if len(eq) >= 20:
                out_rings.append([[round(ra, 3), round(dec, 3)] for ra, dec in eq])

    header = '''"use strict";
/* 天の川の帯（和集合の外側輪郭線）
 * データ出典: d3-celestial (ofrohn/d3-celestial) data/milkyway.json
 *   ライセンス: BSD 3-Clause License。J2000 赤経（度, 0-360）・赤緯（度）。
 *   全202リングを北銀極からの立体射影で和集合を取り、外周だけを抽出
 *   （scripts/build-milkyway.py で算出、単純化済み）。
 *   内側の詳細リングは描かない（線は app.js が altAz で変換する）。
 * 外部取得しない。
 */
const MILKY_WAY = '''
    body = json.dumps(out_rings, ensure_ascii=False, separators=(",", ":"))
    footer = ";\nif (typeof module !== 'undefined') module.exports = { MILKY_WAY };\n"
    with open(args.output, "w") as fh:
        fh.write(header + body + footer)
    print(f"loops={len(out_rings)} points={sum(len(r) for r in out_rings)}", file=sys.stderr)


if __name__ == "__main__":
    main()
