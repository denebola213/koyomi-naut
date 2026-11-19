#!/usr/bin/env python3
"""koyomi-naut の DOM 検証: JS参照IDの存在と入力/結果ゾーンの漏れチェック。
使い方: python3 scripts/verify-dom.py [repo_dir]  (既定: カレントディレクトリ)
終了コード 0 = OK、1 = 問題あり。"""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
html = (root / 'index.html').read_text()
js = (root / 'app.js').read_text()

ids_html = set(re.findall(r'id="([^"]+)"', html))
ids_js = set(re.findall(r"\$\('([^']+)'\)", js)) | set(re.findall(r"setText\('([^']+)'", js))
missing = sorted(ids_js - ids_html)

problems = []
if missing:
    problems.append(f'JS参照でHTMLに無いid: {missing}')

# ゾーン抽出（class="zone zone-input" / "zone-result" の開始から次のゾーン or </main> まで）
def zone(name):
    m = re.search(rf'class="zone {name}"', html)
    if not m:
        return ''
    rest = html[m.start():]
    nxt = rest.find('class="zone ', 10)
    end = rest.find('</main>')
    cut = min([x for x in (nxt, end) if x != -1], default=len(rest))
    return rest[:cut]

inp, res = zone('zone-input'), zone('zone-result')
result_ids = ['placeLabel', 'dmsLat', 'dmsLon', 'decLat', 'decLon', 'dateLabel', 'timeLabel', 'skyTimeLabel', 'timeline', 'skyChart']
leaked = [i for i in result_ids if f'id="{i}"' in inp]
if leaked:
    problems.append(f'入力ゾーンに結果idが漏れている: {leaked}')
# 結果ゾーンの入力控件（? ダイアログ起動ボタン moonHelpBtn とタブ切替ボタンは除外）
# 全天図（空のようす）の時刻スライダー timeSlider と表示切替（planetToggle/constellationToggle/starDisplay/eclipticToggle/milkyWayToggle/constellationNameToggle）は
# 結果ゾーン内の例外（空のようすパネルに近接させる指示のため許可）
ctrl = [i for kind, i in re.findall(r'<(input|button|select)[^>]*id="([^"]+)"', res)
        if i not in ('moonHelpBtn', 'skyHelpBtn', 'tab-events', 'tab-sky', 'timeSlider', 'planetToggle', 'constellationToggle', 'starDisplay', 'eclipticToggle', 'milkyWayToggle', 'constellationNameToggle')]
if ctrl:
    problems.append(f'結果ゾーンに入力控件が漏れている: {ctrl}')

if html.count('<section') != html.count('</section>'):
    problems.append('section の開閉が一致しない')

if problems:
    print('\n'.join(problems)); sys.exit(1)
print(f'OK: HTML id {len(ids_html)}件、JS参照 {len(ids_js)}件、ゾーン漏れなし')
