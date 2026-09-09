"""Vong B: ho so dang ky la anh dep, anh can nhan dien la anh da lam xau di.

Vong A (bench.py) do anh dep voi anh dep nen model nao cung gan nhu tuyet doi,
khong phan dinh duoc. Vong nay mo phong dung tinh huong that: hom 20/10 cac ban
dung dien thoai trong phong buoi toi, con ho so trong may van la anh ky yeu.

Cach lam
  1. Dung chung buoc phat hien + chon mat cua bench.py de biet mat nam o dau.
  2. Cat mot vung quanh mat roi HA CHAT LUONG vung do theo tung muc:
     thu nho mat -> nhoe chuyen dong -> ha sang -> them nhieu -> nen JPEG.
  3. Phat hien lai tren anh da lam xau (that su, khong an gian), roi can chinh.
  4. Ho so lay tu anh SACH cua nhung tam KHAC cua chinh nguoi do (bo ra mot anh),
     nen khong co chuyen model chi viec nhan ra ban sao cua chinh tam anh do.

Chay:  .venv/Scripts/python.exe bench_hard.py
"""
import argparse
import os
import time
from collections import defaultdict

import cv2
import numpy as np

import bench

RNG = np.random.default_rng(20102026)

# Moi muc mo phong mot hoan canh chup. face_px la be ngang khuon mat con lai
# sau khi thu nho, tuc "dung xa may bao nhieu".
LEVELS = [
    {'key': 'goc', 'name': 'Ảnh gốc (đối chứng)',
     'face_px': None, 'gain': 1.0, 'noise': 0, 'jpeg': 95, 'blur': 0},
    {'key': 'nhe', 'name': 'Nhẹ — trong nhà đủ sáng',
     'face_px': 110, 'gain': 0.80, 'noise': 4, 'jpeg': 65, 'blur': 0},
    {'key': 'vua', 'name': 'Vừa — đèn phòng buổi tối',
     'face_px': 85, 'gain': 0.55, 'noise': 8, 'jpeg': 45, 'blur': 3},
    {'key': 'nang', 'name': 'Nặng — thiếu sáng, tay rung',
     'face_px': 65, 'gain': 0.40, 'noise': 12, 'jpeg': 35, 'blur': 5},
]


def context_crop(img, bbox, factor=3.2):
    """Cat mot vung rong quanh mat de anh dau vao van giong mot khung hinh that."""
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    half = max(x2 - x1, y2 - y1) * factor / 2.0
    X1, Y1 = int(max(0, cx - half)), int(max(0, cy - half))
    X2, Y2 = int(min(img.shape[1], cx + half)), int(min(img.shape[0], cy + half))
    return img[Y1:Y2, X1:X2], (x2 - x1)


