---
layout: default
permalink: /references/
title: references
nav: true
nav_order: 4
---

<style>
  .references { max-width: 640px; }
  .references p { line-height: 1.6; }
  .reference-list { list-style: none; padding: 0; margin: 1.5rem 0 0; }
  .reference-list li { margin-bottom: 0.9rem; word-break: break-all; }
</style>

<div class="references">
  <h1>References</h1>
  <p>Some of my posts use images found on the internet. These are where they came from:</p>

  <ul class="reference-list">
    {% for post in site.posts %}
      {% if post.image_credit %}
        <li><a href="{{ post.image_credit }}" target="_blank" rel="noopener">{{ post.image_credit }}</a></li>
      {% endif %}
    {% endfor %}
  </ul>
</div>
