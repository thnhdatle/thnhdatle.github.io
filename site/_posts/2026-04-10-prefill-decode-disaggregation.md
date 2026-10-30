---
layout: post
title: Start Together, Split Later
date: '2026-08-04'
permalink: /blog/think/prefill-decode-disaggregation/
description: Things start out bundled because the only goal is to make them work. When the goal changes, the bundle starts to cost something, and that's when people pull it apart.
tags:
- mlsys
- llm
- systems
- inference
- distributed-systems
categories:
- think
cover: /assets/img/blog/prefill-decode-disaggregation.jpg
image_credit: https://pin.it/4CwqvS13D
---

When something new has to work at all, nobody asks whether it's put together the right way. Early on, a lot of things are built as one lump. That isn't carelessness. If the only question is whether it works, the fastest way to an answer is to keep everything in one place.

I think that's what happened with serving large language models. For a while the question was mostly whether it could be done at all, and for that question, one job on one set of chips was a sensible answer.

Then the question changed. It stopped being "does it run" and became "how quickly does it respond, and what does it cost." A bundle that was fine for the first question started to show a price. That's how bundles usually go. They hide what they cost until you start measuring something they were never measured on.

Here is the price in this case. When you send a model a prompt, two different things happen. First it reads the whole prompt. Then it writes its answer, one small piece at a time.

They don't have the same character. Reading is mostly arithmetic: a lot of computation, done in parallel, and the chip stays busy. Writing is mostly waiting. Each small piece needs the model's weights fetched from memory, and the arithmetic hardly gets used. Roughly speaking, one job wants fast computation and the other wants fast memory.

Put them on the same chips and they get in each other's way. A long prompt being read holds up the answers being written for other people. A crowd of answers being written holds up new prompts. You can tune the setup to favor one, but then you're taxing the other.

One well-known paper, DistServe, argues for pulling them apart. One group of chips only reads prompts, another only writes answers, and each can be set up for its own job. [1] Serving stacks such as NVIDIA's Dynamo now document this as a supported way to run, which suggests it's no longer exotic. [2]

It isn't free. What the first job produces is something the second job needs, so it has to be handed over, and handing it over takes time. That's the price of pulling things apart. It's only worth paying if what you save is bigger.

<!-- cover -->
<figure>
  <img src="{{ '/assets/img/blog/prefill-decode-disaggregation.jpg' | relative_url }}" alt="">
  <figcaption>One board, many different jobs.</figcaption>
</figure>

None of this means the first design was a mistake. It was the right answer to the question people were asking. It was simple, and it had no handoff. And because pulling apart has a price, I'd expect there are cases where keeping things together is still better.

Databases have a version of the same story. Run large analytical queries on the system that handles everyday transactions, and the transactions slow down. So organizations learned to keep a separate system for analysis. [3] Different field, same pattern: a bundle that made sense for one question, a new question, a cost nobody had measured, and then a separation.

I'm not claiming it only goes in one direction. But I suspect it's one of the ways a field shows it has grown up. It starts separating things that used to be one.

What else is still bundled the way these were? I don't know, and I don't think you can tell from the outside. Pick a system you know well and ask what question it was built to answer, and whether that's still the question you're asking.

How do you notice early? I don't have a method. There are a few signs I'd look for. A setting you can never get right, because it would have to be two different things. Two numbers you care about that always trade against each other. One part of the system busy while another part sits idle.

Underneath all of them is the same thing: the question changed and the design didn't. The design wasn't wrong. It was answering a question nobody was asking anymore. The hard part is noticing that.

**Notes**

[1] Zhong et al., "DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving," OSDI 2024. The paper's argument is that running both phases together causes interference between them and ties their resource choices together, so it runs each phase on separate GPUs.

[2] See the [NVIDIA Dynamo documentation on disaggregated serving](https://docs.nvidia.com/dynamo/v1.0.0/design-docs/disaggregated-serving).

[3] This is the standard argument for keeping a data warehouse separate from operational databases. I'm using it as an illustration, not as a history of who did it first or when.