def degrade(crop, face_w, level):
    out = crop
    # 1. Thu nho: mat con lai bao nhieu pixel. Day la yeu to an mon nhieu nhat.
    if level['face_px'] and face_w > level['face_px']:
        scale = level['face_px'] / float(face_w)
        h, w = out.shape[:2]
        nh, nw = max(24, int(h * scale)), max(24, int(w * scale))
        out = cv2.resize(out, (nw, nh), interpolation=cv2.INTER_AREA)
    # 2. Nhoe chuyen dong ngang (tay rung luc bam)
    k = level['blur']
    if k >= 3:
        kernel = np.zeros((k, k), np.float32)
        kernel[k // 2, :] = 1.0 / k
        out = cv2.filter2D(out, -1, kernel)
    # 3. Ha sang: phong toi
    if level['gain'] != 1.0:
        out = np.clip(out.astype(np.float32) * level['gain'], 0, 255).astype(np.uint8)
    # 4. Nhieu cam bien: ISO cao khi thieu sang
    if level['noise'] > 0:
        noise = RNG.normal(0, level['noise'], out.shape).astype(np.float32)
        out = np.clip(out.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    # 5. Nen JPEG nhu khung hinh gui qua mang
    ok, buf = cv2.imencode('.jpg', out, [int(cv2.IMWRITE_JPEG_QUALITY), level['jpeg']])
    if ok:
        out = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    return out


def evaluate_cross(clean_emb, probe_emb, labels, probe_ok):
    """Ho so = anh SACH cua cac tam khac; anh can nhan = anh da lam xau.

    Nguoi la do bang cach bo han mot nguoi khoi thu vien roi cho anh xau cua ho
    di nhan dien - dung tinh huong nguoi ngoai lop bam thu.
    """
    people = sorted(set(labels))
    idx_of = {p: [i for i, l in enumerate(labels) if l == p] for p in people}

    def gal(idxs):
        m = clean_emb[idxs].mean(axis=0)
        return m / np.linalg.norm(m)

    rank1 = 0
    n = 0
    genuine, margins = [], []
    confusions = defaultdict(int)
    for person in people:
        for i in idx_of[person]:
            if not probe_ok[i]:
                continue
            rest = [j for j in idx_of[person] if j != i]
            if not rest:
                continue
            scores = {o: float(gal(rest if o == person else idx_of[o]) @ probe_emb[i])
                      for o in people}
            ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
            n += 1
            genuine.append(scores[person])
            margins.append(ranked[0][1] - ranked[1][1] if len(ranked) > 1 else 1.0)
            if ranked[0][0] == person:
                rank1 += 1
            else:
                confusions[(person, ranked[0][0])] += 1

    impostor = []
    for held in people:
        others = [o for o in people if o != held]
        if not others:
            continue
        gals = [gal(idx_of[o]) for o in others]
        for i in idx_of[held]:
            if not probe_ok[i]:
                continue
            impostor.append(max(float(g @ probe_emb[i]) for g in gals))

    genuine = np.array(genuine)
    impostor = np.array(impostor)
    tau = float(impostor.max()) if len(impostor) else 0.0
    ok_at_tau = int(((genuine > tau)).sum()) if len(genuine) else 0
    return {
        'probes': n,
        'rank1': round(100 * rank1 / n, 1) if n else 0.0,
        'tau_0fa': round(tau, 4),
        'tar_at_0fa': round(100 * ok_at_tau / n, 1) if n else 0.0,
        'genuine_mean': round(float(genuine.mean()), 4) if len(genuine) else 0,
        'impostor_max': round(float(impostor.max()), 4) if len(impostor) else 0,
        'gap': round(float(genuine.mean() - impostor.mean()), 4) if len(genuine) else 0,
        'margin_median': round(float(np.median(margins)), 4) if margins else 0,
        'confusions': sorted([[a + ' -> ' + b, c] for (a, b), c in confusions.items()],
                             key=lambda x: -x[1])[:5],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--photos', default=os.path.join(bench.ROOT, 'bench', 'photos'))
    ap.add_argument('--out', default=os.path.join(bench.ROOT, 'bench', 'results'))
    ap.add_argument('--models', default=','.join(bench.MODELS))
    ap.add_argument('--gpu', action='store_true')
    args = ap.parse_args()
    ctx_id = 0 if args.gpu else -1

    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    people = bench.scan_photos(args.photos)
    if not people:
        print('Chua co anh trong ' + args.photos)
        raise SystemExit(1)
    print('{} nguoi / {} anh'.format(len(people), sum(len(v) for v in people.values())))

    print('\n[1/3] Phat hien + chon dung mat tren anh sach...')
    t0 = time.perf_counter()
    photos, skipped = bench.align_all(people, ctx_id=ctx_id)
    clean_crops, labels, meta, repicked = bench.choose_faces(photos, ctx_id=ctx_id)
    print('  {} mat trong {:.1f}s, bo qua {} anh, chon lai {} anh'.format(
        len(clean_crops), time.perf_counter() - t0, len(skipped), len(repicked)))

    providers = (['CUDAExecutionProvider', 'CPUExecutionProvider'] if ctx_id >= 0
                 else ['CPUExecutionProvider'])
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'],
                       providers=providers)
    app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    print('\n[2/3] Sinh anh xau va phat hien lai...')
    probes = {}
    for level in LEVELS:
        t0 = time.perf_counter()
        crops, ok = [], []
        blank = np.zeros((112, 112, 3), np.uint8)
        for m in meta:
            src = bench.imread_unicode(os.path.join(bench.ROOT, m['file']))
            ctx, face_w = context_crop(src, m['bbox'])
            bad = degrade(ctx, face_w, level)
            faces = app.get(bad)
            if not faces:
                crops.append(blank)
                ok.append(False)
                continue
            faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                       reverse=True)
            crops.append(face_align.norm_crop(bad, landmark=faces[0].kps,
                                              image_size=112))
            ok.append(True)
        probes[level['key']] = (crops, ok)
        print('  {:22s} bat duoc mat {}/{}  ({:.1f}s)'.format(
            level['name'], sum(ok), len(ok), time.perf_counter() - t0))

    print('\n[3/3] Cham diem tung model...')
    rows = []
    for key in args.models.split(','):
        key = key.strip()
        if key not in bench.MODELS:
            continue
        label = bench.MODELS[key]['label']
        try:
            model, size_mb = bench.load_model(key, ctx_id)
        except Exception as exc:
            print('  ! {} khong nap duoc: {}'.format(label, exc))
            continue
        clean_emb = bench.embed_all(model, clean_crops)
        print('\n  {}'.format(label))
        for level in LEVELS:
            crops, ok = probes[level['key']]
            probe_emb = bench.embed_all(model, crops)
            r = evaluate_cross(clean_emb, probe_emb, labels, ok)
            r.update(model=key, label=label, level=level['key'],
                     level_name=level['name'], size_mb=size_mb,
                     detected=sum(ok), total=len(ok))
            rows.append(r)
            print('    {:22s} bat mat {:3d}/{:3d} | dung top-1 {:5.1f}% | '
                  'dung khi 0 nham {:5.1f}% | tau {:.3f}'.format(
                      level['name'], r['detected'], r['total'],
                      r['rank1'], r['tar_at_0fa'], r['tau_0fa']))

    write_report(args.out, rows, people, meta, skipped)
    print('\nBao cao: ' + os.path.join(args.out, 'report-hard.md'))


def write_report(out_dir, rows, people, meta, skipped):
    os.makedirs(out_dir, exist_ok=True)
    cols = ['model', 'level', 'detected', 'total', 'probes', 'rank1', 'tar_at_0fa',
            'tau_0fa', 'genuine_mean', 'impostor_max', 'gap', 'margin_median', 'size_mb']
    with open(os.path.join(out_dir, 'results-hard.csv'), 'w', encoding='utf-8') as f:
        f.write(','.join(cols) + '\n')
        for r in rows:
            f.write(','.join(str(r.get(c, '')) for c in cols) + '\n')

    by_model = defaultdict(dict)
    for r in rows:
        by_model[r['label']][r['level']] = r
    levels = [lv for lv in LEVELS if any(lv['key'] in v for v in by_model.values())]

    lines = ['# Vòng B — nhận diện từ ảnh xấu', '']
    lines.append('Hồ sơ đăng ký là ảnh đẹp. Ảnh cần nhận diện là chính bộ ảnh đó '
                 'nhưng đã bị làm xấu đi để giống khung hình camera điện thoại. '
                 'Hồ sơ của mỗi người luôn loại tấm đang đem đi nhận, nên không có '
                 'chuyện model chỉ việc nhận ra bản sao của chính tấm ảnh ấy.')
    lines.append('')
    lines.append('Dữ liệu: **{}** ảnh của **{}** người.'.format(len(meta), len(people)))
    lines.append('')

    lines.append('## Bốn mức khó')
    lines.append('')
    lines.append('| Mức | Mặt còn (px) | Độ sáng | Nhiễu | Nhoè | Chất lượng JPEG |')
    lines.append('|---|---|---|---|---|---|')
    for lv in LEVELS:
        lines.append('| {} | {} | {} | {} | {} | {} |'.format(
            lv['name'], lv['face_px'] or 'giữ nguyên',
            '{:.0f}%'.format(lv['gain'] * 100), lv['noise'] or 'không',
            '{} px'.format(lv['blur']) if lv['blur'] else 'không', lv['jpeg']))
    lines.append('')

    lines.append('## Nhận đúng khi không một người lạ nào lọt qua')
    lines.append('')
    header = '| Model | ' + ' | '.join(lv['name'] for lv in levels) + ' |'
    lines.append(header)
    lines.append('|---' * (len(levels) + 1) + '|')
    for label, per in by_model.items():
        cells = []
        for lv in levels:
            r = per.get(lv['key'])
            cells.append('**{}%**'.format(r['tar_at_0fa']) if r else '—')
        lines.append('| {} | {} |'.format(label, ' | '.join(cells)))
    lines.append('')
    lines.append('Cổng trong FACE_PLAN.md là **≥ 90%**. Mức đáng tin để quyết định '
                 'là cột "Vừa", vì đó là điều kiện phổ biến nhất hôm 20/10.')
    lines.append('')

    lines.append('## Xếp đúng người vào vị trí số 1')
    lines.append('')
    lines.append(header)
    lines.append('|---' * (len(levels) + 1) + '|')
    for label, per in by_model.items():
        cells = []
        for lv in levels:
            r = per.get(lv['key'])
            cells.append('{}%'.format(r['rank1']) if r else '—')
        lines.append('| {} | {} |'.format(label, ' | '.join(cells)))
    lines.append('')

    lines.append('## Tỉ lệ bắt được mặt trên ảnh xấu')
    lines.append('')
    lines.append('Khung hình không tìm thấy mặt thì ứng dụng thật sẽ không gửi lên '
                 'máy chủ, người dùng chỉ chờ thêm một nhịp. Con số này đo độ khó '
                 'của ảnh, không phải lỗi của model nhận diện.')
    lines.append('')
    first = next(iter(by_model.values()), {})
    for lv in levels:
        r = first.get(lv['key'])
        if r:
            lines.append('- {}: {}/{} ảnh'.format(lv['name'], r['detected'], r['total']))
    lines.append('')

    lines.append('## Cách biệt điểm thật và điểm người lạ')
    lines.append('')
    lines.append('Càng lớn thì ngưỡng càng dễ đặt an toàn.')
    lines.append('')
    lines.append(header)
    lines.append('|---' * (len(levels) + 1) + '|')
    for label, per in by_model.items():
        cells = []
        for lv in levels:
            r = per.get(lv['key'])
            cells.append('{}'.format(r['gap']) if r else '—')
        lines.append('| {} | {} |'.format(label, ' | '.join(cells)))
    lines.append('')

    hard = [lv for lv in levels if lv['key'] == 'vua'] or levels[-1:]
    if hard:
        k = hard[0]['key']
        lines.append('## Cặp dễ nhầm ở mức "{}"'.format(hard[0]['name']))
        lines.append('')
        any_c = False
        for label, per in by_model.items():
            r = per.get(k)
            if r and r['confusions']:
                any_c = True
                lines.append('- **{}**: {}'.format(label, ', '.join(
                    '{} ({} lần)'.format(a, b) for a, b in r['confusions'])))
        if not any_c:
            lines.append('- Không có ảnh nào bị xếp nhầm người.')
        lines.append('')

    lines.append('## Điều vòng này vẫn chưa trả lời')
    lines.append('')
    lines.append('Ảnh xấu ở đây là ảnh đẹp bị làm hỏng bằng phần mềm, không phải '
                 'ảnh chụp thật trong phòng tối. Ảnh thật còn khác ở tư thế, biểu '
                 'cảm, kiểu tóc và ngày tháng. Vòng C với ảnh điện thoại thật vẫn '
                 'là bước bắt buộc trước khi chốt.')
    lines.append('')

    with open(os.path.join(out_dir, 'report-hard.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


if __name__ == '__main__':
    main()
