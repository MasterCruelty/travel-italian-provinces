#!/usr/bin/env python3
"""Genera data/game_data.json a partire dai confini ISTAT delle province.

Uso:
    pip install shapely
    python3 tools/build_data.py

Passi:
  1. scarica il GeoJSON delle province (openpolis/geojson-italy, dati ISTAT);
  2. calcola il grafo dei confini (province che si toccano);
  3. collega le isole maggiori alla terraferma con la traversata più breve;
  4. semplifica le geometrie come "copertura" (i confini condivisi restano
     identici tra province vicine) e le proietta in coordinate SVG;
  5. ricava per ogni provincia il punto per l'etichetta e il riquadro (zoom),
     e per ogni regione il contorno.
"""
import json
import math
import os
import sys
import urllib.request

import shapely
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import polylabel, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache', 'limits_IT_provinces.geojson')
OUT = os.path.join(ROOT, 'data', 'game_data.json')
SOURCE = ('https://raw.githubusercontent.com/openpolis/geojson-italy/'
          'ba3347df3a53352891109f8198c597a0273684c0/geojson/limits_IT_provinces.geojson')

TOUCH = 0.004        # gradi: tolleranza per considerare due province confinanti
SIMPLIFY = 0.012     # gradi: tolleranza di semplificazione della copertura
MIN_PART = 0.02      # scarta isolette sotto il 2% dell'area della parte principale
MAX_PARTS = 6

LAT0 = 42.0          # proiezione equirettangolare centrata sull'Italia
COS = math.cos(math.radians(LAT0))
SCALE = 100.0


def proj(lon, lat):
    return lon * COS * SCALE, -lat * SCALE


def fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def polys_of(geom):
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]


def to_path(polys):
    out = []
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            pts = [proj(x, y) for x, y in ring.coords[:-1]]
            out.append('M' + 'L'.join(f'{fmt(x)},{fmt(y)}' for x, y in pts) + 'Z')
    return ''.join(out)


def main_parts(geom):
    parts = sorted(polys_of(geom), key=lambda g: g.area, reverse=True)
    return [g for g in parts if g.area >= parts[0].area * MIN_PART][:MAX_PARTS]


def components(adj):
    seen, comps = set(), []
    for s in adj:
        if s in seen:
            continue
        stack, comp = [s], set()
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.add(x)
            stack.extend(adj[x] - seen)
        comps.append(comp)
    return sorted(comps, key=len, reverse=True)


def load_source():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        print('Scarico', SOURCE)
        urllib.request.urlretrieve(SOURCE, CACHE)
    with open(CACHE, encoding='utf-8') as f:
        return json.load(f)


def main():
    feats = load_source()['features']
    provs = []
    for f in feats:
        p = f['properties']
        provs.append({'sigla': p['prov_acr'], 'name': p['prov_name'],
                      'region': p['reg_name'], 'geom': shape(f['geometry']).buffer(0)})
    sig2geom = {p['sigla']: p['geom'] for p in provs}
    print('Province:', len(provs))

    # 1. adiacenze terrestri
    adj = {p['sigla']: set() for p in provs}
    for i, a in enumerate(provs):
        for b in provs[i + 1:]:
            if a['geom'].distance(b['geom']) <= TOUCH:
                adj[a['sigla']].add(b['sigla'])
                adj[b['sigla']].add(a['sigla'])

    # 2. traversate via mare per le isole
    comps = components(adj)
    mainland = comps[0]
    sea_edges = []
    for comp in comps[1:]:
        best = min(((sig2geom[a].distance(sig2geom[b]), a, b)
                    for a in comp for b in mainland), key=lambda t: t[0])
        _, a, b = best
        adj[a].add(b)
        adj[b].add(a)
        sea_edges.append([a, b])
        mainland |= comp
        print(f'Traversata: {a} <-> {b}')
    assert len(components(adj)) == 1, 'il grafo deve essere connesso'

    # 3. semplificazione come copertura (confini condivisi coerenti)
    simplified = shapely.coverage_simplify([p['geom'] for p in provs], SIMPLIFY)

    provinces, region_parts = {}, {}
    minx = miny = math.inf
    maxx = maxy = -math.inf
    for p, geom in zip(provs, simplified):
        parts = main_parts(geom)
        region_parts.setdefault(p['region'], []).extend(parts)
        label = polylabel(max(parts, key=lambda g: g.area), tolerance=0.005)
        lx, ly = proj(label.x, label.y)
        x0, y1_ = proj(*MultiPolygon(parts).bounds[:2])
        x1_, y0 = proj(*MultiPolygon(parts).bounds[2:])
        minx, miny, maxx, maxy = min(minx, x0), min(miny, y0), max(maxx, x1_), max(maxy, y1_)
        provinces[p['sigla']] = {
            'name': p['name'],
            'region': p['region'],
            'neighbors': sorted(adj[p['sigla']]),
            'lx': round(lx, 1), 'ly': round(ly, 1),
            'bbox': [round(v, 1) for v in (x0, y0, x1_, y1_)],
            'path': to_path(parts),
        }

    regions = {name: to_path(polys_of(unary_union(parts).buffer(0)))
               for name, parts in sorted(region_parts.items())}

    pad = 4
    data = {
        'viewBox': [round(minx - pad, 1), round(miny - pad, 1),
                    round(maxx - minx + 2 * pad, 1), round(maxy - miny + 2 * pad, 1)],
        'sea_edges': sea_edges,
        'regions': regions,
        'provinces': provinces,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Scritto {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1024:.0f} KB)')


if __name__ == '__main__':
    sys.exit(main())
