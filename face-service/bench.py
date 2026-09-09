"""So sanh cac model nhan dien khuon mat tren chinh anh lop minh.

Chay:   .venv/Scripts/python.exe bench.py
Anh:    bench/photos/<Ten ban>/*.jpg   (moi ban mot thu muc)
Ket qua: bench/results/results.csv + report.md

Nguyen tac do (FACE_PLAN.md muc 1.2): DUNG CHUNG mot bo phat hien + can chinh
(SCRFD det_10g cua buffalo_l) cho moi model, nen khac biet do duoc la thuan
chat luong embedding, khong lan tap chat alignment.
"""
import argparse
import json
import os
import sys
import time
from collections import defaultdict

import cv2
import numpy as np

IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


# -- Doc anh chiu duoc duong dan tieng Viet tren Windows ----------------------
def imread_unicode(path):
    try:
        buf = np.fromfile(path, dtype=np.uint8)
        return cv2.imdecode(buf, cv2.IMREAD_COLOR)
    except Exception:
        return None


def scan_photos(photos_dir):
    people = {}
    for name in sorted(os.listdir(photos_dir)):
        person_dir = os.path.join(photos_dir, name)
        if not os.path.isdir(person_dir):
            continue
        files = [os.path.join(person_dir, f) for f in sorted(os.listdir(person_dir))
                 if os.path.splitext(f)[1].lower() in IMAGE_EXT]
        if files:
            people[name] = files
    return people


# -- Buoc 1: phat hien + can chinh (chay MOT lan, dung cho moi model) ---------
def align_all(people, det_size=640, ctx_id=-1):
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    providers = (['CUDAExecutionProvider', 'CPUExecutionProvider'] if ctx_id >= 0
                 else ['CPUExecutionProvider'])
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'],
                       providers=providers)
    app.prepare(ctx_id=ctx_id, det_size=(det_size, det_size))

    photos, skipped = [], []
    for person, files in people.items():
        for path in files:
            img = imread_unicode(path)
            rel = os.path.relpath(path, ROOT)
            if img is None:
                skipped.append((rel, 'khong doc duoc file'))
                continue
            faces = app.get(img)
            if not faces:
                skipped.append((rel, 'khong tim thay mat'))
                continue
            # Giu MOI khuon mat tim duoc, sap theo do lon. Viec chon mat nao
            # de o buoc sau (choose_faces) vi "mat to nhat" khong phai luc nao
            # cung dung khi trong anh co hai nguoi xap xi nhau.
            faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                       reverse=True)
            candidates = []
            for face in faces:
                crop = face_align.norm_crop(img, landmark=face.kps, image_size=112)
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                x1, y1, x2, y2 = face.bbox
                candidates.append({
                    'crop': crop,
                    'meta': {
                        'file': rel,
                        'person': person,
                        'img_w': int(img.shape[1]), 'img_h': int(img.shape[0]),
                        'faces_found': len(faces),
                        'face_px': int(min(x2 - x1, y2 - y1)),
                        'bbox': [int(x1), int(y1), int(x2), int(y2)],
                        'det_score': round(float(face.det_score), 3),
                        'blur': round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
                        'brightness': round(float(gray.mean()), 1),
                    },
                })
            photos.append({'person': person, 'file': rel, 'candidates': candidates})
    return photos, skipped


