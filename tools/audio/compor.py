#!/usr/bin/env python3
"""Sons e músicas do jogo, compostos e sintetizados aqui (obra original, sem amostras de terceiros).

  python3 tools/audio/compor.py   → client/assets/audio/*.ogg

Músicas (laços sem corte):
  - planalto.ogg — de dia: semba (≈112 BPM), guitarra dedilhada em terceiras, baixo a andar, dikanza (reco-reco) e ngoma;
  - noite.ogg    — à noite: kizomba (≈88 BPM), batida lenta, baixo redondo, acordes suaves.
Ambiente: chuva, grilos (noite), pássaros (dia).
Interface: toque, abrir telemóvel, moedas, sucesso, erro, SMS, porta.

Síntese: cordas pelo algoritmo de Karplus-Strong, baixo seno com envolvente, percussão por ruído filtrado.
"""
from __future__ import annotations

import os
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "client", "assets", "audio")
rng = np.random.default_rng(1912)  # ano da fundação do Huambo: tudo sai sempre igual


# ------------------------------------------------------------------ utilitários

def silence(sec: float) -> np.ndarray:
    return np.zeros(int(SR * sec), dtype=np.float64)


def env_adsr(n: int, a=0.005, d=0.08, s=0.6, r=0.1) -> np.ndarray:
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([np.linspace(0, 1, a_n, endpoint=False), np.linspace(1, s, d_n, endpoint=False), np.full(s_n, s), np.linspace(s, 0, r_n)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def lowpass(x: np.ndarray, hz: float, order=2) -> np.ndarray:
    b, a = butter(order, hz / (SR / 2), "low")
    return lfilter(b, a, x)


def highpass(x: np.ndarray, hz: float, order=2) -> np.ndarray:
    b, a = butter(order, hz / (SR / 2), "high")
    return lfilter(b, a, x)


def bandpass(x: np.ndarray, lo: float, hi: float, order=2) -> np.ndarray:
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], "band")
    return lfilter(b, a, x)


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def mix_at(buf: np.ndarray, x: np.ndarray, t: float, gain=1.0) -> None:
    i = int(t * SR) % len(buf)
    end = i + len(x)
    if end <= len(buf):
        buf[i:end] += x * gain
    else:  # dá a volta: o laço fica sem corte
        k = len(buf) - i
        buf[i:] += x[:k] * gain
        buf[: end - len(buf)] += x[k:] * gain


def save(name: str, x: np.ndarray, peak=0.85, quality=4) -> None:
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp = f.name
    data = x if x.ndim == 2 else np.stack([x, x], axis=1)
    wavfile.write(tmp, SR, (data * 32767).astype(np.int16))
    out = os.path.join(OUT, f"{name}.ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", str(quality), out], check=True)
    os.unlink(tmp)
    print(f"{name}.ogg  {len(x) / SR:5.1f} s  {os.path.getsize(out) // 1024} KB")


# ------------------------------------------------------------------ instrumentos

def pluck(freq: float, sec: float, bright=0.5, decay=0.996) -> np.ndarray:
    """Corda dedilhada (Karplus-Strong): guitarra / marimba de dedo."""
    n = int(SR * sec)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    buf = lowpass(buf, 1500 + 5000 * bright, 1)
    out = np.empty(n)
    idx = 0
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx + 1) % p
        buf[idx] = decay * 0.5 * (buf[idx] + buf[nxt])
        idx = nxt
    return out * env_adsr(n, 0.002, 0.05, 1.0, 0.05)


def bass(freq: float, sec: float) -> np.ndarray:
    n = int(SR * sec)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t)
    return x * env_adsr(n, 0.006, 0.12, 0.55, 0.06)


def pad(freqs: list[float], sec: float) -> np.ndarray:
    n = int(SR * sec)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t) for f in freqs)
    x = lowpass(x, 1800)
    return x * env_adsr(n, 0.35, 0.3, 0.8, 0.5)


