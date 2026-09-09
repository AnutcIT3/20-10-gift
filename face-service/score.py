"""Cham diem tung model tren bo anh thu, doi chieu voi dap an that.

Dap an nam o bench/photos/<probe>/truth.json, moi anh la mot danh sach ten
theo thu tu khuon mat to dan nho. '*' nghia la nguoi ngoai thu vien (model phai
tu choi moi dung), '-' nghia la bo qua khong cham.

Hai diem so tach bach:
  1. DOAN DUNG TEN  - bo qua nguong, chi hoi model co goi dung ten khong.
     Do suc manh nhan dien thuan tuy.
  2. QUYET DINH DUNG - tinh ca nguong: nhan dung nguoi, va tu choi dung nguoi la.
     Day moi la diem so cua he thong that.

Chay:  .venv/Scripts/python.exe score.py
"""
import argparse
import json
import os

import numpy as np

import bench
import identify

OUTSIDER = '*'
SKIP = '-'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--photos', default=os.path.join(bench.ROOT, 'bench', 'photos'))
    ap.add_argument('--probe', default='test')
    ap.add_argument('--models', default=','.join(bench.MODELS))
    ap.add_argument('--margin', type=float, default=0.10)
    ap.add_argument('--gpu', action='store_true')
    ap.add_argument('--out', default=os.path.join(bench.ROOT, 'bench', 'results'))
    args = ap.parse_args()
    ctx_id = 0 if args.gpu else -1

    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    probe_dir = os.path.join(args.photos, args.probe)
    with open(os.path.join(probe_dir, 'truth.json'), encoding='utf-8') as f:
        truth = {k: v for k, v in json.load(f).items() if not k.startswith('_')}

    everyone = bench.scan_photos(args.photos)
    probe_files = everyone.pop(args.probe, [])
    print('Thu vien: {} nguoi / {} anh | anh thu: {}'.format(
        len(everyone), sum(len(v) for v in everyone.values()), len(probe_files)))

    models = {}
    for key in args.models.split(','):
        key = key.strip()
        if key in bench.MODELS:
            models[key], _ = bench.load_model(key, ctx_id)

    taus, fallback = identify.per_model_tau()
    galleries, _, _, _ = identify.build_gallery(
        None, face_align, everyone, ctx_id, models)

    providers = (['CUDAExecutionProvider', 'CPUExecutionProvider'] if ctx_id >= 0
                 else ['CPUExecutionProvider'])
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'],
                       providers=providers)
    app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    # questions: (nhan, dap_an, {model: (ten_doan, diem, chenh, nhan_hay_khong)})
    questions = []
    for path in probe_files:
        name = os.path.basename(path)
        want = truth.get(name)
        if not want:
            continue
        img = bench.imread_unicode(path)
        faces = app.get(img)
        faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                   reverse=True)
        for fi, face in enumerate(faces):
            answer = want[fi] if fi < len(want) else SKIP
            if answer == SKIP:
                continue
            x1, y1, x2, y2 = face.bbox
            crop = face_align.norm_crop(img, landmark=face.kps, image_size=112)
            per = {}
            for key, model in models.items():
                v = np.asarray(model.get_feat([crop]), dtype=np.float32)[0]
                v = v / np.linalg.norm(v)
                scored = sorted(((float(g @ v), p)
                                 for p, g in galleries[key].items()), reverse=True)
                gap = scored[0][0] - scored[1][0]
                tau = taus.get(key, fallback)
                per[key] = (scored[0][1], scored[0][0], gap,
                            scored[0][0] >= tau and gap >= args.margin)
            label = name if len(faces) == 1 else '{} (mặt #{})'.format(name, fi + 1)
            questions.append((label, answer, int(min(x2 - x1, y2 - y1)), per))

    named = [q for q in questions if q[1] != OUTSIDER]
    tally = {}
    for key in models:
        name_ok = sum(1 for q in named if q[3][key][0] == q[1])
        decision_ok = 0
        for q in questions:
            guess, _, _, accepted = q[3][key]
            if q[1] == OUTSIDER:
                decision_ok += 0 if accepted else 1
            else:
                decision_ok += 1 if (accepted and guess == q[1]) else 0
        tally[key] = (name_ok, decision_ok)

    lines = ['# Bảng điểm trên bộ ảnh thử', '']
    lines.append('Đáp án do chủ dự án cung cấp. Có **{} khuôn mặt được chấm**: '
                 '{} khuôn mặt của người trong thư viện và {} khuôn mặt người '
                 'ngoài mà model phải từ chối mới đúng.'.format(
                     len(questions), len(named), len(questions) - len(named)))
    lines.append('')
    lines.append('| Model | Đoán đúng tên | Quyết định đúng |')
    lines.append('|---|---|---|')
    for key in models:
        n_ok, d_ok = tally[key]
        lines.append('| {} | {}/{} ({:.0f}%) | **{}/{}** ({:.0f}%) |'.format(
            bench.MODELS[key]['label'], n_ok, len(named), 100 * n_ok / len(named),
            d_ok, len(questions), 100 * d_ok / len(questions)))
    lines.append('')
    lines.append('*Đoán đúng tên* bỏ qua ngưỡng, chỉ hỏi model có gọi đúng tên '
                 'không. *Quyết định đúng* tính cả ngưỡng: phải nhận đúng người, '
                 'và phải từ chối người ngoài.')
    lines.append('')

    lines.append('## Từng câu một')
    lines.append('')
    head = '| Ảnh | Mặt | Đáp án | ' + ' | '.join(
        bench.MODELS[k]['label'].split(' (')[0] for k in models) + ' |'
    lines.append(head)
    lines.append('|---' * (3 + len(models)) + '|')
    for label, answer, px, per in questions:
        cells = []
        for key in models:
            guess, score, gap, accepted = per[key]
            if answer == OUTSIDER:
                mark = 'đúng' if not accepted else 'SAI'
                cells.append('{} (từ chối, cao nhất {:.2f})'.format(mark, score)
                             if not accepted
                             else 'SAI nhận {} {:.2f}'.format(guess, score))
            elif guess != answer:
                cells.append('SAI: {} {:.2f}'.format(guess, score))
            elif accepted:
                cells.append('đúng {:.2f}'.format(score))
            else:
                cells.append('đúng tên nhưng từ chối {:.2f}'.format(score))
        want = 'người ngoài' if answer == OUTSIDER else answer
        lines.append('| {} | {} px | {} | {} |'.format(
            label, px, want, ' | '.join(cells)))
    lines.append('')

    print('\n' + '=' * 70)
    print('{:34s} {:>14s} {:>16s}'.format('MODEL', 'dung ten', 'quyet dinh dung'))
    for key in models:
        n_ok, d_ok = tally[key]
        print('{:34s} {:>10s} {:>16s}'.format(
            bench.MODELS[key]['label'],
            '{}/{}'.format(n_ok, len(named)),
            '{}/{}'.format(d_ok, len(questions))))
    print('=' * 70)
    for label, answer, px, per in questions:
        want = 'NGOAI' if answer == OUTSIDER else answer
        marks = []
        for key in models:
            guess, score, gap, accepted = per[key]
            if answer == OUTSIDER:
                marks.append('OK' if not accepted else 'SAI')
            elif guess != answer:
                marks.append('SAI')
            else:
                marks.append('OK' if accepted else 'thap')
        print('  {:24s} {:>4d}px  {:14s} {}'.format(
            label, px, want, ' '.join('{:5s}'.format(m) for m in marks)))

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'score.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('\nBao cao: ' + os.path.join(args.out, 'score.md'))


if __name__ == '__main__':
    main()