def choose_faces(photos, ctx_id=-1, chooser_key='arcface_r50'):
    """Chon dung khuon mat cua nguoi trong anh nhieu nguoi.

    Vong 1 lay mat to nhat de dung ho so tam cho tung nguoi. Vong 2 chon lai,
    voi moi anh lay khuon mat giong ho so cua chinh nguoi do nhat. Nho vay anh
    chup chung ma ban minh nho hon vai phan tram khong con bi lay nham.

    Chi mot model duy nhat lam viec chon nay, va cac model deu nhan cung mot bo
    anh da cat, nen so sanh giua chung van cong bang.
    """
    multi = [p for p in photos if len(p['candidates']) > 1]
    if not multi:
        return ([p['candidates'][0]['crop'] for p in photos],
                [p['person'] for p in photos],
                [p['candidates'][0]['meta'] for p in photos], [])

    chooser, _ = load_model(chooser_key, ctx_id)
    flat = [c['crop'] for p in photos for c in p['candidates']]
    emb = embed_all(chooser, flat)
    spans, at = [], 0
    for p in photos:
        spans.append((at, at + len(p['candidates'])))
        at += len(p['candidates'])

    picked = [0] * len(photos)
    for _ in range(2):
        profiles = {}
        for person in {p['person'] for p in photos}:
            vs = [emb[spans[i][0] + picked[i]]
                  for i, p in enumerate(photos) if p['person'] == person]
            m = np.mean(vs, axis=0)
            profiles[person] = m / np.linalg.norm(m)
        for i, p in enumerate(photos):
            lo, hi = spans[i]
            scores = emb[lo:hi] @ profiles[p['person']]
            picked[i] = int(np.argmax(scores))

    crops, labels, meta, repicked = [], [], [], []
    for i, p in enumerate(photos):
        k = picked[i]
        crops.append(p['candidates'][k]['crop'])
        labels.append(p['person'])
        meta.append(p['candidates'][k]['meta'])
        if k != 0:
            lo, hi = spans[i]
            repicked.append({
                'file': p['file'],
                'faces': len(p['candidates']),
                'chosen': k + 1,
                'score_chosen': round(float(emb[lo + k] @ profiles[p['person']]), 3),
                'score_largest': round(float(emb[lo] @ profiles[p['person']]), 3),
            })
    return crops, labels, meta, repicked


# -- Buoc 2: cac model ung vien ----------------------------------------------
INSIGHTFACE_ROOT = os.path.expanduser('~/.insightface/models')
LOCAL_MODELS = os.path.join(HERE, 'models')

MODELS = {
    'arcface_r50': {
        'label': 'ArcFace w600k_r50 (buffalo_l)',
        'pack': 'buffalo_l',
        'path': os.path.join(INSIGHTFACE_ROOT, 'buffalo_l', 'w600k_r50.onnx'),
    },
    'glintr100': {
        'label': 'ArcFace glintr100 (antelopev2)',
        'pack': 'antelopev2',
        'path': os.path.join(INSIGHTFACE_ROOT, 'antelopev2', 'glintr100.onnx'),
    },
    'lvface_b': {
        'label': 'LVFace-B Glint360K',
        'path': os.path.join(LOCAL_MODELS, 'LVFace-B_Glint360K.onnx'),
    },
    'lvface_l': {
        'label': 'LVFace-L Glint360K',
        'path': os.path.join(LOCAL_MODELS, 'LVFace-L_Glint360K.onnx'),
    },
}


class OnnxRecognizer:
    """Mot bo tien xu ly duy nhat cho MOI model: BGR 112x112 -> RGB, (x-127.5)/127.5.

    Dung chung wrapper nay (thay vi de moi thu vien tu xu ly) de dam bao khac
    biet do duoc chi den tu trong so model.
    """

    def __init__(self, path, ctx_id=-1):
        import onnxruntime as ort
        providers = (['CUDAExecutionProvider', 'CPUExecutionProvider'] if ctx_id >= 0
                     else ['CPUExecutionProvider'])
        self.sess = ort.InferenceSession(path, providers=providers)
        self.input_name = self.sess.get_inputs()[0].name
        self.output_name = self.sess.get_outputs()[0].name
        self.provider = self.sess.get_providers()[0]

    def get_feat(self, imgs):
        blob = cv2.dnn.blobFromImages(imgs, 1.0 / 127.5, (112, 112),
                                      (127.5, 127.5, 127.5), swapRB=True)
        return self.sess.run([self.output_name], {self.input_name: blob})[0]


