"""Extrai ficheiros específicos de um ZIP remoto usando HTTP Range (sem descarregar o arquivo inteiro)."""
import sys, urllib.request, zipfile, io, os
url, outdir, wanted = sys.argv[1], sys.argv[2], sys.argv[3:]
class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url = urllib.request.urlopen(urllib.request.Request(url, method="HEAD")).geturl()
        h = urllib.request.urlopen(urllib.request.Request(self.url, method="HEAD"))
        self.size = int(h.headers["Content-Length"]); self.pos = 0
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off); return self.pos
    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0: return 0
        r = urllib.request.urlopen(urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos+n-1}"}))
        data = r.read(); b[:len(data)] = data; self.pos += len(data); return len(data)
f = RangeFile(url); print("tamanho total", f.size // (1024*1024), "MiB")
z = zipfile.ZipFile(io.BufferedReader(f, buffer_size=1 << 20))
os.makedirs(outdir, exist_ok=True)
for info in z.infolist():
    if any(info.filename.endswith(w) for w in wanted):
        out = os.path.join(outdir, os.path.basename(info.filename))
        with z.open(info) as src, open(out, "wb") as dst:
            while chunk := src.read(1 << 20): dst.write(chunk)
        print("extraído", info.filename, info.file_size // 1024, "KiB")
