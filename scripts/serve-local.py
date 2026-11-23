"""Serve the local preview without retaining older HTML or stylesheet versions."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys


class PreviewHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        if sys.stderr is not None:
            super().log_message(format, *args)

    def send_head(self):
        for name in ("If-Modified-Since", "If-None-Match"):
            if name in self.headers:
                del self.headers[name]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    handler = partial(PreviewHandler, directory=str(root))
    with ThreadingHTTPServer(("127.0.0.1", 8080), handler) as server:
        print("Local preview: http://127.0.0.1:8080/#farms", flush=True)
        server.serve_forever()