def ensure_pack(pack):
    """Tai bo model cua insightface neu chua co."""
    target = os.path.join(INSIGHTFACE_ROOT, pack)
    if os.path.isdir(target):
        return target
    from insightface.app import FaceAnalysis
    FaceAnalysis(name=pack, providers=['CPUExecutionProvider']).prepare(ctx_id=-1)
    return target


def load_model(key, ctx_id=-1):
    spec = MODELS[key]
    if spec.get('pack'):
        ensure_pack(spec['pack'])
    path = spec['path']
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return OnnxRecognizer(path, ctx_id), round(os.path.getsize(path) / 1e6, 1)


def embed_all(model, crops, batch=16):
    out = []
    for i in range(0, len(crops), batch):
        feats = model.get_feat(crops[i:i + batch])
        out.append(np.asarray(feats, dtype=np.float32))
    emb = np.vstack(out)
    return emb / np.linalg.norm(emb, axis=1, keepdims=True)


# -- Buoc 3: cham diem -------------------------------------------------------
def gallery_vector(emb, idxs, strategy):
    """mean = trung binh embedding; max = giu tung anh, lay diem cao nhat."""
    v = emb[idxs]
    if strategy == 'mean':
        m = v.mean(axis=0)
        return (m / np.linalg.norm(m)).reshape(1, -1)
    return v


def score_against(probe, gal):
    return float(np.max(gal @ probe))


def evaluate(emb, labels, strategy='mean', meta=None):
    people = sorted(set(labels))
    idx_of = {p: [i for i, l in enumerate(labels) if l == p] for p in people}

    rank1, genuine, margins = 0, [], []
    confusions = defaultdict(int)
    failures = []
    weak = []
    n_probe = 0
    for person in people:
        for probe_i in idx_of[person]:
            rest = [i for i in idx_of[person] if i != probe_i]
            if not rest:
                continue        # nguoi chi co 1 anh thi khong tu so duoc
            scores = {}
            for other in people:
                idxs = rest if other == person else idx_of[other]
                scores[other] = score_against(emb[probe_i],
                                              gallery_vector(emb, idxs, strategy))
            ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
            n_probe += 1
            genuine.append(scores[person])
            margins.append(ranked[0][1] - ranked[1][1] if len(ranked) > 1 else 1.0)
            src = meta[probe_i]['file'] if meta else '#%d' % probe_i
            if ranked[0][0] == person:
                rank1 += 1
                weak.append((scores[person], src))
            else:
                confusions[(person, ranked[0][0])] += 1
                failures.append({
                    'file': src, 'person': person,
                    'guessed': ranked[0][0],
                    'score_guessed': round(ranked[0][1], 4),
                    'score_correct': round(scores[person], 4),
                })

    # Nguoi la: bo han mot nguoi khoi thu vien roi cho anh cua ho di nhan dien
    impostor = []
    for held in people:
        gal = {o: gallery_vector(emb, idx_of[o], strategy)
               for o in people if o != held}
        if not gal:
            continue
        for probe_i in idx_of[held]:
            impostor.append(max(score_against(emb[probe_i], g) for g in gal.values()))

    genuine = np.array(genuine)
    impostor = np.array(impostor)
    tau = float(impostor.max()) if len(impostor) else 0.0
    accepted = int((genuine > tau).sum()) if len(genuine) else 0
    return {
        'probes': n_probe,
        'rank1': round(100 * rank1 / n_probe, 1) if n_probe else 0.0,
        'tau_0fa': round(tau, 4),
        'tar_at_0fa': round(100 * accepted / n_probe, 1) if n_probe else 0.0,
        'genuine_mean': round(float(genuine.mean()), 4) if len(genuine) else 0,
        'genuine_min': round(float(genuine.min()), 4) if len(genuine) else 0,
        'impostor_mean': round(float(impostor.mean()), 4) if len(impostor) else 0,
        'impostor_max': round(float(impostor.max()), 4) if len(impostor) else 0,
        'gap': round(float(genuine.mean() - impostor.mean()), 4) if len(genuine) else 0,
        'margin_median': round(float(np.median(margins)), 4) if margins else 0,
        'margin_min': round(float(np.min(margins)), 4) if margins else 0,
        'confusions': sorted([[a + ' -> ' + b, n] for (a, b), n in confusions.items()],
                             key=lambda x: -x[1]),
        'failures': failures,
        # anh nhan dung nhung diem thap nhat: ung vien thay the neu muon chac hon
        'weakest': [{'file': f, 'score': round(s, 4)}
                    for s, f in sorted(weak)[:5]],
    }


