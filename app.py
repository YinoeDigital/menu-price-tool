from flask import Response
import os, mimetypes

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

def serve_file(filepath, mime):
    is_text = mime.startswith('text') or mime in ('application/javascript', 'application/json')
    if is_text:
        with open(filepath, 'r', encoding='utf-8') as f:
            return Response(f.read(), mimetype=mime, headers=NO_CACHE_HEADERS)
    else:
        with open(filepath, 'rb') as f:
            return Response(f.read(), mimetype=mime, headers=NO_CACHE_HEADERS)

try:
    from flask import Flask
    app = Flask(__name__)

    @app.route('/')
    def index():
        return serve_file(os.path.join(os.path.dirname(__file__), 'index.html'), 'text/html')

    @app.route('/static/<path:filename>')
    def static_files(filename):
        filepath = os.path.join(os.path.dirname(__file__), 'static', filename)
        ext = os.path.splitext(filename)[1].lower()
        mime = MIME.get(ext, 'application/octet-stream')
        return serve_file(filepath, mime)

    if __name__ == '__main__':
        port = int(os.environ.get('PORT', 5001))
        print(f' * Running on http://localhost:{port}')
        app.run(debug=True, host='0.0.0.0', port=port)

except ImportError:
    print("Flask not installed. Use: python3 -m http.server 5001")
