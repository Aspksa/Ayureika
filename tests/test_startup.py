"""Smoke and failure-path tests; run: python -m unittest discover -s tests -v."""
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ayureika_launcher", ROOT / "launcher.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class StartupTests(unittest.TestCase):
    def test_port_selection(self):
        port = launcher.free_port()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", port))

    def test_sqlite_read_write_and_integrity(self):
        original = launcher.ROOT
        try:
            with tempfile.TemporaryDirectory(prefix="Ayureika тест & (x) ") as directory:
                launcher.ROOT = Path(directory)
                launcher.check_sqlite()
                launcher.check_sqlite()
                self.assertTrue((Path(directory) / "data" / "ayureika.db").exists())
        finally:
            launcher.ROOT = original

    def test_node_server_and_assets(self):
        node = launcher.find_node()[0]
        if not node or not (ROOT / "frontend" / "build" / "main.js").exists():
            self.skipTest("Node or compiled frontend unavailable")
        proc, port, html = launcher.start_with_retry(
            [node, str(ROOT / "server.js")], "/", "test-web.log")
        try:
            launcher.verify_frontend(port, html)
            self.assertIn(b"/build/main.js", html)
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            launcher.PROCESSES.remove(proc)

    def test_api_server(self):
        proc, port, body = launcher.start_with_retry(
            [sys.executable, str(ROOT / "backend" / "main.py")],
            "/api/status", "test-api.log")
        try:
            self.assertIn(b'"status":"ok"', body)
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            launcher.PROCESSES.remove(proc)

    def test_build(self):
        node = launcher.find_node()[0]
        tsc = ROOT / "node_modules" / "typescript" / "bin" / "tsc"
        if not node or not tsc.exists():
            self.skipTest("Node or local TypeScript unavailable")
        launcher.run([node, str(tsc), "--project", "tsconfig.json"])
        self.assertTrue((ROOT / "frontend" / "build" / "main.js").exists())


if __name__ == "__main__":
    unittest.main()
