"""Cho tung model doan xem anh la ai, roi so ket qua giua cac model.

Thu vien doi chieu: moi thu muc trong bench/photos/ TRU thu muc --exclude.
Anh can doan:      moi anh trong bench/photos/<--probe>/

Chay:  .venv/Scripts/python.exe identify.py
       .venv/Scripts/python.exe identify.py --probe test --tau 0.45 --margin 0.10
"""
import argparse
import os
import time

import numpy as np

import bench

TOP_N = 3


SAFETY = 0.04   # cong them tren nguong cao nhat do duoc o vong B


def per_model_tau(fallback=0.45):
    """Moi model co thang diem rieng nen phai co nguong rieng.

    LVFace tra diem thap hon ArcFace o cung mot cap mat, dung chung mot nguong
    la ep no phai tu choi. Lay nguong cao nhat ma vong B do duoc cho tung model
    (diem cao nhat mot nguoi la dat toi) roi cong bien an toan.
    """
    path = os.path.join(bench.ROOT, 'bench', 'results', 'results-hard.csv')
    taus = {}
    if os.path.exists(path):
        import csv
        with open(path, encoding='utf-8') as f:
            for row in csv.DictReader(f):
                key, val = row['model'], float(row['tau_0fa'])
                taus[key] = max(taus.get(key, 0.0), val)
        taus = {k: round(v + SAFETY, 3) for k, v in taus.items()}
    return taus, fallback


