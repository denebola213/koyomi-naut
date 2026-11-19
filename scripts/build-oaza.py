#!/usr/bin/env python3
"""Geolonia 住所データ (CC BY 4.0) から oaza.js を生成する。

実行時の通信は発生しない: ビルド時に一度だけ latest.csv を取得し、
同一オリジンの静的ファイル oaza.js として同梱する。
更新手順: python3 scripts/build-oaza.py
"""
import argparse
import csv
import json
import urllib.request

SRC_URL = "https://geolonia.github.io/japanese-addresses/latest.csv"

HEADER = """/* 大字・町丁目＋小字（字）データ: Geolonia 住所データ (CC BY 4.0)
 * 元データ: 国土交通省「大字・町丁目レベル位置参照情報」等を基に
 * Geolonia が毎月更新 (https://github.com/geolonia/japanese-addresses)
 * 緯度経度は大字・町丁目の代表点。小字（字）ごとの座標ではない。
 * 再生成: python3 scripts/build-oaza.py
 */
"""


def to_hiragana(s):
    # カタカナ（ァ-ヶ）→ ひらがな。既存 municipalities.js の表記に合わせる
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="local latest.csv path (default: download)")
    ap.add_argument("--out", default="oaza.js")
    args = ap.parse_args()

    if args.src:
        f = open(args.src, encoding="utf-8")
    else:
        f = urllib.request.urlopen(SRC_URL)
        import io

        f = io.TextIOWrapper(f, encoding="utf-8")

    rows = list(csv.DictReader(f))

    cities = []
    city_index = {}
    entries = []
    for r in rows:
        oaza = (r.get("大字町丁目名") or "").strip()
        lat_s, lon_s = (r.get("緯度") or "").strip(), (r.get("経度") or "").strip()
        if not oaza or not lat_s or not lon_s:
            continue
        key = (r["都道府県名"], r["市区町村名"])
        if key not in city_index:
            city_index[key] = len(cities)
            cities.append([r["都道府県名"], r["市区町村名"], to_hiragana(r["市区町村名カナ"])])
        entries.append(
            [
                city_index[key],
                oaza,
                to_hiragana(r["大字町丁目名カナ"]),
                (r.get("小字・通称名") or "").strip(),
                round(float(lat_s), 4),
                round(float(lon_s), 4),
            ]
        )

    with open(args.out, "w", encoding="utf-8") as out:
        out.write(HEADER)
        out.write("const OAZA_CITIES = ")
        json.dump(cities, out, ensure_ascii=False, separators=(",", ":"))
        out.write(";\nconst OAZA = ")
        json.dump(entries, out, ensure_ascii=False, separators=(",", ":"))
        out.write(";\n")

    print(f"{args.out}: cities={len(cities)} entries={len(entries)}")


if __name__ == "__main__":
    main()
