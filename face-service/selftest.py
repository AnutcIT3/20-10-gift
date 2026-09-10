"""Kiem tra nhanh service dang chay: /health, roi gui vai anh that vao /embed.

Chay:  .venv/Scripts/python.exe selftest.py [http://127.0.0.1:5002]
Thoat ma khac 0 neu co buoc that bai.
"""
import os
import sys
import time

import httpx
import numpy as np

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5002'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, 'bench', 'photos')


def pick_photos(n=3):
    out = []
    for person in sorted(os.listdir(PHOTOS)):
        d = os.path.join(PHOTOS, person)
        if not os.path.isdir(d) or person == 'test':
            continue
        for f in sorted(os.listdir(d)):
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                out.append((person, os.path.join(d, f)))
                break
        if len(out) >= n:
            break
    return out


def main():
    fails = 0
    with httpx.Client(base_url=BASE, timeout=60) as c:
        r = c.get('/health')
        print('GET /health ->', r.status_code, r.json())
        fails += r.status_code != 200

        # anh rac phai bi tu choi 400, khong duoc lam sap service
        r = c.post('/embed', files={'image': ('x.jpg', b'khong phai anh', 'image/jpeg')})
        print('POST /embed (rac) ->', r.status_code, r.json())
        fails += r.status_code != 400

        vecs = {}
        for person, path in pick_photos():
            with open(path, 'rb') as f:
                data = f.read()
            t0 = time.perf_counter()
            r = c.post('/embed', files={'image': (os.path.basename(path), data, 'image/jpeg')})
            ms = 1000 * (time.perf_counter() - t0)
            body = r.json()
            faces = body.get('faces', [])
            ok = r.status_code == 200 and faces and len(faces[0]['embedding']) == 512
            fails += not ok
            print('POST /embed {:14s} {:5d} KB -> {} | {} mat, mat #1 {} px, sang {}, '
                  'vector {} chieu, server {} ms, tong {:.0f} ms'.format(
                      person, len(data) // 1024, r.status_code, len(faces),
                      faces[0]['face_px'] if faces else '-',
                      faces[0]['brightness'] if faces else '-',
                      len(faces[0]['embedding']) if faces else 0,
                      body.get('elapsed_ms'), ms))
            if ok:
                vecs[person] = np.array(faces[0]['embedding'], dtype=np.float32)

        # vector phai chuan hoa (do dai 1) va nguoi khac nhau phai it giong nhau
        names = list(vecs)
        for n in names:
            norm = float(np.linalg.norm(vecs[n]))
            if abs(norm - 1.0) > 1e-3:
                print('! vector cua', n, 'khong chuan hoa:', norm)
                fails += 1
        if len(names) >= 2:
            s = float(vecs[names[0]] @ vecs[names[1]])
            print('cosine {} vs {} = {:.3f} (nguoi khac nhau, ky vong < 0.35)'.format(
                names[0], names[1], s))
            fails += s >= 0.35

        r = c.get('/health')
        print('GET /health sau khi test ->', r.json().get('requests'), 'request,',
              r.json().get('avg_ms'), 'ms trung binh')

    print('\nKET QUA:', 'OK' if not fails else '{} buoc that bai'.format(fails))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