def build_gallery(app, face_align, people, ctx_id, models):
    """Mot bo anh da cat dung chung cho moi model, dung nhu bench.py."""
    photos, skipped = bench.align_all(people, ctx_id=ctx_id)
    crops, labels, meta, repicked = bench.choose_faces(photos, ctx_id=ctx_id)
    galleries = {}
    for key, model in models.items():
        emb = bench.embed_all(model, crops)
        per = {}
        for person in sorted(set(labels)):
            idx = [i for i, l in enumerate(labels) if l == person]
            m = emb[idx].mean(axis=0)
            per[person] = m / np.linalg.norm(m)
        galleries[key] = per
    return galleries, labels, skipped, repicked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--photos', default=os.path.join(bench.ROOT, 'bench', 'photos'))
    ap.add_argument('--probe', default='test', help='ten thu muc chua anh can doan')
    ap.add_argument('--models', default=','.join(bench.MODELS))
    ap.add_argument('--tau', type=float, default=None,
                    help='mot nguong chung; bo trong thi tu do tu vong B')
    ap.add_argument('--margin', type=float, default=0.10)
    ap.add_argument('--gpu', action='store_true')
    ap.add_argument('--out', default=os.path.join(bench.ROOT, 'bench', 'results'))
    args = ap.parse_args()
    ctx_id = 0 if args.gpu else -1

    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    everyone = bench.scan_photos(args.photos)
    probe_files = everyone.pop(args.probe, [])
    if not probe_files:
        print('Khong thay anh nao trong ' + os.path.join(args.photos, args.probe))
        raise SystemExit(1)
    print('Thu vien doi chieu: {} nguoi / {} anh'.format(
        len(everyone), sum(len(v) for v in everyone.values())))
    print('Anh can doan: {} tam trong thu muc "{}"'.format(
        len(probe_files), args.probe))

    models = {}
    for key in args.models.split(','):
        key = key.strip()
        if key not in bench.MODELS:
            continue
        try:
            models[key], _ = bench.load_model(key, ctx_id)
        except Exception as exc:
            print('  ! bo qua {}: {}'.format(key, exc))
    if not models:
        raise SystemExit('Khong nap duoc model nao')

    taus, fallback = per_model_tau()
    if args.tau is not None:
        taus = {k: args.tau for k in models}
        fallback = args.tau
    print('\nNguong rieng tung model (do o vong B, cong bien {}):'.format(SAFETY))
    for k in models:
        print('  {:14s} tau = {}'.format(k, taus.get(k, fallback)))

    print('\nDung ho so cho tung nguoi...')
    t0 = time.perf_counter()
    galleries, labels, skipped, repicked = build_gallery(
        None, face_align, everyone, ctx_id, models)
    print('  xong trong {:.1f}s'.format(time.perf_counter() - t0))

    providers = (['CUDAExecutionProvider', 'CPUExecutionProvider'] if ctx_id >= 0
                 else ['CPUExecutionProvider'])
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'],
                       providers=providers)
    app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    lines = ['# Nhận diện bộ ảnh thử', '']
    lines.append('Thư viện đối chiếu: **{} người**, {} ảnh. Mỗi model dùng ngưỡng '
                 'riêng của nó, đo từ vòng B rồi cộng biên an toàn {}, vì thang '
                 'điểm của các model không giống nhau. Người đứng nhất còn phải '
                 'hơn người đứng nhì ít nhất {}.'.format(
                     len(everyone), sum(len(v) for v in everyone.values()),
                     SAFETY, args.margin))
    lines.append('')
    lines.append('| Model | Ngưỡng dùng |')
    lines.append('|---|---|')
    for k in models:
        lines.append('| {} | {} |'.format(bench.MODELS[k]['label'],
                                          taus.get(k, fallback)))
    lines.append('')

    print('\n' + '=' * 78)
    summary = []
    for path in probe_files:
        name = os.path.basename(path)
        img = bench.imread_unicode(path)
        if img is None:
            print('\n{}: khong doc duoc file'.format(name))
            lines.append('## {}\n\nKhông đọc được file.\n'.format(name))
            continue
        faces = app.get(img)
        print('\n{}  ({}x{}, tim thay {} mat)'.format(
            name, img.shape[1], img.shape[0], len(faces)))
        lines.append('## {}'.format(name))
        lines.append('')
        lines.append('Ảnh {}x{}, tìm thấy {} khuôn mặt.'.format(
            img.shape[1], img.shape[0], len(faces)))
        lines.append('')
        if not faces:
            print('  KHONG TIM THAY MAT')
            lines.append('**Không tìm thấy khuôn mặt nào.**')
            lines.append('')
            summary.append((name, 'khong co mat', {}))
            continue

        faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                   reverse=True)
        for fi, face in enumerate(faces):
            x1, y1, x2, y2 = face.bbox
            px = int(min(x2 - x1, y2 - y1))
            crop = face_align.norm_crop(img, landmark=face.kps, image_size=112)
            if len(faces) > 1:
                print('  -- mat #{} ({} px)'.format(fi + 1, px))
                lines.append('### Khuôn mặt #{} ({} px)'.format(fi + 1, px))
                lines.append('')
            lines.append('| Model | Đoán là | Điểm | Ngưỡng | Người nhì | Chênh '
                         '| Kết luận |')
            lines.append('|---|---|---|---|---|---|---|')
            verdicts = {}
            for key, model in models.items():
                v = np.asarray(model.get_feat([crop]), dtype=np.float32)[0]
                v = v / np.linalg.norm(v)
                scored = sorted(((float(g @ v), person)
                                 for person, g in galleries[key].items()),
                                reverse=True)
                top = scored[:TOP_N]
                gap = top[0][0] - top[1][0] if len(top) > 1 else 1.0
                tau = taus.get(key, fallback)
                ok = top[0][0] >= tau and gap >= args.margin
                verdicts[key] = (top[0][1] if ok else None, top[0][0], gap,
                                 top[0][1])
                rest = ', '.join('{} {:.3f}'.format(p, s) for s, p in top[1:])
                print('    {:14s} {:14s} {:.3f} (tau {:.2f}) (nhi: {})  {}'.format(
                    key, top[0][1], top[0][0], tau, rest,
                    'NHAN' if ok else 'tu choi'))
                lines.append('| {} | {} | {:.3f} | {:.2f} | {} {:.3f} | {:.3f} '
                             '| {} |'.format(
                                 bench.MODELS[key]['label'], top[0][1], top[0][0],
                                 tau, top[1][1], top[1][0], gap,
                                 '**nhận**' if ok else 'từ chối'))
            lines.append('')
            guesses = {v[3] for v in verdicts.values()}
            accepted = sum(1 for v in verdicts.values() if v[0])
            n = len(models)
            if len(guesses) == 1:
                who = guesses.pop()
                verdict = '{}  ({}/{} model đủ tự tin)'.format(who, accepted, n)
                if accepted == n:
                    lines.append('Cả {} model đều đoán **{}** và đều đủ tự tin để '
                                 'nhận.'.format(n, who))
                elif accepted:
                    lines.append('Cả {} model đều đoán **{}**, nhưng chỉ {} model '
                                 'vượt được ngưỡng của chính nó.'.format(
                                     n, who, accepted))
                else:
                    verdict = 'từ chối  (đều nghiêng về {})'.format(who)
                    lines.append('Cả {} model đều nghiêng về **{}** nhưng điểm quá '
                                 'thấp nên đều từ chối. Nếu đúng là {} thì đây là '
                                 'ảnh khó; nếu là người ngoài thư viện thì từ chối '
                                 'mới là đúng.'.format(n, who, who))
            else:
                shown = ', '.join(sorted(guesses))
                verdict = 'không thống nhất tên: ' + shown
                lines.append('**Các model đoán tên khác nhau:** {}. Thường là dấu '
                             'hiệu khuôn mặt quá nhỏ, hoặc không có ai trong thư '
                             'viện thật sự khớp.'.format(shown))
            lines.append('')
            print('    => {}'.format(verdict))
            if fi == 0:
                summary.append((name, verdict, verdicts))

    print('\n' + '=' * 78)
    print('TOM TAT')
    for name, verdict, _ in summary:
        print('  {:14s} {}'.format(name, verdict))

    lines.append('## Tóm tắt')
    lines.append('')
    lines.append('| Ảnh | Kết quả |')
    lines.append('|---|---|')
    for name, verdict, _ in summary:
        lines.append('| {} | {} |'.format(name, verdict))
    lines.append('')
    lines.append('Từ chối là hành vi ĐÚNG nếu người trong ảnh không có trong thư '
                 'viện. Hãy đối chiếu với sự thật rồi báo lại tấm nào sai.')
    lines.append('')

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'identify.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('\nBao cao: ' + os.path.join(args.out, 'identify.md'))


if __name__ == '__main__':
    main()
