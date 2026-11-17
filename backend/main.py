"""Ayureika: минимальный API-сервер на стандартной библиотеке Python."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parent.parent
DATABASE = ROOT / "data" / "ayureika.db"


def initialize_database():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE):
        pass


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
    initialize_database()
    HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
