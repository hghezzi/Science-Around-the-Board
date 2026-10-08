#!/usr/bin/env python3
"""Draw the demo's question images (public/questionImages/sab_*.png) from synthetic data.

Every figure is made here from made-up numbers, so the project can publish it
under its content licence (CC BY-NC-SA 4.0; see LICENSE). Run: python3 scripts/make-demo-images.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.patches import FancyArrowPatch, Rectangle  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "public" / "questionImages"
OUT.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "savefig.dpi": 150})
rng = np.random.default_rng(475)


def save(fig, name):
    fig.savefig(OUT / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", name)


def amplicon_diagram():
    """The 16S gene: 9 variable regions between constant ones; V3–V4 amplified with barcoded primers."""
    fig, ax = plt.subplots(figsize=(11, 4.4))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 44)
    ax.axis("off")
    const, var = "#3b82f6", "#e9b8b0"
    # Alternating constant (blue) and variable (pink) segments along the gene.
    edges = [0, 6, 9, 12, 17, 26, 31, 36, 41, 50, 54, 59, 64, 69, 74, 80, 85, 90, 94, 100]
    var_names = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9"]
    v = 0
    for i in range(len(edges) - 1):
        is_var = i % 2 == 1
        ax.add_patch(Rectangle((edges[i], 20), edges[i + 1] - edges[i], 3, color=var if is_var else const))
        if is_var:
            ax.text((edges[i] + edges[i + 1]) / 2, 15.5, var_names[v], ha="center", fontsize=14)
            v += 1
    # Amplicon over V3–V4: primers (blue, on constant sites) with barcodes (orange tails).
    ax.add_patch(Rectangle((19, 25), 28, 2.2, color=const))
    ax.plot([16, 19], [30, 26], color="#ea580c", lw=7, solid_capstyle="butt")
    ax.plot([47, 50], [26, 30], color="#ea580c", lw=7, solid_capstyle="butt")
    arrow = dict(arrowstyle="-|>", mutation_scale=16, color="black", lw=1.4)
    ax.add_patch(FancyArrowPatch((12, 39), (16.5, 31), **arrow))
    ax.text(12, 40, "Sample barcode", ha="center", fontsize=14)
    ax.add_patch(FancyArrowPatch((44, 39), (42, 27.8), **arrow))
    ax.text(44, 40, "Primer (binds a constant region)", ha="center", fontsize=14)
    # Targeted region bracket under V3–V4.
    ax.plot([26, 26, 41, 41], [12, 10, 10, 12], color="#1e3a8a", lw=2)
    ax.text(33.5, 6.5, "Targeted region", ha="center", fontsize=14, color="#1e3a8a")
    ax.text(80, 33, "Constant regions (blue)\nVariable regions (pink)", ha="center", fontsize=13)
    ax.text(0, 1, "16S rRNA gene (about 1,500 bp)", fontsize=17, fontweight="bold")
    save(fig, "sab_16s_amplicon.png")


def quality_plot():
    """Interactive-quality-plot style box plots: high quality until ~235, then a steep drop."""
    pos = np.arange(1, 301)
    median = np.where(pos < 235, 38, 38 - (pos - 235) * 0.32)
    median = np.clip(median + rng.normal(0, 0.25, pos.size), 8, 38.5)
    spread = np.where(pos < 200, 1.0, 1.0 + (pos - 200) * 0.09)
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.fill_between(pos, np.clip(median - 2 * spread, 2, 40), np.clip(median + 0.8, 0, 40), color="#cbd5e1", label="Middle 90% of reads")
    ax.fill_between(pos, np.clip(median - spread, 2, 40), np.clip(median + 0.4, 0, 40), color="#64748b", label="Middle 50% of reads")
    ax.plot(pos, median, color="#0f172a", lw=1.5, label="Median")
    ax.set_xlim(0, 300)
    ax.set_ylim(0, 42)
    ax.set_xticks(range(0, 301, 20))
    ax.set_xlabel("Sequence base (position in the read)")
    ax.set_ylabel("Quality score (Phred)")
    ax.set_title("Forward reads: quality at each position")
    ax.legend(loc="lower left", frameon=False)
    ax.grid(axis="y", color="#e2e8f0")
    save(fig, "sab_quality_plot.png")


def rarefaction():
    """Alpha rarefaction: observed features vs depth, one line per sample, flattening above ~3,000 reads."""
    depths = np.array([1, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000])
    fig, ax = plt.subplots(figsize=(10, 4.6))
    colors = plt.cm.tab10(np.linspace(0, 1, 10))
    for i, top in enumerate(np.linspace(32, 88, 10)):
        y = top * (1 - np.exp(-depths / 900)) + rng.normal(0, 0.8, depths.size)
        y[0] = 1
        ax.plot(depths, y, marker="s", markersize=5, mfc="white", color=colors[i], lw=1.4)
    ax.set_xlabel("Sequencing depth (reads per sample)")
    ax.set_ylabel("observed_features")
    ax.set_xlim(-200, 5200)
    ax.set_ylim(0, 95)
    ax.set_title("Alpha rarefaction (one line per sample)")
    ax.grid(color="#e2e8f0")
    save(fig, "sab_rarefaction.png")


def pcoa():
    """Two ordinations: no structure before filtering; three clusters along PC1 (96.55%) after."""
    fig, (a, b) = plt.subplots(1, 2, figsize=(12, 4.6))
    x, y = rng.normal(0, 0.9, 45), rng.normal(0, 1.0, 45)
    a.scatter(x, y, color="#334155", s=28)
    a.set_title("Before filtering", fontsize=15)
    a.set_xlabel("PC1 (28.76%)")
    a.set_ylabel("PC2 (20.15%)")
    cols = {"1": "#ef4444", "2": "#16a34a", "3": "#3b82f6"}
    for name, cx in (("1", 0.0), ("2", -0.15), ("3", 0.18)):
        b.scatter(cx + rng.normal(0, 0.04, 15), rng.normal(0, 0.13, 15), color=cols[name], s=28, label=name)
    b.set_title("After filtering", fontsize=15)
    b.set_xlabel("PC1 (96.55%)")
    b.set_ylabel("PC2 (2.78%)")
    b.legend(title="cluster", frameon=False, loc="center left", bbox_to_anchor=(1.01, 0.5))
    for ax in (a, b):
        ax.grid(color="#e2e8f0")
        ax.set_axisbelow(True)
    fig.tight_layout()
    save(fig, "sab_pcoa.png")


def fastq():
    """Eight numbered lines of FASTQ: two made-up reads (header, sequence, +, quality)."""
    lines = [
        "@SAB_DEMO:1:FC01:1:1101:1520:2033 1:N:0:1",
        "TACGGAGGGTGCAAGCGTTAATCGGAATTACTGGGCGTAAAGCGCACG",
        "+",
        "CCCCCGGGGGGGGGGGGGGGGGGGGGGGGGGGGGFGGGGGGGGGGGG<",
        "@SAB_DEMO:1:FC01:1:1101:1874:2041 1:N:0:1",
        "TACGTAGGGGGCAAGCGTTATCCGGATTTACTGGGTGTAAAGGGAGCG",
        "+",
        "CCCCCGGGGGGGGGGGGFGGGGGGGGGGGGGGGGGGGG8EGGGGGGG,",
    ]
    fig, ax = plt.subplots(figsize=(10, 2.9))
    ax.axis("off")
    ax.add_patch(Rectangle((0.04, 0.0), 0.95, 1.0, fill=False, lw=1.2, transform=ax.transAxes))
    for i, text in enumerate(lines):
        yy = 0.93 - i * 0.122
        ax.text(0.0, yy, str(i + 1), family="DejaVu Sans Mono", fontsize=12, transform=ax.transAxes, va="top")
        ax.text(0.07, yy, text, family="DejaVu Sans Mono", fontsize=12, transform=ax.transAxes, va="top")
    save(fig, "sab_fastq.png")


amplicon_diagram()
quality_plot()
rarefaction()
pcoa()
fastq()
