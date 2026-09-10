"""Xuat anh mau tung muc kho de nhin bang mat, kiem chung vong B co that su kho.

Chay:  .venv/Scripts/python.exe make_samples.py [ten-thu-muc] [so-anh]
Ket qua: bench/results/samples/<nguoi>__<anh>__<muc>.jpg
"""
import os
import sys

import cv2

import bench
import bench_hard

person = sys.argv[1] if len(sys.argv) > 1 else None
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 2

photos_dir = os.path.join(bench.ROOT, 'bench', 'photos')
out_dir = os.path.join(bench.ROOT, 'bench', 'results', 'samples')
os.makedirs(out_dir, exist_ok=True)

people = bench.scan_photos(photos_dir)
if person:
    people = {k: v for k, v in people.items() if k == person}
people = {k: v[:limit] for k, v in list(people.items())[:3]}

photos, _ = bench.align_all(people, ctx_id=-1)
crops, labels, meta, _ = bench.choose_faces(photos, ctx_id=-1)

made = 0
for m in meta:
    src = bench.imread_unicode(os.path.join(bench.ROOT, m['file']))
    ctx, face_w = bench_hard.context_crop(src, m['bbox'])
    stem = os.path.splitext(os.path.basename(m['file']))[0]
    tiles = []
    for level in bench_hard.LEVELS:
        bad = bench_hard.degrade(ctx, face_w, level)
        name = '{}__{}__{}.jpg'.format(m['person'], stem, level['key'])
        cv2.imwrite(os.path.join(out_dir, name), bad)
        made += 1
        # dung chung chieu cao de ghep thanh mot dai so sanh
        h = 320
        scale = h / bad.shape[0]
        tiles.append(cv2.resize(bad, (int(bad.shape[1] * scale), h)))
    strip = cv2.hconcat(tiles)
    cv2.imwrite(os.path.join(out_dir, 'SOSANH__{}__{}.jpg'.format(m['person'], stem)),
                strip)
    made += 1

print('Da xuat {} anh vao {}'.format(made, out_dir))
print('File bat dau bang SOSANH__ la dai 4 muc xep canh nhau: goc | nhe | vua | nang')
