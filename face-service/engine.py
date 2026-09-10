"""Loi nhan dien khuon mat: phat hien -> can chinh -> trich dac trung 512 chieu.

Dung chung cho service (app.py), dang ky ho so va benchmark, de moi noi cung
mot cach xu ly. Model mac dinh la ArcFace w600k_r50 (buffalo_l) theo ket luan
trong RESULTS.md; doi bang bien moi truong FACE_MODEL neu can do lai.

Khong ghi anh ra dia, khong log anh: engine chi tra ve so.
"""
import io
import os
import time

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
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

DEFAULT_MODEL = os.environ.get('FACE_MODEL', 'arcface_r50')
# Anh to hon muc nay thi thu nho truoc khi phat hien: SCRFD van chay o 640 nen
# khong mat gi, con thoi gian giai ma/can chinh thi giam han.
MAX_SIDE = int(os.environ.get('FACE_MAX_SIDE', '1600'))


def decode_image(data, apply_exif=True):
    """bytes -> anh BGR. Tra ve None neu khong doc duoc.

    Anh dien thoai thuong xoay bang the EXIF; cv2 bo qua the do nen mat co the
    nam ngang. Doc qua PIL de xoay dung chieu truoc.
    """
    if not data:
        return None
    if apply_exif:
        try:
            from PIL import Image, ImageOps
            im = Image.open(io.BytesIO(data))
            im = ImageOps.exif_transpose(im).convert('RGB')
            return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
        except Exception:
            pass
    buf = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def shrink(img, max_side=MAX_SIDE):
    h, w = img.shape[:2]
    m = max(h, w)
    if m <= max_side:
        return img, 1.0
    scale = max_side / float(m)
    return cv2.resize(img, (int(w * scale), int(h * scale)),
                      interpolation=cv2.INTER_AREA), scale


class Engine:
    def __init__(self, model_key=DEFAULT_MODEL, det_size=640, use_gpu=False):
        from insightface.app import FaceAnalysis
        import onnxruntime as ort

        if model_key not in MODELS:
            raise ValueError('model la: ' + model_key)
        spec = MODELS[model_key]
        providers = (['CUDAExecutionProvider', 'CPUExecutionProvider'] if use_gpu
                     else ['CPUExecutionProvider'])
        ctx_id = 0 if use_gpu else -1

        t0 = time.perf_counter()
        if spec.get('pack') and not os.path.isdir(os.path.join(INSIGHTFACE_ROOT, spec['pack'])):
            # tai bo model cua insightface neu may moi chua co
            FaceAnalysis(name=spec['pack'], providers=['CPUExecutionProvider']).prepare(ctx_id=-1)
        self.detector = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'],
                                     providers=providers)
        self.detector.prepare(ctx_id=ctx_id, det_size=(det_size, det_size))

        if not os.path.exists(spec['path']):
            raise FileNotFoundError(spec['path'])
        self.sess = ort.InferenceSession(spec['path'], providers=providers)
        self.input_name = self.sess.get_inputs()[0].name
        self.output_name = self.sess.get_outputs()[0].name

        self.model_key = model_key
        self.model_label = spec['label']
        self.provider = self.sess.get_providers()[0]
        self.load_ms = round(1000 * (time.perf_counter() - t0))
        self.loaded_at = time.time()

    # -- phat hien + can chinh --------------------------------------------
    def analyze(self, img, max_faces=5):
        """Tra ve danh sach mat, to nhat truoc, moi mat kem crop 112x112 va
        cac chi so chat luong (face_px, det_score, brightness, blur)."""
        from insightface.utils import face_align

        small, scale = shrink(img)
        faces = self.detector.get(small)
        faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                   reverse=True)
        out = []
        for face in faces[:max_faces]:
            crop = face_align.norm_crop(small, landmark=face.kps, image_size=112)
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            x1, y1, x2, y2 = [float(v) / scale for v in face.bbox]
            out.append({
                'bbox': [round(x1), round(y1), round(x2), round(y2)],
                'face_px': int(min(x2 - x1, y2 - y1)),
                'det_score': round(float(face.det_score), 3),
                'brightness': round(float(gray.mean()), 1),
                'blur': round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
                'crop': crop,
            })
        return out

    # -- trich dac trung ----------------------------------------------------
    def embed(self, crops):
        if not crops:
            return np.zeros((0, 512), np.float32)
        blob = cv2.dnn.blobFromImages(list(crops), 1.0 / 127.5, (112, 112),
                                      (127.5, 127.5, 127.5), swapRB=True)
        feats = self.sess.run([self.output_name], {self.input_name: blob})[0]
        feats = np.asarray(feats, dtype=np.float32)
        return feats / np.linalg.norm(feats, axis=1, keepdims=True)

    def describe(self, img, max_faces=5, with_embedding=True):
        """Ket qua JSON-safe cho service: khong con mang anh ben trong."""
        t0 = time.perf_counter()
        faces = self.analyze(img, max_faces=max_faces)
        embs = self.embed([f['crop'] for f in faces]) if (with_embedding and faces) else None
        result = []
        for i, f in enumerate(faces):
            item = {k: v for k, v in f.items() if k != 'crop'}
            item['index'] = i
            if embs is not None:
                item['embedding'] = [round(float(v), 6) for v in embs[i]]
            result.append(item)
        return {
            'faces': result,
            'image': {'width': int(img.shape[1]), 'height': int(img.shape[0])},
            'elapsed_ms': round(1000 * (time.perf_counter() - t0), 1),
        }

    def info(self):
        return {
            'model': self.model_key,
            'model_label': self.model_label,
            'provider': self.provider,
            'load_ms': self.load_ms,
            'uptime_s': round(time.time() - self.loaded_at),
            'embedding_dim': 512,
        }
