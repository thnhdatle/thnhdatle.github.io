---
layout: page
title: Foreman
description: Background jobs easily fall out of sync with the application data that creates them. Foreman is a lightweight job queue that keeps jobs consistent with application data and shares capacity fairly across tenants, achieving high throughput with minimal infrastructure.
importance: 5
category: open-source
selected: false
github: https://github.com/thnhdatle/foreman
period: "2026 – present"
img: assets/img/projects/foreman-architecture.png
demo: /projects/foreman/demo/
---

<div class="oss-links">
  <a class="oss-btn" href="{{ page.demo | relative_url }}" target="_blank" rel="noopener"><i class="fa-solid fa-play"></i> Demo</a>
  <a class="oss-btn" href="{{ page.github }}"><i class="fa-brands fa-github"></i> GitHub</a>
  <a class="oss-btn" href="{{ page.github }}/releases"><i class="fa-solid fa-tag"></i> Releases</a>
</div>

## Problem

Background jobs often live in Redis or RabbitMQ, a second system that cannot join your database transaction. A job can be enqueued for data that was rolled back, or lost for data that was committed.

## Approach

Foreman stores jobs as rows in the Postgres you already run.

- **Transactional enqueue.** A job is written in your transaction, so it exists only if the transaction commits.
- **Low-latency pickup.** Postgres LISTEN/NOTIFY wakes producers as soon as jobs arrive.
- **Leader duties.** Every client fetches and runs jobs, while one elected leader schedules, runs periodic jobs, rescues stuck jobs and cleans up.
- **Fairness.** Concurrency is limited per tenant, so tenants share capacity fairly.

<div style="max-width: 490px; margin: 1.5rem auto;">
{% include figure.liquid path="assets/img/projects/foreman-architecture.png" alt="Foreman architecture" class="img-fluid rounded z-depth-1" zoomable=true %}
</div>

## Results

| Scenario                                                    | Result            |
| ----------------------------------------------------------- | ----------------- |
| Throughput, no-op jobs, 4 clients × 50 workers, 5 min       | 35,518 jobs/s     |
| Pickup latency p99 at 1,000 inserts/s, 2 min                | 8.7 ms            |
| Small tenant p95 wait behind a 240k backlog, fair vs unfair | 38 ms vs 64.6 s   |
| 1 h soak at 1,000 jobs/s: table size drift, p99 drift       | 0.3%, -0.1%       |

Open-model load: inserts at a fixed rate, never waiting for workers. Median of 3 runs.