def latency(model, crop, reps=30):
    model.get_feat([crop])
    t0 = time.perf_counter()
    for _ in range(reps):
        model.get_feat([crop])
    return round(1000 * (time.perf_counter() - t0) / reps, 1)


# -- Bao cao -----------------------------------------------------------------
def write_report(out_dir, people, meta, skipped, results, args, repicked=()):
    os.makedirs(out_dir, exist_ok=True)
    cols = ['model', 'strategy', 'probes', 'rank1', 'tau_0fa', 'tar_at_0fa',
            'genuine_mean', 'genuine_min', 'impostor_mean', 'impostor_max',
            'gap', 'margin_median', 'margin_min', 'latency_ms', 'size_mb']
    with open(os.path.join(out_dir, 'results.csv'), 'w', encoding='utf-8') as f:
        f.write(','.join(cols) + '\n')
        for r in results:
            f.write(','.join(str(r.get(c, '')) for c in cols) + '\n')

    total_photos = sum(len(v) for v in people.values())
    device = 'GPU' if args.gpu else 'CPU'
    best = max(results, key=lambda r: (r['tar_at_0fa'], r['gap'])) if results else None

    lines = ['# Kết quả benchmark Face ID', '']
    lines.append('Dữ liệu: **{}** khuôn mặt dùng được trên {} ảnh của **{}** người. '
                 'Chạy trên {}.'.format(len(meta), total_photos, len(people), device))
    lines.append('')
    if best:
        lines.append('**Dẫn đầu: {} ({})** — nhận đúng {}% ở mức không một người lạ '
                     'nào lọt qua.'.format(best['label'], best['strategy'],
                                           best['tar_at_0fa']))
        lines.append('')
    lines.append('## Bảng so sánh')
    lines.append('')
    lines.append('| Model | Cách đăng ký | Đúng top-1 | Đúng khi 0 nhận nhầm | '
                 'Ngưỡng τ | Cách biệt thật/lạ | Margin | ms/ảnh | MB |')
    lines.append('|---|---|---|---|---|---|---|---|---|')
    for r in results:
        lines.append('| {} | {} | {}% | **{}%** | {} | {} | {} | {} | {} |'.format(
            r['label'], r['strategy'], r['rank1'], r['tar_at_0fa'], r['tau_0fa'],
            r['gap'], r['margin_median'], r['latency_ms'], r['size_mb']))
    lines.append('')
    lines.append('Giải thích từng cột:')
    lines.append('')
    lines.append('- **Đúng top-1**: xếp đúng người vào vị trí số 1, chưa xét ngưỡng.')
    lines.append('- **Đúng khi 0 nhận nhầm**: con số quyết định. Đặt ngưỡng cao tới mức')
    lines.append('  không một người lạ nào lọt qua, thì còn nhận ra được bao nhiêu phần trăm.')
    lines.append('  Cổng trong FACE_PLAN.md là **≥ 90%**.')
    lines.append('- **Ngưỡng τ**: điểm cosine tối thiểu để chấp nhận, đo từ chính bộ ảnh này.')
    lines.append('- **Cách biệt thật/lạ**: điểm trung bình của người đúng trừ điểm của người lạ.')
    lines.append('  Càng lớn càng dễ chọn ngưỡng an toàn.')
    lines.append('- **Margin**: khoảng cách giữa người đứng nhất và người đứng nhì.')
    lines.append('  Nhỏ nghĩa là hai bạn dễ bị lẫn.')
    lines.append('- **Cách đăng ký**: `mean` gộp các ảnh của một người thành một vector,')
    lines.append('  `max` giữ riêng từng ảnh rồi lấy điểm cao nhất.')
    lines.append('')

    lines.append('## Cặp dễ nhầm')
    lines.append('')
    any_conf = False
    for r in results:
        if r['confusions']:
            any_conf = True
            pairs = ', '.join('{} ({} lần)'.format(p, n) for p, n in r['confusions'])
            lines.append('- **{}** ({}): {}'.format(r['label'], r['strategy'], pairs))
    if not any_conf:
        lines.append('- Không ảnh nào bị xếp nhầm sang người khác.')
    lines.append('')

    # Anh nao gay loi - de biet nen thay tam nao
    all_fail = defaultdict(list)
    for r in results:
        for f in r['failures']:
            all_fail[f['file']].append('{} ({})'.format(r['label'], r['strategy']))
    if all_fail:
        lines.append('## Ảnh gây lỗi')
        lines.append('')
        lines.append('Những tấm này bị nhận nhầm sang người khác. Mở ra xem: '
                     'thường là ảnh nghiêng nhiều, đeo khẩu trang, quá xa, '
                     'hoặc trong ảnh có người khác lớn hơn trong khung.')
        lines.append('')
        for path, models in sorted(all_fail.items(), key=lambda kv: -len(kv[1])):
            lines.append('- `{}` — sai ở {}/{} lượt chấm'.format(
                path, len(models), len(results)))
        lines.append('')

    if results:
        lines.append('## Ảnh yếu nhất của model dẫn đầu')
        lines.append('')
        lines.append('Nhận đúng nhưng điểm sát ngưỡng nhất. Nếu muốn chắc hơn thì '
                     'thay bằng ảnh rõ mặt hơn.')
        lines.append('')
        for w in best['weakest']:
            lines.append('- `{}` — điểm {}'.format(w['file'], w['score']))
        lines.append('')

    if repicked:
        lines.append('## Ảnh chụp chung đã chọn lại mặt')
        lines.append('')
        lines.append('Những tấm này có nhiều người trong khung và người to nhất '
                     'KHÔNG phải chủ nhân thư mục. Script đã tự lấy đúng mặt bằng '
                     'cách so với các ảnh khác của chính bạn đó.')
        lines.append('')
        for r in repicked:
            lines.append('- `{}` — {} mặt, lấy mặt #{} (giống hồ sơ {} thay vì {})'
                         .format(r['file'], r['faces'], r['chosen'],
                                 r['score_chosen'], r['score_largest']))
        lines.append('')

    lines.append('## Chất lượng ảnh đầu vào')
    lines.append('')
    lines.append('| Người | Ảnh dùng được | Mặt nhỏ nhất (px) | Độ nét thấp nhất | Độ sáng |')
    lines.append('|---|---|---|---|---|')
    by_person = defaultdict(list)
    for m in meta:
        by_person[m['person']].append(m)
    for person, items in sorted(by_person.items()):
        lines.append('| {} | {} | {} | {} | {} |'.format(
            person, len(items),
            min(i['face_px'] for i in items),
            min(i['blur'] for i in items),
            round(sum(i['brightness'] for i in items) / len(items))))
    lines.append('')
    lines.append('Mặt dưới 80 px hoặc độ nét dưới 40 là ảnh yếu, nên thay bằng ảnh rõ hơn.')
    lines.append('Độ sáng dưới 60 là ảnh tối.')
    lines.append('')

    if skipped:
        lines.append('## Ảnh bị bỏ qua')
        lines.append('')
        for rel, why in skipped:
            lines.append('- `{}` — {}'.format(rel, why))
        lines.append('')

    lines.append('## Đọc kết quả này thế nào')
    lines.append('')
    lines.append('Phép đo dùng cách "bỏ ra một ảnh": lần lượt lấy từng ảnh làm ảnh cần')
    lines.append('nhận diện, các ảnh còn lại của người đó làm hồ sơ đăng ký. Điểm của')
    lines.append('người lạ đo bằng cách bỏ hẳn một người khỏi thư viện rồi cho ảnh của')
    lines.append('họ đi nhận diện — đúng tình huống người ngoài lớp bấm thử.')
    lines.append('')
    lines.append('Lưu ý: nếu mọi ảnh đều cùng loại (đều là ảnh kỷ yếu chẳng hạn) thì con')
    lines.append('số ở đây LẠC QUAN hơn thực tế, vì lúc dùng thật ảnh đăng ký là ảnh đẹp')
    lines.append('còn ảnh quét là camera điện thoại buổi tối. Muốn biết con số thật, cần')
    lines.append('thêm vài ảnh chụp bằng điện thoại trong điều kiện thường ngày.')
    lines.append('')

    with open(os.path.join(out_dir, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    with open(os.path.join(out_dir, 'photos.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--photos', default=os.path.join(ROOT, 'bench', 'photos'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'bench', 'results'))
    ap.add_argument('--models', default=','.join(MODELS))
    ap.add_argument('--strategies', default='mean,max')
    ap.add_argument('--gpu', action='store_true')
    args = ap.parse_args()
    ctx_id = 0 if args.gpu else -1

    people = scan_photos(args.photos)
    if not people:
        print('Chua co anh nao trong ' + args.photos)
        print('Tao moi ban mot thu muc con roi tha anh vao (xem README.txt).')
        sys.exit(1)
    total = sum(len(v) for v in people.values())
    print('Tim thay {} nguoi / {} anh'.format(len(people), total))
    for p, f in people.items():
        print('  {}: {} anh'.format(p, len(f)))

    print('\nPhat hien + can chinh khuon mat (dung chung cho moi model)...')
    t0 = time.perf_counter()
    photos_found, skipped = align_all(people, ctx_id=ctx_id)
    crops, labels, meta, repicked = choose_faces(photos_found, ctx_id=ctx_id)
    print('  {} khuon mat trong {:.1f}s{}'.format(
        len(crops), time.perf_counter() - t0,
        ', bo qua {} anh'.format(len(skipped)) if skipped else ''))
    for rel, why in skipped:
        print('  ! {}: {}'.format(rel, why))
    for r in repicked:
        print('  ~ {}: anh co {} mat, lay mat #{} (giong ho so {} thay vi {})'.format(
            r['file'], r['faces'], r['chosen'], r['score_chosen'], r['score_largest']))
    if len(set(labels)) < 2:
        print('Can it nhat 2 nguoi de so sanh.')
        sys.exit(1)

    results = []
    for key in args.models.split(','):
        key = key.strip()
        if key not in MODELS:
            print('! bo qua model la: ' + key)
            continue
        print('\n=== ' + MODELS[key]['label'])
        try:
            model, size_mb = load_model(key, ctx_id)
        except Exception as exc:
            print('  ! khong nap duoc: {}'.format(exc))
            continue
        t0 = time.perf_counter()
        emb = embed_all(model, crops)
        print('  embedding {} trong {:.1f}s'.format(emb.shape, time.perf_counter() - t0))
        ms = latency(model, crops[0])
        for strategy in args.strategies.split(','):
            r = evaluate(emb, labels, strategy.strip(), meta)
            r.update(model=key, label=MODELS[key]['label'], strategy=strategy.strip(),
                     latency_ms=ms, size_mb=size_mb)
            results.append(r)
            print('  [{}] rank-1 {}% | nhan dung o 0 nhan nham {}% | tau={}'.format(
                strategy, r['rank1'], r['tar_at_0fa'], r['tau_0fa']))

    write_report(args.out, people, meta, skipped, results, args, repicked)
    print('\nBao cao: ' + os.path.join(args.out, 'report.md'))


if __name__ == '__main__':
    main()
