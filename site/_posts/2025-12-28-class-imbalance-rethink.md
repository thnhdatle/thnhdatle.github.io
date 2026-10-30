---
layout: post
title: The Architectural Approach to Class Imbalance
date: '2025-12-28'
permalink: /blog/think/class-imbalance-rethink/
description: Every solution to class imbalance touches the same place. Nobody asks why the model fails on rare classes in the first place.
tags:
- machine-learning
- deep-learning
- class-imbalance
- architecture
categories:
- think
cover: /assets/img/blog/class-imbalance-rethink.jpg
image_credit: https://pin.it/3A1Ps7iLZ
---

Almost every paper on class imbalance starts the same way. Most of the data belongs to one class, and there's a bar chart where one bar is far taller than the others. Then comes a method for oversampling, reweighting, or augmenting the data a little more cleverly.

After reading enough of them, I noticed that the solutions all touch the same two places: the data, or the loss function. SMOTE makes synthetic samples. Focal loss turns down the weight of easy examples. Class weighting scales gradients by inverse frequency. The names differ, but the move is the same: make up for the imbalance by changing what the model sees, or how much it cares.

For a long time I took this to be the natural shape of the problem. The class is rare, so you need more of it, or you need the model to care about it more. It seemed to follow.

Then I started asking a different question: *why does the model fail on rare classes in the first place?*


The obvious answer is that it hasn't seen enough examples. That's true, as far as it goes. But a model trained on perfectly balanced data can still struggle with a rare class if it looks like a common one. And a model trained on very imbalanced data can sometimes learn a rare class just fine, if the class is distinctive enough. The number of examples matters. It just isn't the whole story.

The part that took me longer to see is about structure. In a standard multi-class classifier, all the classes share one softmax. Softmax is zero-sum: the more confident the model gets about one class, the less confident it is about every other. If 85% of your training samples belong to one class, that class dominates the gradient signal. Not because each sample counts for more, but because it's in most batches, most of the time. So the rare class doesn't just have fewer examples. It has to fight the dominant class for probability mass on every forward pass, for the whole training run.

You can turn up the loss multiplier on the rare class. But it's still the same race with the same structural disadvantage. You're just adding weight to the other runner's shoes.

<!-- cover -->
<figure>
  <img src="{{ '/assets/img/blog/class-imbalance-rethink.jpg' | relative_url }}" alt="">
  <figcaption>Two classes, very different sizes.</figcaption>
</figure>

This is a different kind of problem from "not enough data." It's a competition problem. And competition problems have architectural solutions.


The fix is simpler than it sounds. "Is there a defect?" and "which kind of defect?" are two separate questions, so don't make them compete in the same softmax. Send the dominant class through its own binary decision first. Then let the defect classifier work on what's left, where the classes are much more balanced. One way to build this is a hierarchical slimmable network: narrow sub-networks make the coarse decisions, and wider ones do the fine-grained classification.

If the dominant class exits before it reaches the defect classifier, it can't drown out the rare class's gradient. Whether that alone closes the gap depends on the problem. But structurally, the competition is gone.

The standard toolkit still works. Focal loss and class weighting help at the edges. But they work around a structural problem, they don't fix it, and there's a ceiling to how much working around can do. A cleaner decomposition doesn't have the same ceiling.


That raises a question I find uncomfortable. If class imbalance has an architectural fix, then some of what we call a data problem is really a problem with how we defined the task. So how many other "data problems" in machine learning are architecture problems we haven't looked at from the right angle?