def ngoma(sec=0.35, pitch=110.0, slap=False) -> np.ndarray:
    """Tambor de mão: tom grave a descer + estalo."""
    n = int(SR * sec)
    t = np.arange(n) / SR
    f = pitch * (1 + 0.6 * np.exp(-t * 30))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (14 if not slap else 22))
    click = bandpass(rng.normal(0, 1, n), 1500, 5000) * np.exp(-t * (80 if not slap else 40)) * (0.25 if not slap else 0.8)
    return body + click


def shaker(sec=0.09, gain=1.0) -> np.ndarray:
    """Dikanza / chocalho: ruído agudo curto."""
    n = int(SR * sec)
    t = np.arange(n) / SR
    return highpass(rng.normal(0, 1, n), 5000) * np.exp(-t * 45) * gain


def kick(sec=0.4) -> np.ndarray:
    n = int(SR * sec)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 25)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def snap(sec=0.18) -> np.ndarray:
    n = int(SR * sec)
    t = np.arange(n) / SR
    return bandpass(rng.normal(0, 1, n), 1200, 6000) * np.exp(-t * 28)


# ------------------------------------------------------------------ músicas

def semba() -> np.ndarray:
    """De dia: semba a ~112 BPM, 16 compassos em Ré maior (I–IV–V–I e variação vi–IV–I–V)."""
    bpm = 112
    beat = 60 / bpm
    bars = 16
    total = bars * 4 * beat
    L = np.zeros(int(total * SR))
    R = np.zeros(int(total * SR))
    D = 62  # Ré
    prog = [0, 5, 7, 0, 0, 5, 7, 7, 9, 5, 0, 7, 0, 5, 7, 0]  # graus em semitons a partir de Ré
    minor = {9}
    for bar, root in enumerate(prog):
        t0 = bar * 4 * beat
        third = 3 if root in minor else 4
        chord = [D + root, D + root + third, D + root + 7]
        # baixo a andar (semba): tónica, quinta, terceira, aproximação
        walk = [chord[0] - 24, chord[2] - 24, chord[1] - 24, chord[0] - 24 + (2 if bar % 2 else -1)]
        for k, nn in enumerate(walk):
            mix_at(L, bass(midi(nn), beat * 0.95), t0 + k * beat, 0.55)
            mix_at(R, bass(midi(nn), beat * 0.95), t0 + k * beat, 0.55)
        # guitarra dedilhada em colcheias, padrão sincopado típico (salta a 4.ª e 8.ª)
        pattern = [0, 1, 2, None, 1, 2, 0, None]
        for k, sel in enumerate(pattern):
            if sel is None:
                continue
            nn = chord[sel] + 12
            off = 0.5 * beat * k + (0.02 if k % 2 else 0)
            g = pluck(midi(nn), beat * 1.4, bright=0.55)
            mix_at(L, g, t0 + off, 0.30)
            mix_at(R, g, t0 + off + 0.008, 0.22)
        # melodia simples em terceiras nos compassos pares
        if bar % 2 == 1:
            mel = [chord[2] + 12, chord[1] + 12, chord[0] + 12]
            for k, nn in enumerate(mel):
                g = pluck(midi(nn), beat * 1.2, bright=0.75, decay=0.997) + 0.6 * pluck(midi(nn - 4), beat * 1.2, bright=0.7)
                mix_at(L, g, t0 + 2 * beat + k * 0.5 * beat, 0.16)
                mix_at(R, g, t0 + 2 * beat + k * 0.5 * beat, 0.22)
        # percussão: ngoma no 1 e no «e» do 2, estalo no 3; dikanza em semicolcheias
        for k in range(4):
            mix_at(L, ngoma(pitch=95), t0 + k * beat, 0.35 if k in (0, 2) else 0.15)
            mix_at(R, ngoma(pitch=95), t0 + k * beat, 0.35 if k in (0, 2) else 0.15)
        mix_at(L, ngoma(pitch=180, slap=True), t0 + 1.5 * beat, 0.22)
        mix_at(R, ngoma(pitch=200, slap=True), t0 + 3.5 * beat, 0.22)
        for k in range(16):
            acc = 1.0 if k % 4 == 2 else 0.55
            mix_at(L, shaker(gain=acc), t0 + k * beat / 4, 0.10)
            mix_at(R, shaker(gain=acc), t0 + k * beat / 4 + 0.004, 0.12)
    return np.stack([L, R], axis=1)


