"""Единый контроллер запуска Ayureika (Windows, стандартная библиотека)."""
import ctypes
import logging
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
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


def run(command, **kwargs):
    LOG.info("Команда: %s", command)
    return subprocess.run(command, cwd=ROOT, creationflags=HIDDEN, check=True, **kwargs)


def executable(name):
    found = shutil.which(name)
    if found:
        return found
    if os.name == "nt":
        roots = [os.environ.get("ProgramFiles", ""), os.environ.get("LOCALAPPDATA", "")]
        for base in filter(None, roots):
            for suffix in (("nodejs", name + ".exe"), ("Programs/Python/Python313", "python.exe")):
                p = Path(base).joinpath(*suffix)
                if p.is_file() and (name == "node" and suffix[0] == "nodejs" or name == "python" and suffix[0] != "nodejs"):
                    return str(p)
    return None


def require_node():
    node = executable("node")
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not node or not npm:
        winget = shutil.which("winget")
        if not winget:
            raise RuntimeError("Не найдены Node.js/npm и winget. Установите Node.js LTS.")
        print("Устанавливаю Node.js LTS через winget...")
        run([winget, "install", "--id", "OpenJS.NodeJS.LTS", "--exact",
             "--accept-package-agreements", "--accept-source-agreements"])
        node = executable("node")
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if node and not npm:
            npm_candidate = Path(node).with_name("npm.cmd")
            if npm_candidate.is_file():
                npm = str(npm_candidate)
        if not node or not npm:
            raise RuntimeError("Node.js установлен, но путь не обновился. Перезапустите Ayureika.bat.")
    return node, npm


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_ready(url, process, seconds=25):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Сервер завершился до готовности: " + url)
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise TimeoutError("Сервер не ответил: " + url)


def launch(command, log_name):
    handle = open(LOG_DIR / log_name, "a", encoding="utf-8")
    try:
        proc = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                                stdout=handle, stderr=subprocess.STDOUT,
                                creationflags=HIDDEN)
    finally:
        handle.close()
    PROCESSES.append(proc)
    return proc


def stop_all():
    for process in reversed(PROCESSES):
        if process.poll() is None:
            process.terminate()
    for process in reversed(PROCESSES):
        if process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def main():
    mutex = None
    if os.name == "nt":
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        mutex = kernel32.CreateMutexW(None, False, "Local\\Ayureika_Startup")
        if not mutex:
            raise ctypes.WinError(ctypes.get_last_error())
        if ctypes.get_last_error() == 183:
            print("Ayureika уже запущена.")
            kernel32.CloseHandle(mutex)
            return
    try:
        node, npm = require_node()
        tsc = ROOT / "node_modules" / "typescript" / "bin" / "tsc"
        if not tsc.is_file():
            print("Устанавливаю зависимости TypeScript...")
            run([npm, "install", "--no-audit", "--no-fund"])
        run([node, str(tsc), "--project", "tsconfig.json"])
        api_port, web_port = free_port(), free_port()
        while web_port == api_port:
            web_port = free_port()
        api = launch([sys.executable, str(ROOT / "backend" / "main.py"), str(api_port)], "api.log")
        wait_ready(f"http://127.0.0.1:{api_port}/api/status", api)
        web = launch([node, str(ROOT / "server.js"), str(web_port)], "web.log")
        address = f"http://127.0.0.1:{web_port}/"
        wait_ready(address, web)
        print("Ayureika готова: " + address)
        LOG.info("Готово: %s (API %s)", address, api_port)
        webbrowser.open(address)
        print("Для остановки нажмите Ctrl+C или закройте это окно.")
        while True:
            if api.poll() is not None or web.poll() is not None:
                raise RuntimeError("Один из серверов неожиданно остановился.")
            time.sleep(0.5)
    finally:
        stop_all()
        if mutex:
            ctypes.WinDLL("kernel32").CloseHandle(ctypes.c_void_p(mutex))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nОстановка Ayureika.")
    except Exception as error:
        LOG.exception("Ошибка запуска")
        print("Ошибка:", error)
        print("Подробности: logs\\startup.log")
        sys.exit(1)
