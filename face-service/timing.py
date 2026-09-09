"""Do thoi gian tung chang, tu luc co anh den luc biet ten.

Tach ro tung buoc vi moi buoc anh huong khac nhau den trai nghiem that:
  - nap model     : chi ton mot lan luc khoi dong service
  - giai ma anh   : phu thuoc kich thuoc khung hinh gui len
  - phat hien mat : chang ton nhat, dung chung cho moi model
  - can chinh     : khong dang ke
  - trich dac trung: khac nhau giua cac model, day la cho de so sanh
  - so khop       : voi vai chuc nguoi thi khong dang ke

Chay:  .venv/Scripts/python.exe timing.py
"""
import os
import time

import cv2
import numpy as np

import bench

REPS = 20
# Be ngang khung hinh: 480 la muc ke hoach de xuat cho che do quet camera,
# 720/1080 de so sanh, va anh goc de biet chi phi khi gui anh day du.
FRAME_WIDTHS = [480, 720, 1080]


def timeit(fn, reps=REPS):
    fn()                       # lan dau de khoi dong, khong tinh
    t0 = time.perf_counter()
    for _ in range(reps):
        fn()
    return 1000 * (time.perf_counter() - t0) / reps


def main():
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    photos_dir = os.path.join(bench.ROOT, 'bench', 'photos')
    people = bench.scan_photos(photos_dir)
    people.pop('test', None)
    sample_path = None
    for _, files in sorted(people.items()):
        if files:
            sample_path = files[0]
            break
    img_full = bench.imread_unicode(sample_path)
    print('Anh mau: {}  ({}x{})'.format(
        os.path.relpath(sample_path, bench.ROOT), img_full.shape[1], img_full.shape[0]))

    rows = []

    # 1. Nap model (chi mot lan luc service khoi dong)
    print('\n[1] Thoi gian nap model (chi ton mot lan luc khoi dong)')
    load_ms = {}
    t0 = time.perf_counter()
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'],
                       providers=['CPUExecutionProvider'])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    load_ms['detector'] = 1000 * (time.perf_counter() - t0)
    print('  {:34s} {:8.0f} ms'.format('SCRFD det_10g (phat hien)', load_ms['detector']))
    models = {}
    for key in bench.MODELS:
        t0 = time.perf_counter()
        try:
            models[key], _ = bench.load_model(key, -1)
        except Exception as exc:
            print('  ! {}: {}'.format(key, exc))
            continue
        load_ms[key] = 1000 * (time.perf_counter() - t0)
        print('  {:34s} {:8.0f} ms'.format(bench.MODELS[key]['label'], load_ms[key]))

    # 2. Giai ma JPEG + phat hien, theo be ngang khung hinh
    print('\n[2] Giai ma anh va phat hien mat, theo be ngang khung hinh')
    print('  {:>8s} {:>12s} {:>10s} {:>14s} {:>10s}'.format(
        'be ngang', 'nang JPEG', 'giai ma', 'phat hien', 'co mat?'))
    detect_ms = {}
    frames = {}
    for w in FRAME_WIDTHS:
        scale = w / img_full.shape[1]
        frame = cv2.resize(img_full, (w, int(img_full.shape[0] * scale)),
                           interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        kb = len(buf) / 1024.0
        dec = timeit(lambda: cv2.imdecode(buf, cv2.IMREAD_COLOR))
        det = timeit(lambda: app.get(frame), reps=10)
        faces = app.get(frame)
        detect_ms[w] = det
        frames[w] = frame
        print('  {:>8d} {:>10.0f} KB {:>8.1f} ms {:>12.1f} ms {:>10s}'.format(
            w, kb, dec, det, 'co' if faces else 'khong'))
        rows.append(('decode_%d' % w, dec))
        rows.append(('detect_%d' % w, det))

    # 3. Can chinh
    frame = frames[FRAME_WIDTHS[0]]
    faces = app.get(frame)
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
               reverse=True)
    face = faces[0]
    align_ms = timeit(lambda: face_align.norm_crop(frame, landmark=face.kps,
                                                   image_size=112), reps=200)
    crop = face_align.norm_crop(frame, landmark=face.kps, image_size=112)
    print('\n[3] Can chinh ve 112x112: {:.2f} ms'.format(align_ms))

    # 4. Trich dac trung tung model
    print('\n[4] Trich dac trung mot khuon mat')
    embed_ms = {}
    for key, model in models.items():
        embed_ms[key] = timeit(lambda m=model: m.get_feat([crop]))
        print('  {:34s} {:8.1f} ms'.format(bench.MODELS[key]['label'], embed_ms[key]))

    # 5. So khop
    print('\n[5] So khop voi thu vien')
    v = np.asarray(list(models.values())[0].get_feat([crop]), dtype=np.float32)[0]
    v = v / np.linalg.norm(v)
    for n in (13, 30, 100):
        gal = np.random.randn(n, 512).astype(np.float32)
        gal /= np.linalg.norm(gal, axis=1, keepdims=True)
        ms = timeit(lambda g=gal: np.argmax(g @ v), reps=500)
        print('  {:3d} nguoi: {:.4f} ms'.format(n, ms))

    # 6. Tong ket mot khung hinh 480px
    print('\n[6] TONG MOT KHUNG HINH 480px (giai ma + phat hien + can chinh + trich)')
    print('  {:34s} {:>10s}'.format('model', 'tong'))
    dec480 = [v for k, v in rows if k == 'decode_480'][0]
    base = dec480 + detect_ms[480] + align_ms
    totals = {}
    for key in models:
        totals[key] = base + embed_ms[key]
        print('  {:34s} {:8.0f} ms'.format(bench.MODELS[key]['label'], totals[key]))
    print('  (rieng phat hien da chiem {:.0f} ms)'.format(detect_ms[480]))

    out = os.path.join(bench.ROOT, 'bench', 'results', 'timing.md')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    lines = ['# Thời gian xử lý', '']
    lines.append('Đo trên CPU của máy này, ảnh mẫu {}x{}. Mỗi số là trung bình '
                 'của {} lần chạy sau khi đã khởi động nóng.'.format(
                     img_full.shape[1], img_full.shape[0], REPS))
    lines.append('')
    lines.append('## Nạp model — chỉ tốn một lần lúc service khởi động')
    lines.append('')
    lines.append('| Thành phần | Thời gian |')
    lines.append('|---|---|')
    lines.append('| SCRFD det_10g (phát hiện) | {:.0f} ms |'.format(load_ms['detector']))
    for key in models:
        lines.append('| {} | {:.0f} ms |'.format(bench.MODELS[key]['label'],
                                                 load_ms[key]))
    lines.append('')
    lines.append('## Từng chặng cho một khung hình')
    lines.append('')
    lines.append('| Bề ngang khung | Giải mã JPEG | Phát hiện mặt |')
    lines.append('|---|---|---|')
    for w in FRAME_WIDTHS:
        dec = [v for k, v in rows if k == 'decode_%d' % w][0]
        lines.append('| {} px | {:.1f} ms | {:.0f} ms |'.format(w, dec, detect_ms[w]))
    lines.append('')
    lines.append('Căn chỉnh về 112×112: **{:.2f} ms**. So khớp với 13 người: '
                 'dưới 0,01 ms, coi như bằng không.'.format(align_ms))
    lines.append('')
    lines.append('## Trích đặc trưng, chỗ khác nhau giữa các model')
    lines.append('')
    lines.append('| Model | Một khuôn mặt | Tổng một khung 480px |')
    lines.append('|---|---|---|')
    for key in models:
        lines.append('| {} | {:.1f} ms | **{:.0f} ms** |'.format(
            bench.MODELS[key]['label'], embed_ms[key], totals[key]))
    lines.append('')
    lines.append('Phát hiện mặt chiếm {:.0f} ms trong mỗi con số tổng ở trên, '
                 'và nó dùng chung cho mọi model.'.format(detect_ms[480]))
    lines.append('')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('\nBao cao: ' + out)


if __name__ == '__main__':
    main()
