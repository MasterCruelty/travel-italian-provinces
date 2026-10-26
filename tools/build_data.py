#!/usr/bin/env python3
"""Genera i dati delle mappe (data/<mappa>.json) dai confini ISTAT.

Uso:
    pip install shapely
    python3 tools/build_data.py            # tutte le mappe
    python3 tools/build_data.py milano     # solo alcune

Per ogni mappa:
  1. scarica i GeoJSON dei confini (openpolis/geojson-italy, dati ISTAT);
  2. calcola il grafo dei confini (aree che si toccano);
  3. collega le parti staccate (isole, exclavi) all'area più vicina, come un
     traghetto o un collegamento stradale;
  4. semplifica le geometrie come "copertura" (i confini condivisi restano
     identici tra aree vicine) e le proietta in coordinate SVG;
  5. ricava per ogni area il punto per l'etichetta e il riquadro (zoom),
     e per ogni gruppo (regione o provincia) il contorno.
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
CACHE = os.path.join(ROOT, 'tools', '.cache')
SOURCE = ('https://raw.githubusercontent.com/openpolis/geojson-italy/'
          'ba3347df3a53352891109f8198c597a0273684c0/geojson/')

MAPS = {
    'italia': {
        'sources': ['limits_IT_provinces.geojson'],
        'id': 'prov_acr', 'name': 'prov_name', 'group': 'reg_name',
        'touch': 0.004,       # gradi: tolleranza per considerare due aree confinanti
        'simplify': 0.012,    # gradi: tolleranza di semplificazione della copertura
        'label_tol': 0.005,
        'lat0': 42.0, 'scale': 100.0,
        'link_icon': '⛴️',
    },
    'milano': {
        'sources': ['limits_P_15_municipalities.geojson',
                    'limits_P_108_municipalities.geojson'],
        'id': 'com_istat_code', 'name': 'name', 'group': 'prov_name',
        'touch': 0.0002,
        'simplify': 0.0015,
        'label_tol': 0.0005,
        'lat0': 45.5, 'scale': 1000.0,
        'link_icon': '🛣️',
    },
}

MIN_PART = 0.02      # scarta isolette sotto il 2% dell'area della parte principale
MAX_PARTS = 6


def fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def polys_of(geom):
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]


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


def load_source(filename):
    path = os.path.join(CACHE, filename)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        print('Scarico', filename)
        urllib.request.urlretrieve(SOURCE + filename, path)
    with open(path, encoding='utf-8') as f:
        return json.load(f)['features']


def build(key, cfg):
    cos = math.cos(math.radians(cfg['lat0']))
    scale = cfg['scale']

    def proj(lon, lat):
        return lon * cos * scale, -lat * scale

    def to_path(polys):
        out = []
        for poly in polys:
            for ring in [poly.exterior, *poly.interiors]:
                pts = [proj(x, y) for x, y in ring.coords[:-1]]
                out.append('M' + 'L'.join(f'{fmt(x)},{fmt(y)}' for x, y in pts) + 'Z')
        return ''.join(out)

    items = []
    for filename in cfg['sources']:
        for f in load_source(filename):
            p = f['properties']
            items.append({'id': p[cfg['id']], 'name': p[cfg['name']],
                          'group': p[cfg['group']], 'geom': shape(f['geometry']).buffer(0)})
    id2geom = {a['id']: a['geom'] for a in items}
    assert len(id2geom) == len(items), 'identificativi duplicati'
    print(f'[{key}] aree:', len(items))

    # 1. adiacenze
    adj = {a['id']: set() for a in items}
    pad = cfg['touch']
    for i, a in enumerate(items):
        ba = a['geom'].bounds
        for b in items[i + 1:]:
            bb = b['geom'].bounds
            if ba[0] > bb[2] + pad or bb[0] > ba[2] + pad or ba[1] > bb[3] + pad or bb[1] > ba[3] + pad:
                continue
            if a['geom'].distance(b['geom']) <= cfg['touch']:
                adj[a['id']].add(b['id'])
                adj[b['id']].add(a['id'])

    # 2. collegamenti per le parti staccate
    comps = components(adj)
    mainland = comps[0]
    links = []
    for comp in comps[1:]:
        _, a, b = min(((id2geom[a].distance(id2geom[b]), a, b)
                       for a in comp for b in mainland), key=lambda t: t[0])
        adj[a].add(b)
        adj[b].add(a)
        links.append([a, b, cfg['link_icon']])
        mainland |= comp
        names = {x['id']: x['name'] for x in items}
        print(f'[{key}] collegamento: {names[a]} <-> {names[b]}')
    assert len(components(adj)) == 1, 'il grafo deve essere connesso'

    # 3. semplificazione come copertura
    simplified = shapely.coverage_simplify([a['geom'] for a in items], cfg['simplify'])

    areas, group_parts = {}, {}
    minx = miny = math.inf
    maxx = maxy = -math.inf
    for a, geom in zip(items, simplified):
        parts = main_parts(geom)
        group_parts.setdefault(a['group'], []).extend(parts)
        label = polylabel(max(parts, key=lambda g: g.area), tolerance=cfg['label_tol'])
        lx, ly = proj(label.x, label.y)
        x0, y1 = proj(*MultiPolygon(parts).bounds[:2])
        x1, y0 = proj(*MultiPolygon(parts).bounds[2:])
        minx, miny, maxx, maxy = min(minx, x0), min(miny, y0), max(maxx, x1), max(maxy, y1)
        areas[a['id']] = {
            'name': a['name'],
            'group': a['group'],
            'neighbors': sorted(adj[a['id']]),
            'lx': round(lx, 1), 'ly': round(ly, 1),
            'bbox': [round(v, 1) for v in (x0, y0, x1, y1)],
            'path': to_path(parts),
        }

    groups = {name: to_path(polys_of(unary_union(parts).buffer(0)))
              for name, parts in sorted(group_parts.items())}

    margin = 4
    data = {
        'viewBox': [round(minx - margin, 1), round(miny - margin, 1),
                    round(maxx - minx + 2 * margin, 1), round(maxy - miny + 2 * margin, 1)],
        'links': links,
        'groups': groups,
        'areas': areas,
    }
    out = os.path.join(ROOT, 'data', f'{key}.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'[{key}] scritto {os.path.relpath(out, ROOT)} ({os.path.getsize(out) / 1024:.0f} KB)')


def main(argv):
    keys = argv or list(MAPS)
    unknown = [k for k in keys if k not in MAPS]
    if unknown:
        print('Mappe sconosciute:', ', '.join(unknown), '- disponibili:', ', '.join(MAPS))
        return 1
    for key in keys:
        build(key, MAPS[key])
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
