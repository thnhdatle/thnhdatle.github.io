---
layout: page
title: Footnote
description: Answering questions over private documents usually demands complex infrastructure. Footnote is a lightweight RAG engine that answers questions from your documents with verifiable sources, delivering accurate answers with minimal setup.
importance: 1
category: open-source
selected: false
github: https://github.com/thnhdatle/footnote
period: "2026 – present"
img: assets/img/projects/footnote-architecture.png
demo: /projects/footnote/demo/
---

<div class="oss-links">
  <a class="oss-btn" href="{{ page.demo | relative_url }}" target="_blank" rel="noopener"><i class="fa-solid fa-play"></i> Demo</a>
  <a class="oss-btn" href="{{ page.github }}"><i class="fa-brands fa-github"></i> GitHub</a>
  <a class="oss-btn" href="{{ page.github }}/releases"><i class="fa-solid fa-tag"></i> Releases</a>
</div>

## Problem

Grounded answers usually mean running a vector database, a search engine and a queue next to the database you already have. That is more systems to back up, secure and keep consistent with each other.

## Approach

Footnote keeps documents, vectors, indexes, jobs and tenants in Postgres with pgvector, so one backup and one set of credentials cover everything.

- **Ingestion.** Uploads become jobs in Postgres. A worker parses, chunks and embeds each file, then swaps in the new version in one transaction.
- **Query.** Full-text and vector search run together, and a cross-encoder reranks the results.
- **Evidence gate.** The LLM is called only when the evidence is strong enough, and the engine abstains when it is weak.
- **Citations.** Every answer cites its passages, and the citations are verified before they are returned.

The language model is any OpenAI-compatible endpoint.

<div style="max-width: 784px; margin: 1.5rem auto;">
{% include figure.liquid path="assets/img/projects/footnote-architecture.png" alt="Footnote architecture" class="img-fluid rounded z-depth-1" zoomable=true %}
</div>

## Results

| Scenario                                    | Result   |
| ------------------------------------------- | -------- |
| SciFact retrieval, hybrid + rerank nDCG@10  | 0.7093   |
| SciFact retrieval, hybrid + rerank recall@10 | 0.8429   |
| Hybrid + rerank latency p95, 100,000 chunks | 368.2 ms |

Retrieval on the 300 SciFact test claims. Latency over 1,000 queries against 100,000 chunks, median of 3 runs.
