---
layout: page
title: Loupe
description: LLM applications are hard to debug and their costs are hard to track in production. Loupe is a lightweight observability tool that records every LLM call and explains failures and slowdowns, achieving high throughput with a small footprint.
importance: 3
category: open-source
selected: false
github: https://github.com/thnhdatle/loupe
period: "2026 – present"
img: assets/img/projects/loupe-architecture.png
demo: /projects/loupe/demo/
---

<div class="oss-links">
  <a class="oss-btn" href="{{ page.demo | relative_url }}" target="_blank" rel="noopener"><i class="fa-solid fa-play"></i> Demo</a>
  <a class="oss-btn" href="{{ page.github }}"><i class="fa-brands fa-github"></i> GitHub</a>
  <a class="oss-btn" href="{{ page.github }}/releases"><i class="fa-solid fa-tag"></i> Releases</a>
</div>

## Problem

LLM failures and cost spikes show up in production traces, not in tests. Many self-hosted tools need several databases and services, or a proprietary trace schema.

## Approach

Loupe is one binary and one SQLite file, with retention and a disk cap.

- **Ingest.** Receivers decode OTLP traces, normalise them, apply the content policy and add cost.
- **Storage.** A bounded queue feeds a single writer that commits batches to SQLite in WAL mode, while the REST API and dashboard read the same file.
- **Analysis.** An optional Analyze step points any OpenAI-compatible model at a failing or slow trace to explain it.

Any OpenTelemetry SDK can send traces to it directly.

<div style="max-width: 784px; margin: 1.5rem auto;">
{% include figure.liquid path="assets/img/projects/loupe-architecture.png" alt="Loupe architecture" class="img-fluid rounded z-depth-1" zoomable=true %}
</div>

## Results

| Scenario                          | Result                                  |
| --------------------------------- | --------------------------------------- |
| Sustained ingest, 3 × 10 min      | 3,001 spans/s, 0 lost, peak RSS 213 MiB |
| Single-writer capacity            | 15,000 spans/s                          |
| Query p95 at 2M spans / 30 days   | 0.058 s (worst of 8 queries)            |

OTLP/HTTP protobuf at a constant arrival rate, native binary, default config, fresh database per run.
