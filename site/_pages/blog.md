---
layout: default
permalink: /blog/
title: blog
nav: true
nav_order: 3
---

<style>
  .essays { max-width: 640px; }
  .essays a { color: var(--global-theme-color); text-decoration: underline; }
  .essays a:visited { color: #464646; }
  .essays a:hover { color: var(--global-text-color); }
  .essay-list { list-style: none; padding: 0; margin: 0; }
  .essay-list li { position: relative; padding-left: 1.4rem; margin-bottom: 0.65rem; font-size: 1rem; font-weight: 400; line-height: 1.5; }
  .essay-list li::before { content: ""; position: absolute; left: 0.1rem; top: 0.6em; width: 6px; height: 6px; background: #888; }

  html[data-theme="dark"] .essays a:visited { color: #a9a9a9; }
</style>

<div class="essays">
  <h1>Blogs</h1>

  <ul class="essay-list">
    {% for post in site.posts %}
      <li>
        {% if post.redirect == blank %}
          <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
        {% elsif post.redirect contains '://' %}
          <a href="{{ post.redirect }}" target="_blank">{{ post.title }}</a>
        {% else %}
          <a href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
        {% endif %}
      </li>
    {% endfor %}
  </ul>
</div>
