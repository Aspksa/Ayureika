"""Управление локальным запуском Ayureika без сторонних Python-пакетов."""
import ctypes
import logging
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(filename=LOG_DIR / "startup.log", level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s", encoding="utf-8")
LOG = logging.getLogger("ayureika")
HIDDEN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
PROCESSES = []


def run(command):
    # cmd.exe /c is required for npm.cmd on Windows; list2cmdline quotes paths.
    if os.name == "nt" and str(command[0]).lower().endswith((".cmd", ".bat")):
        command = [os.environ.get("ComSpec", "cmd.exe"), "/d", "/s", "/c",
                   subprocess.list2cmdline(command)]
    result = subprocess.run(command, cwd=ROOT, creationflags=HIDDEN,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace")
    if result.stdout:
        LOG.info("%s", result.stdout)
        print(result.stdout, flush=True)
    if result.returncode:
        raise RuntimeError("Ошибка команды (%s): %s" % (result.returncode, command))
    return result


def find_node():
    node = shutil.which("node")
    if not node and os.name == "nt":
        for base in (os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
            if base:
                candidate = Path(base) / "nodejs" / "node.exe"
                if candidate.is_file():
                    node = str(candidate)
                    break
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if node and not npm:
        candidate = Path(node).with_name("npm.cmd" if os.name == "nt" else "npm")
        if candidate.is_file():
            npm = str(candidate)
    return node, npm


def require_node():
    node, npm = find_node()
    if not node or not npm:
        winget = shutil.which("winget")
        if not winget:
            raise RuntimeError("Node.js/npm отсутствует; winget недоступен.")
        print("Установка Node.js LTS...")
        run([winget, "install", "--id", "OpenJS.NodeJS.LTS", "--exact",
             "--accept-package-agreements", "--accept-source-agreements"])
        node, npm = find_node()
        if not node or not npm:
            raise RuntimeError("Node.js установлен, но путь пока недоступен. Перезапустите BAT.")
    version = run([node, "--version"]).stdout.strip()
    major = int(version.lstrip("v").split(".")[0])
    if major < 18:
        raise RuntimeError("Нужен Node.js 18 или новее, найден " + version)
    run([npm, "--version"])
    return node, npm


def check_sqlite():
    database = ROOT / "data" / "ayureika.db"
    database.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database, timeout=5) as connection:
        status = connection.execute("PRAGMA quick_check").fetchone()[0]
        if status != "ok":
            raise RuntimeError("SQLite повреждена: " + status)
        # TEMP table is not persisted in user data; write access is verified
        # with a rolled-back savepoint on the main database.
        connection.execute("SAVEPOINT ayureika_probe")
        try:
            connection.execute("CREATE TABLE IF NOT EXISTS __ayureika_write_probe (id INTEGER)")
            connection.execute("INSERT INTO __ayureika_write_probe VALUES (1)")
        finally:
            connection.execute("ROLLBACK TO ayureika_probe")
            connection.execute("RELEASE ayureika_probe")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def fetch(url):
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url, timeout=1) as response:
        if response.status != 200:
            raise RuntimeError("HTTP %s: %s" % (response.status, url))
        return response.read()


def wait_ready(url, process, seconds=12):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Сервер завершился: " + url)
        try:
            return fetch(url)
        except (OSError, urllib.error.URLError, RuntimeError):
            time.sleep(0.15)
    raise TimeoutError("Сервер не готов: " + url)


def launch(command, name):
    with open(LOG_DIR / name, "a", encoding="utf-8") as output:
        proc = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                                stdout=output, stderr=subprocess.STDOUT,
                                creationflags=HIDDEN)
    PROCESSES.append(proc)
    return proc


def stop_all():
    for proc in reversed(PROCESSES):
        if proc.poll() is None:
            proc.terminate()
    for proc in reversed(PROCESSES):
        try:
            proc.wait(timeout=4)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def start_with_retry(command_prefix, endpoint, log_name, tries=5):
    for attempt in range(tries):
        port = free_port()
        proc = launch(command_prefix + [str(port)], log_name)
        try:
            body = wait_ready("http://127.0.0.1:%s%s" % (port, endpoint), proc)
            return proc, port, body
        except (RuntimeError, TimeoutError):
            if proc.poll() is None:
                proc.terminate()
            proc.wait(timeout=4)
            if attempt == tries - 1:
                raise
            LOG.warning("Повторный выбор порта: %s", attempt + 1)
    raise RuntimeError("Не удалось выбрать порт")


def verify_frontend(port, html):
    if b"/build/main.js" not in html or b"/style.css" not in html:
        raise RuntimeError("HTML не содержит ожидаемых ресурсов")
    for resource in ("/style.css", "/build/main.js"):
        content = fetch("http://127.0.0.1:%s%s" % (port, resource))
        if not content:
            raise RuntimeError("Пустой ресурс: " + resource)


def windows_mutex():
    if os.name != "nt":
        return None
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.restype = ctypes.c_void_p
    handle = kernel.CreateMutexW(None, False, "Local\\Ayureika_Startup")
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        kernel.CloseHandle(ctypes.c_void_p(handle))
        print("Ayureika уже запущена.")
        return False
    return handle


def main():
    mutex = windows_mutex()
    if mutex is False:
        return
    try:
        if sys.version_info < (3, 9):
            raise RuntimeError("Требуется Python 3.9 или новее")
        node, npm = require_node()
        check_sqlite()
        tsc = ROOT / "node_modules" / "typescript" / "bin" / "tsc"
        if not tsc.is_file():
            print("Установка TypeScript...")
            run([npm, "install", "--no-audit", "--no-fund"])
        run([node, str(tsc), "--project", "tsconfig.json"])
        api, api_port, body = start_with_retry(
            [sys.executable, str(ROOT / "backend" / "main.py")], "/api/status", "api.log")
        if b'"status":"ok"' not in body:
            raise RuntimeError("API вернул неверный статус")
        web, web_port, html = start_with_retry(
            [node, str(ROOT / "server.js")], "/", "web.log")
        verify_frontend(web_port, html)
        url = "http://127.0.0.1:%s/" % web_port
        print("Ayureika готова:", url)
        webbrowser.open(url)
        print("Для остановки нажмите Ctrl+C.")
        while api.poll() is None and web.poll() is None:
            time.sleep(0.5)
        raise RuntimeError("Один из серверов остановился")
    finally:
        stop_all()
        if mutex:
            ctypes.WinDLL("kernel32").CloseHandle(ctypes.c_void_p(mutex))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Ayureika остановлена.")
    except Exception as error:
        LOG.exception("Ошибка запуска")
        print("Ошибка:", error)
        print("Подробности: logs\\startup.log")
        sys.exit(1)
