---
layout: page
title: LLM Platform for Industry and Research
description: Industrial and research teams need LLMs on data that cannot leave the organization. LLM Platform for Industry and Research is an end-to-end platform that serves open-weight models on in-house GPUs with governed access for every team, aiming at private and reliable LLM use.
importance: 0
category: research-industry
selected: true
period: "2025 – present"
img: assets/img/projects/llm-platform-thumbnail.jpg
---

## Problem

Factories hold process data, maintenance records and design documents that cannot be sent to a cloud API, and research groups work with unpublished data under the same constraint. Open-weight models are now good enough to run in-house, but a model on a GPU is not yet something people can use. Each project ends up rebuilding the same pieces around it: serving, authentication, document retrieval and monitoring. GPUs are scarce and expensive, so they also have to be shared across teams.

## Approach

The platform turns in-house GPUs into one shared LLM service, from the hardware up to the application.

- **Serving.** Open-weight models run on the GPU cluster behind a single OpenAI-compatible API, so the same capacity serves many users and applications at once.
- **Gateway.** Every request is authenticated and attributed to a user and a team, with quotas and routing across the available models.
- **Knowledge.** Teams connect their own documents, and answers are grounded in the documents each user is allowed to see.
- **Applications.** A web interface for chat and document workflows, with the same API open to research code and industrial systems.
- **Operations.** Usage, latency and failures are tracked across every layer, so capacity and quality problems become visible early.

Industry and research share one platform because they need the same foundation: private data, shared GPUs and controlled access. Only the applications on top differ.

## My role

Technical lead. I own the architecture across the frontend, backend, infrastructure and LLM-serving layers, and lead the platform from design to deployment.

## Status

In active development.

Built at OHLabs and NBM Lab, Pukyong National University.

<p class="caption">Thumbnail: NVIDIA HGX B200 GPU baseboard, photo by <a href="https://commons.wikimedia.org/wiki/File:Nvidia_DGX-B200-HGX.jpg">Pokiiri</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, cropped.</p>
