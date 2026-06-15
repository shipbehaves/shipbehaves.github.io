# shipbehaves.github.io

A small research site. The first thing it hosts is an interactive **Trustworthy-AI Scorecard**
for the [`regulated-evals`](https://github.com/shipbehaves/regulated-evals) project — *is any
current frontier model ready, out of the box, for regulated finance?*

**Live:** https://shipbehaves.github.io

## What you're looking at

Ten models (Claude Opus 4.8, GPT-5, Gemini 2.5 Pro, DeepSeek-V3.1, Mistral-Large, Qwen-2.5-72B,
and four small open-weight models), graded on two deployment profiles against **preregistered,
regulation-anchored bars** — judgment cases scored by a cross-family LLM panel that was first
calibrated to a human rater. The headline: **no model is bare-ready.** The value is the *spread*
— which requirement each model fails, and the system wrap a deployer must build around it.

The dashboard is deliberately honest: no single 0–100 score, readiness foregrounded, and every
cell is clickable down to the **actual model response and the three judges' votes** behind the
verdict.

## How it's built (and why you can trust it)

Fully static — no backend, no analytics, hand-rolled SVG charts. The single data file
(`assets/data.json`) is generated from the **committed** scorecards, transcripts, and calibration
results in the public `regulated-evals` repo, using *that repo's own scorer* — so every number on
this page is byte-identical to the cards, and re-derivable from frozen transcripts (`make repro`
in `regulated-evals`).

```bash
# regenerate assets/data.json from a local clone of regulated-evals
RE=/path/to/regulated-evals python3 build/build_data.py
```

## Caveat

These are **model-behavior cards — not a conformity assessment, not certification, not legal
advice.** A green result is model-layer only and does not certify a deployed system. Scenarios
are synthetic.

Built by [@shipbehaves](https://github.com/shipbehaves) · [x.com/shipbehaves](https://x.com/shipbehaves)
