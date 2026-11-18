#!/usr/bin/env python3
"""
Predefinições de exportação do Godot para os pacotes de bairro (um .pck por kit).

    python3 tools/deploy/kit_presets.py        # reescreve client/export_presets.cfg

As predefinições principais (Web Demo / Web Online) excluem assets/kits/*; cada kit tem a sua
"Pack <kit>" com só os ficheiros desse kit. Exportar:
    godot --headless --path client --export-pack "Pack <kit>" ../build/online/packs/<kit>.pck
"""
import glob, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CFG = os.path.join(ROOT, "client", "export_presets.cfg")

text = open(CFG).read()
# separa as secções [preset.N] / [preset.N.options]
blocks = re.split(r"(?m)^(?=\[preset\.\d+(?:\.options)?\]\s*$)", text)
blocks = [b for b in blocks if b.strip()]
presets, i = [], 0
while i < len(blocks):
    head, opts = blocks[i], blocks[i + 1] if i + 1 < len(blocks) and ".options]" in blocks[i + 1].splitlines()[0] else ""
    presets.append((head, opts))
    i += 2 if opts else 1
main = [(h, o) for h, o in presets if not re.search(r'(?m)^name="Pack ', h)]
web_online = next((h, o) for h, o in main if 'name="Web Online"' in h)

out = []
for h, o in main:
    h = re.sub(r'(?m)^exclude_filter=".*"$', 'exclude_filter="tests/*,assets/kits/*"', h)
    out.append((h, o))
for kitdir in sorted(glob.glob(os.path.join(ROOT, "client", "assets", "kits", "*"))):
    kit = os.path.basename(kitdir)
    files = sorted(f'"res://assets/kits/{kit}/{os.path.basename(p)}"' for p in glob.glob(os.path.join(kitdir, "*.webp")))
    h = web_online[0]
    h = re.sub(r'(?m)^name=".*"$', f'name="Pack {kit}"', h)
    h = re.sub(r'(?m)^runnable=.*$', "runnable=false", h)
    h = re.sub(r'(?m)^export_filter=".*"$', 'export_filter="resources"', h)
    h = re.sub(r'(?m)^include_filter=".*"$', f'include_filter="assets/kits/{kit}/*.json"', h)
    h = re.sub(r'(?m)^exclude_filter=".*"$', 'exclude_filter=""', h)
    h = re.sub(r'(?m)^export_path=".*"$', f'export_path="../build/online/packs/{kit}.pck"', h)
    h = re.sub(r'(?m)^export_files=.*$', "", h)
    h = h.replace('export_filter="resources"', 'export_filter="resources"\nexport_files=PackedStringArray(' + ", ".join(files) + ")")
    out.append((h, web_online[1]))
res = []
for n, (h, o) in enumerate(out):
    res.append(re.sub(r"(?m)^\[preset\.\d+\]", f"[preset.{n}]", h).rstrip() + "\n\n")
    if o:
        res.append(re.sub(r"(?m)^\[preset\.\d+\.options\]", f"[preset.{n}.options]", o).rstrip() + "\n\n")
open(CFG, "w").write("".join(res).rstrip() + "\n")
print(len(out) - len(main), "pacotes de kit")
