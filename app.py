from flask import Flask, render_template, Response
import os, mimetypes

app = Flask(__name__)

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    filepath = os.path.join(os.path.dirname(__file__), 'static', filename)
    ext = os.path.splitext(filename)[1].lower()
    mime = MIME.get(ext, 'application/octet-stream')
    is_text = mime.startswith('text') or mime in ('application/javascript', 'application/json')
    if is_text:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return Response(content, mimetype=mime)
    else:
        with open(filepath, 'rb') as f:
            content = f.read()
        return Response(content, mimetype=mime)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
