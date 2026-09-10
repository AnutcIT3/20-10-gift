"""face-service: dich vu trich dac trung khuon mat, chay noi bo tren 127.0.0.1:5002.

Chi lam mot viec: nhan anh -> tra ve cac khuon mat kem vector 512 chieu va chi
so chat luong. Viec so khop voi ho so, nguong, dem so lan, khoa ngay 20/10...
nam o backend Node, noi da co san co so du lieu, rate limit va cau hinh.
Nho vay service nay khong can biet mat khau database, khong giu trang thai, va
mot loi o day chi lam Face ID tu an chu khong lam sap web.

Nguyen tac (FACE_PLAN.md so 4 va 8): anh chi song trong request, khong ghi ra
dia, khong ghi log noi dung anh - chi log so.

Chay:  .venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 5002
"""
import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

import engine as face_engine

log = logging.getLogger('face-service')
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# Khung hinh quet camera da thu nho chi ~50-150 KB; anh dang ky co the la anh
# may anh vai MB. Gioi han theo muc dich su dung, backend Node con chan som hon.
MAX_UPLOAD_BYTES = int(os.environ.get('FACE_MAX_UPLOAD_BYTES', str(8 * 1024 * 1024)))
MAX_FACES = int(os.environ.get('FACE_MAX_FACES', '5'))
USE_GPU = os.environ.get('FACE_GPU', '0') == '1'


@asynccontextmanager
async def lifespan(app):
    app.state.engine = face_engine.Engine(use_gpu=USE_GPU)
    info = app.state.engine.info()
    log.info('model %s san sang tren %s sau %d ms',
             info['model'], info['provider'], info['load_ms'])
    app.state.counters = {'requests': 0, 'no_face': 0, 'errors': 0, 'total_ms': 0.0}
    # Model chay tren MOT luong rieng voi hang doi vao-truoc-ra-truoc. Truoc day
    # model chay thang tren vong su kien: ca lop quet cung luc thi vong su kien
    # bi chan lien tuc, request nao duoc lam truoc la hen xui - thu tai 29 nguoi
    # co khung phai cho hon 8 giay (backend het cho, bao "Face ID nghi") trong
    # khi trung binh chi ~2 giay. Nay khung den truoc xong truoc, va vong su kien
    # luon ranh de nhan request moi va tra loi /health ngay. Mot luong la du:
    # onnxruntime da dung het cac nhan CPU cho moi lan chay.
    app.state.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='face-infer')
    yield
    app.state.executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title='face-service', version='0.1.0', lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)


@app.get('/health')
def health():
    eng = app.state.engine
    c = app.state.counters
    return {
        'status': 'ok',
        **eng.info(),
        'requests': c['requests'],
        'no_face': c['no_face'],
        'errors': c['errors'],
        'avg_ms': round(c['total_ms'] / c['requests'], 1) if c['requests'] else None,
    }


async def _read_upload(image: UploadFile):
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail='khong co du lieu anh')
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail='anh qua lon')
    return data


def _analyze(data, max_faces, with_embedding):
    """Chay tren luong model: giai ma anh roi phat hien + trich dac trung.
    Tra (ket qua, ms xu ly), ket qua None neu anh khong doc duoc."""
    t0 = time.perf_counter()
    img = face_engine.decode_image(data)
    if img is None:
        return None, 0.0
    result = app.state.engine.describe(img, max_faces=max_faces, with_embedding=with_embedding)
    return result, 1000 * (time.perf_counter() - t0)


@app.post('/embed')
async def embed(image: UploadFile = File(...),
                max_faces: int = Query(MAX_FACES, ge=1, le=20),
                embedding: bool = Query(True)):
    """Tra ve moi khuon mat trong anh (to nhat truoc) kem vector 512 chieu.

    Chi so chat luong di kem de ben goi tu quyet dinh: face_px (canh ngan cua
    khung mat, tinh theo anh goc), det_score, brightness (0-255), blur (cang
    cao cang net).
    """
    c = app.state.counters
    t0 = time.perf_counter()
    try:
        data = await _read_upload(image)
        loop = asyncio.get_running_loop()
        result, busy_ms = await loop.run_in_executor(
            app.state.executor, _analyze, data, max_faces, embedding)
        if result is None:
            raise HTTPException(status_code=400, detail='khong doc duoc anh')
    except HTTPException:
        c['errors'] += 1
        raise
    except Exception as exc:          # khong de loi la roi service
        c['errors'] += 1
        log.exception('embed that bai: %s', exc)
        return JSONResponse(status_code=500, content={'detail': 'xu ly anh that bai'})
    # avg_ms o /health van la thoi gian xu ly; thoi gian xep hang ghi rieng
    wait_ms = 1000 * (time.perf_counter() - t0) - busy_ms
    c['requests'] += 1
    c['total_ms'] += busy_ms
    if not result['faces']:
        c['no_face'] += 1
    # chi log so, khong bao gio log anh
    log.info('embed %d KB -> %d mat, %s px, %.0f ms (xep hang %.0f ms)',
             len(data) // 1024, len(result['faces']),
             result['faces'][0]['face_px'] if result['faces'] else '-', busy_ms, wait_ms)
    return result