def kizomba() -> np.ndarray:
    """À noite: kizomba a ~88 BPM, 8 compassos em Lá menor (i–VI–III–VII)."""
    bpm = 88
    beat = 60 / bpm
    bars = 8
    total = bars * 4 * beat
    L = np.zeros(int(total * SR))
    R = np.zeros(int(total * SR))
    A = 57  # Lá
    prog = [(0, True), (8, False), (3, False), (10, False)] * 2
    for bar, (root, is_minor) in enumerate(prog):
        t0 = bar * 4 * beat
        third = 3 if is_minor else 4
        chord = [A + root, A + root + third, A + root + 7]
        # acordes suaves a segurar o compasso
        p = pad([midi(n) for n in chord], 4 * beat)
        mix_at(L, p, t0, 0.10)
        mix_at(R, p, t0 + 0.01, 0.10)
        # baixo redondo: 1, «e» do 2, 3
        for off, nn in [(0, chord[0] - 24), (1.5, chord[0] - 24), (2, chord[2] - 24), (3.5, chord[1] - 24)]:
            b = bass(midi(nn), beat * 1.1)
            mix_at(L, b, t0 + off * beat, 0.6)
            mix_at(R, b, t0 + off * beat, 0.6)
        # batida de kizomba: bombo 1 e 2.5, estalo no 2 e 4
        for off in (0, 2.5):
            mix_at(L, kick(), t0 + off * beat, 0.6)
            mix_at(R, kick(), t0 + off * beat, 0.6)
        for off in (1, 3):
            mix_at(L, snap(), t0 + off * beat, 0.25)
            mix_at(R, snap(), t0 + off * beat, 0.30)
        for k in range(8):
            mix_at(L, shaker(gain=0.7), t0 + k * beat / 2 + beat / 4, 0.06)
            mix_at(R, shaker(gain=0.7), t0 + k * beat / 2 + beat / 4, 0.07)
        # frase de guitarra a responder nos compassos ímpares
        if bar % 2 == 1:
            for k, nn in enumerate([chord[2] + 12, chord[1] + 12, chord[0] + 12, chord[1] + 12]):
                g = pluck(midi(nn), beat * 1.6, bright=0.4, decay=0.9975)
                mix_at(L, g, t0 + (2 + 0.5 * k) * beat, 0.18)
                mix_at(R, g, t0 + (2 + 0.5 * k) * beat + 0.01, 0.14)
    return np.stack([L, R], axis=1)


# ------------------------------------------------------------------ ambiente

def chuva(sec=12.0) -> np.ndarray:
    n = int(SR * sec)
    x = lowpass(rng.normal(0, 1, n), 5000) * 0.5 + highpass(rng.normal(0, 1, n), 3000) * 0.25
    for _ in range(int(sec * 60)):  # gotas
        mix_at(x, bandpass(rng.normal(0, 1, 600), 2000, 7000) * np.exp(-np.arange(600) / 60), rng.uniform(0, sec), rng.uniform(0.2, 0.8))
    fade = int(0.5 * SR)
    x[:fade] = x[:fade] * np.linspace(0, 1, fade) + x[-fade:] * np.linspace(1, 0, fade)  # cruza o fim com o início
    return x[: n - fade]


def grilos(sec=10.0) -> np.ndarray:
    n = int(SR * sec)
    x = np.zeros(n)
    for f0 in (4200, 4700, 5100):
        period = rng.uniform(0.45, 0.8)
        t = rng.uniform(0, period)
        while t < sec:
            m = int(0.12 * SR)
            tt = np.arange(m) / SR
            chirp = np.sin(2 * np.pi * f0 * tt) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 30 * tt))) * env_adsr(m, 0.01, 0.02, 0.8, 0.03)
            mix_at(x, chirp, t, rng.uniform(0.15, 0.35))
            t += period * rng.uniform(0.9, 1.1)
    x += lowpass(rng.normal(0, 1, n), 400) * 0.03  # ar da noite
    return x


