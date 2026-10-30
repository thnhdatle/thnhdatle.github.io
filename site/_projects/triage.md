---
layout: page
title: Triage
description: Teams using multiple LLMs struggle to balance cost, quality and privacy on every request. Triage is an LLM request router that sends each request to the most suitable model while protecting sensitive data, cutting cost with negligible overhead.
importance: 2
category: open-source
selected: false
github: https://github.com/thnhdatle/triage
period: "2026 – present"
img: assets/img/projects/triage-architecture.png
demo: /projects/triage/demo/
---

<div class="oss-links">
  <a class="oss-btn" href="{{ page.demo | relative_url }}" target="_blank" rel="noopener"><i class="fa-solid fa-play"></i> Demo</a>
  <a class="oss-btn" href="{{ page.github }}"><i class="fa-brands fa-github"></i> GitHub</a>
  <a class="oss-btn" href="{{ page.github }}/releases"><i class="fa-solid fa-tag"></i> Releases</a>
</div>

## Problem

Teams that run local models and also pay for cloud models usually send everything to one place. They either pay cloud prices for easy prompts or accept lower quality on hard ones. Sensitive prompts reach cloud providers because nothing checks them on the way.

## Approach

Every request passes a fixed pipeline: privacy detection, rules, difficulty scoring and target selection.

- **Difficulty.** Each request is scored, and the score decides between a local and a cloud model.
- **Privacy.** Detectable PII is replaced by placeholders before a request is sent to a cloud target.
- **Health.** Target selection skips models that fail health checks, and dispatch falls back on failure.
- **Explainability.** Every decision is recorded with its reason, and the response headers show where a request went.

Clients keep using the OpenAI API and only change the base URL.

<div style="max-width: 784px; margin: 1.5rem auto;">
{% include figure.liquid path="assets/img/projects/triage-architecture.png" alt="Triage architecture" class="img-fluid rounded z-depth-1" zoomable=true %}
</div>

## Results

| Scenario                                | Result              |
| --------------------------------------- | ------------------- |
| Router overhead p99 at 500 RPS          | 1.731 ms            |
| Highest sustained throughput, p99 there | 7,999 RPS, 6.153 ms |
| Learned scoring p99 at 5 RPS            | 164 ms              |

Overhead is paired: each request goes at the same instant directly to a zero-latency fake upstream and through Triage. Length-based difficulty scoring with PII masking, medians of 3 runs.
