---
layout: post
title: Making AI Models Smaller, Faster, and More Efficient
date: '2026-10-25'
permalink: /blog/think/designing-small-models/
description: Almost every way of making a model lighter does the same job for less. There is another lever, which is to make the job itself smaller.
tags:
- efficient-ai
- deep-learning
- representation
- edge-ai
- machine-learning
categories:
- think
---

Ask almost anyone working on efficient models what they're trying to do and they'll give you some version of the title. Smaller, faster, cheaper to run. It's a good goal, and most of the work done toward it is good work.

But look at the techniques and you'll notice they have something in common. Quantization stores the same numbers in fewer bits. Pruning removes the weights that matter least. Distillation trains a small model to imitate a big one. Efficient architectures swap expensive operations for cheaper ones that do almost the same thing. Compilers squeeze more out of the chip. Each of these takes a job as given and does it for less.

That's a reasonable thing to do when you have a job. But it hides an assumption, and I think the assumption is worth noticing: that the job is fixed.

It isn't.

When you hand a model raw input and a label, you're asking it to do two things at once. One is to produce the answer. The other is to work out, from scratch, which parts of the input are worth paying attention to in the first place. The second job is easy to overlook, and the model does it again every time it runs. A network trained end to end isn't just answering. On every input, it is redoing the work of deciding what matters.

Often, most of the input doesn't.

There's a well-known result from the study of chess that fits here. Show a master a position from a real game and they can reconstruct it far better than a beginner can. But shuffle the pieces into a position that could never occur in a game, and the master's advantage mostly vanishes. [1] The usual explanation is that masters don't have better memory. They see the board in larger pieces, groups of pieces that mean something together, so there is less for them to hold in their heads.

A model trained on raw input is closer to the beginner. It takes in every piece separately because it doesn't yet know which ones belong together, and we give it enough capacity to get by that way. That works. But I think it also means that some of what a big model's size buys is the ability to be a beginner at scale.

So there's another thing you can do. Instead of making the model faster at figuring out what matters, figure it out yourself and give the model that. The model has less to do, not because each step got cheaper, but because there are fewer steps. The cheapest computation is the one you skip.

The catch is that you can't do this without understanding the problem. You can't cut what you don't understand. And it's more comfortable not to try. If you let the model learn everything, then when it fails, nobody decided anything wrong. If you decide what the model gets to see, you can be wrong. You might cut the thing that mattered. [2]

I don't think there's a procedure for knowing in advance what's essential. You find out the way you find out most things: by trying. You cut something, you see what breaks, you put some of it back. But this process has a side effect I like. Even when it doesn't give you a smaller model, you end up knowing why the model needed to be big. That's worth something. If nothing else, you now know which part of the problem is hard.

Why don't more people look here? I think there are two reasons, and neither is anyone's fault.

The first is that it feels like going backward. There was a period when people designed the inputs to their models by hand. Then models turned out to learn them better on their own, and the lesson many people took away was: don't. For the conditions, that lesson was right. It's a lesson about what works when you have a lot of data and a lot of compute. It's not necessarily a lesson about what to do when you don't. But it hardened into a habit, and habits are hard to notice from the inside.

The second is measurement. Speed is easy to measure. You run the model and you have a number. "Did we understand the problem better" isn't a number, so it doesn't appear in a table, and benchmarks reward whatever they can measure. Effort flows to wherever the numbers are.

None of this means that making things faster is the wrong thing to do. Do both. But the order matters. Speeding up a job you didn't need to do is the most expensive kind of optimization, because you can do it well, be proud of it, and it was still wasted.

So before asking how to make the model faster, ask what it's being asked to figure out, and how much of that you could simply tell it. You can also run the question backwards: what is the smallest amount the model would have to know to get this right? Start there, and add.

**Notes**

[1] Chase and Simon, "Perception in Chess" (1973). A later review of experiments (Gobet and Simon, "Recall of rapidly presented random chess positions is a function of skill," 1996) found that strong players keep some advantage even on random positions, though much smaller than on real ones. That is why I say "mostly."

[2] There are problems where you really can't say what matters, and for those, letting the model work it out is the only option. I'm not arguing against end to end. I'm arguing against making it the default, because a default is something you stop choosing.