def passaros(sec=14.0) -> np.ndarray:
    n = int(SR * sec)
    x = lowpass(rng.normal(0, 1, n), 300) * 0.02  # rumor distante da cidade
    t = 0.3
    while t < sec - 1:
        notes = rng.integers(2, 5)
        f = rng.uniform(2200, 3600)
        for _ in range(notes):
            m = int(rng.uniform(0.06, 0.14) * SR)
            tt = np.arange(m) / SR
            sweep = f * (1 + rng.uniform(-0.25, 0.25) * tt / tt[-1])
            s = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * env_adsr(m, 0.01, 0.02, 0.7, 0.03)
            mix_at(x, s, t, rng.uniform(0.15, 0.3))
            t += m / SR + 0.04
        t += rng.uniform(0.8, 2.6)
    return x


# ------------------------------------------------------------------ interface

def tone(freq, sec, kind="sine", a=0.004, r=0.08) -> np.ndarray:
    n = int(SR * sec)
    t = np.arange(n) / SR
    w = np.sin(2 * np.pi * freq * t) if kind == "sine" else np.sign(np.sin(2 * np.pi * freq * t)) * 0.4
    return w * env_adsr(n, a, sec * 0.3, 0.5, r)


def ui_sounds() -> dict[str, np.ndarray]:
    s: dict[str, np.ndarray] = {}
    # toque: marimba curtinha
    s["toque"] = pluck(midi(84), 0.12, bright=0.9, decay=0.98) * 0.8
    # abrir o telemóvel: dois toques a subir
    a = np.zeros(int(0.25 * SR))
    mix_at(a, pluck(midi(79), 0.18, 0.8, 0.99), 0)
    mix_at(a, pluck(midi(86), 0.18, 0.8, 0.99), 0.07)
    s["telemovel"] = a
    # moedas: três tilintares metálicos
    c = np.zeros(int(0.45 * SR))
    for k, f in enumerate((2637, 3136, 3951)):
        n = int(0.25 * SR)
        tt = np.arange(n) / SR
        ding = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 2.76 * tt)) * np.exp(-tt * 18)
        mix_at(c, ding, k * 0.06, 0.6)
    s["moedas"] = c
    # sucesso (missão, conquista): arpejo maior
    w = np.zeros(int(0.7 * SR))
    for k, nn in enumerate((72, 76, 79, 84)):
        mix_at(w, pluck(midi(nn), 0.5, 0.8, 0.995), k * 0.08, 0.7)
    s["sucesso"] = w
    # erro: dois tons graves a descer
    e = np.zeros(int(0.35 * SR))
    mix_at(e, tone(330, 0.14), 0, 0.6)
    mix_at(e, tone(262, 0.18), 0.12, 0.6)
    s["erro"] = lowpass(e, 2500)
    # SMS: ping duplo
    p = np.zeros(int(0.4 * SR))
    mix_at(p, tone(1568, 0.12, r=0.1), 0, 0.5)
    mix_at(p, tone(2093, 0.2, r=0.15), 0.1, 0.5)
    s["sms"] = p
    # porta: estalo de madeira + rangido curto
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    knock = bandpass(rng.normal(0, 1, n), 200, 1200) * np.exp(-tt * 30)
    creak = np.sin(2 * np.pi * np.cumsum(300 + 120 * np.sin(2 * np.pi * 7 * tt)) / SR) * np.exp(-tt * 9) * 0.15
    s["porta"] = knock + creak
    return s


def main() -> None:
    save("planalto", semba(), peak=0.8, quality=4)
    save("noite", kizomba(), peak=0.8, quality=4)
    save("chuva", chuva(), peak=0.7, quality=3)
    save("grilos", grilos(), peak=0.5, quality=3)
    save("passaros", passaros(), peak=0.5, quality=3)
    for k, v in ui_sounds().items():
        save(k, v, peak=0.8, quality=5)


if __name__ == "__main__":
    main()
