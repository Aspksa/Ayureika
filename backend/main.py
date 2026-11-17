"""Минимальный Python API Ayureika."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parent.parent
DATABASE = ROOT / "data" / "ayureika.db"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/api/status":
            self.send_error(404)
            return
        body = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE):
        pass
    HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
