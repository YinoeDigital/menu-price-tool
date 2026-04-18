from flask import Response, redirect
import os, json, re

MIME = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
}

NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
}

def get_version():
    """讀取 version.json 取得最新版本號"""
    try:
        vpath = os.path.join(os.path.dirname(__file__), 'static', 'version.json')
        with open(vpath, 'r', encoding='utf-8') as f:
            return json.load(f).get('version', '0.0.0')
    except Exception:
        return '0.0.0'

def serve_file(filepath, mime):
    is_text = mime.startswith('text') or mime in ('application/javascript', 'application/json')
    if is_text:
        with open(filepath, 'r', encoding='utf-8') as f:
            return Response(f.read(), mimetype=mime, headers=NO_CACHE_HEADERS)
    else:
        with open(filepath, 'rb') as f:
            return Response(f.read(), mimetype=mime, headers=NO_CACHE_HEADERS)

def build_html(version):
    filepath = os.path.join(os.path.dirname(__file__), 'index.html')
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()
    # 替換 APP_VERSION
    html = re.sub(r"var APP_VERSION = '[^']*';", f"var APP_VERSION = '{version}';", html)
    # 替換 verBadge 初始文字
    html = re.sub(r'(<span[^>]*id="verBadge"[^>]*>)v[^<]*(</span>)',
                  rf'\g<1>v{version}\g<2>', html)
    # 為所有 JS/CSS 加版本戳記，強制瀏覽器重新下載
    html = re.sub(
        r'((?:src|href)="/?static/[^"]+\.(?:js|css))(")',
        rf'\g<1>?v={version}\g<2>',
        html
    )
    return html

try:
    from flask import Flask
    app = Flask(__name__)

    # ── 根路由：重導向到帶版本號的路徑，確保 Arc 不使用舊快取 ──
    @app.route('/')
    def root():
        version = get_version()
        resp = redirect(f'/v/{version}/', code=302)
        for k, v in NO_CACHE_HEADERS.items():
            resp.headers[k] = v
        return resp

    # ── 帶版本號的主路由：每次升版 URL 不同，Arc 必定抓新資源 ──
    @app.route('/v/<version>/')
    def index(version):
        # 若 URL 版本與當前版本不符，重導向到正確版本
        current = get_version()
        if version != current:
            resp = redirect(f'/v/{current}/', code=302)
            for k, v2 in NO_CACHE_HEADERS.items():
                resp.headers[k] = v2
            return resp
        html = build_html(current)
        return Response(html, mimetype='text/html', headers=NO_CACHE_HEADERS)

    @app.route('/static/<path:filename>')
    def static_files(filename):
        # 去除 query string（?v=...）Flask path 轉換器不含 query，無需處理
        filepath = os.path.join(os.path.dirname(__file__), 'static', filename)
        ext = os.path.splitext(filename)[1].lower()
        mime = MIME.get(ext, 'application/octet-stream')
        return serve_file(filepath, mime)

    if __name__ == '__main__':
        port = int(os.environ.get('PORT', 5001))
        version = get_version()
        print(f' * Running on http://localhost:{port}  (v{version})')
        print(f' * App URL: http://localhost:{port}/v/{version}/')
        app.run(debug=True, host='0.0.0.0', port=port, use_reloader=False, threaded=True)

except ImportError:
    print("Flask not installed. Use: python3 -m http.server 5001")
