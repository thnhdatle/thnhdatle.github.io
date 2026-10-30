---
layout: page
title: Wake
description: Keeping downstream services and caches in sync with the primary database is error-prone. Wake is a lightweight change-streaming service that delivers every database change downstream and keeps caches up to date, achieving reliable, low-latency synchronization.
importance: 4
category: open-source
selected: false
github: https://github.com/thnhdatle/wake
period: "2026 – present"
img: assets/img/projects/wake-architecture.png
demo: /projects/wake/demo/
---

<div class="oss-links">
  <a class="oss-btn" href="{{ page.demo | relative_url }}" target="_blank" rel="noopener"><i class="fa-solid fa-play"></i> Demo</a>
  <a class="oss-btn" href="{{ page.github }}"><i class="fa-brands fa-github"></i> GitHub</a>
  <a class="oss-btn" href="{{ page.github }}/releases"><i class="fa-solid fa-tag"></i> Releases</a>
</div>

## Problem

Polling misses changes, triggers slow down writes, and dual writes drift. Debezium needs the JVM and usually Kafka Connect, while home-grown WAL readers tend to lose events on restart or during the first snapshot.

## Approach

Wake is one static Go binary that reads one replication slot.

- **Ordering.** It assembles each transaction and routes it to the sinks at commit.
- **Durability.** WAL is confirmed to Postgres only after every sink holds the change, so events are replayed after a crash.
- **Snapshots.** A snapshotter covers existing rows before streaming starts.
- **Cache.** An invalidator removes changed keys from Redis and from every in-process L1 cache, so the cache library stays correct when data changes outside your application.

<div style="max-width: 784px; margin: 1.5rem auto;">
{% include figure.liquid path="assets/img/projects/wake-architecture.png" alt="Wake architecture" class="img-fluid rounded z-depth-1" zoomable=true %}
</div>

## Results

| Scenario                                                       | Result                        |
| -------------------------------------------------------------- | ----------------------------- |
| Postgres → Kafka, single-row inserts offered at 5,000 tx/s     | 4,999.7 events/s, p99 12 ms   |
| CDC invalidation latency, commit → key gone from L1 on 3 nodes | p99 18.5 ms                   |
| In-process cache read, one goroutine, 64-byte value             | 55.8 ns/op, 0 allocs/op       |

Throughput is the median of 3 runs.
