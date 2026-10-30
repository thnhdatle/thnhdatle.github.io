import { Hono } from "hono";
import type { AppEnv, Env } from "./env";

// Markdown bodies keep Liquid tags and raw HTML, so the raw editor is the
// default; the rich text mode would rewrite unsupported syntax on save.
const body = { name: "body", label: "Nội dung", widget: "markdown", modes: ["raw", "rich_text"], required: false };
const hidden = (name: string, value: string) => ({ name, widget: "hidden", default: value });
const string = (name: string, label: string, extra: object = {}) => ({ name, label, widget: "string", ...extra });
const optional = { required: false };
const toggle = (name: string, label: string) => ({ name, label, widget: "boolean", required: false });

const rawFile = (name: string, label: string, file: string, lang: string, hint?: string) => ({
  name,
  label,
  file,
  format: "raw",
  fields: [
    {
      name: "body",
      label,
      widget: "code",
      output_code_only: true,
      allow_language_selection: false,
      default_language: lang,
      hint,
    },
  ],
});

// Sveltia CMS configuration for the al-folio site in CONTENT_ROOT.
// Fields not listed here are kept as they are when an entry is saved.
export function cmsConfig(env: Env, origin: string) {
  const root = env.CONTENT_ROOT.replace(/\/+$/, "");
  const at = (path: string) => (root ? `${root}/${path}` : path);

  return {
    load_config_file: false,
    backend: {
      name: "github",
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      base_url: origin,
      commit_messages: {
        create: "cms: create {{collection}} “{{slug}}”",
        update: "cms: update {{collection}} “{{slug}}”",
        delete: "cms: delete {{collection}} “{{slug}}”",
        uploadMedia: "cms: upload “{{path}}”",
        deleteMedia: "cms: delete “{{path}}”",
      },
    },
    site_url: env.SITE_URL,
    display_url: env.SITE_URL,
    // Markdown bodies link images by absolute path, which must include the
    // site baseurl (the path part of SITE_URL, e.g. /thnhdatle).
    media_folder: at("assets/img"),
    public_folder: `${new URL(env.SITE_URL).pathname.replace(/\/+$/, "")}/assets/img`,
    slug: { encoding: "ascii", clean_accents: true },
    // Leave unset optional fields out of the front matter instead of writing
    // empty values, which al-folio's Liquid would treat as set.
    output: { omit_empty_optional_fields: true },
    collections: [
      {
        name: "pages",
        label: "Trang",
        label_singular: "Trang",
        files: [
          {
            name: "about",
            label: "About (trang chủ)",
            file: at("_pages/about.md"),
            fields: [
              string("title", "Tiêu đề"),
              string("subtitle", "Dòng phụ (HTML)", optional),
              {
                name: "profile",
                label: "Hồ sơ",
                widget: "object",
                fields: [
                  { name: "align", label: "Vị trí ảnh", widget: "select", options: ["left", "right"], default: "right" },
                  string("image", "Ảnh đại diện (tên file trong assets/img)", optional),
                  toggle("image_circular", "Ảnh tròn"),
                  { name: "more_info", label: "Thông tin thêm (HTML)", widget: "text", required: false },
                ],
              },
              toggle("selected_papers", "Hiện bài báo chọn lọc"),
              toggle("social", "Hiện mạng xã hội"),
              {
                name: "announcements",
                label: "Tin tức trên trang chủ",
                widget: "object",
                fields: [
                  toggle("enabled", "Bật"),
                  toggle("scrollable", "Cuộn được"),
                  { name: "limit", label: "Số tin", widget: "number", required: false },
                ],
              },
              {
                name: "latest_posts",
                label: "Bài viết mới trên trang chủ",
                widget: "object",
                fields: [
                  toggle("enabled", "Bật"),
                  toggle("scrollable", "Cuộn được"),
                  { name: "limit", label: "Số bài", widget: "number", required: false },
                ],
              },
              body,
            ],
          },
        ],
      },
      {
        name: "all_pages",
        label: "Tất cả trang (_pages)",
        label_singular: "Trang",
        folder: at("_pages"),
        create: true,
        fields: [
          hidden("layout", "page"),
          string("title", "Tiêu đề"),
          string("permalink", "Đường dẫn (vd. /teaching/)"),
          string("description", "Mô tả", optional),
          toggle("nav", "Hiện trên menu"),
          { name: "nav_order", label: "Thứ tự menu", widget: "number", required: false },
          body,
        ],
      },
      {
        name: "news",
        label: "Tin tức",
        label_singular: "Tin",
        folder: at("_news"),
        create: true,
        slug: "{{year}}-{{month}}-{{day}}-{{slug}}",
        summary: "{{date | date('YYYY-MM-DD')}} · {{title}}{{body | truncate(60)}}",
        sortable_fields: ["date"],
        fields: [
          hidden("layout", "post"),
          { name: "date", label: "Ngày", widget: "datetime" },
          toggle("inline", "Tin ngắn (hiện nguyên văn trong danh sách)"),
          string("title", "Tiêu đề (cho tin dài)", optional),
          toggle("related_posts", "Hiện bài liên quan"),
          body,
        ],
      },
      {
        name: "posts",
        label: "Blog",
        label_singular: "Bài viết",
        folder: at("_posts"),
        create: true,
        slug: "{{date | date('YYYY-MM-DD')}}-{{slug}}",
        sortable_fields: ["date", "title"],
        fields: [
          hidden("layout", "post"),
          string("title", "Tiêu đề"),
          { name: "date", label: "Ngày", widget: "datetime", type: "date" },
          string("description", "Mô tả ngắn", optional),
          { name: "tags", label: "Tags", widget: "list", required: false },
          { name: "categories", label: "Chuyên mục", widget: "list", required: false },
          string("permalink", "Đường dẫn riêng (để trống = mặc định)", optional),
          {
            name: "cover",
            label: "Ảnh bìa",
            widget: "image",
            required: false,
            media_folder: at("assets/img/blog"),
            public_folder: "/assets/img/blog",
          },
          string("image_credit", "Nguồn ảnh", optional),
          toggle("giscus_comments", "Bật bình luận"),
          toggle("toc", "Mục lục"),
          body,
        ],
      },
      {
        name: "projects",
        label: "Dự án",
        label_singular: "Dự án",
        folder: at("_projects"),
        create: true,
        sortable_fields: ["importance", "title"],
        fields: [
          hidden("layout", "page"),
          string("title", "Tên dự án"),
          string("description", "Mô tả ngắn", optional),
          {
            name: "img",
            label: "Ảnh",
            widget: "image",
            required: false,
            media_folder: at("assets/img"),
            public_folder: "assets/img",
          },
          { name: "importance", label: "Thứ tự (nhỏ = trước)", widget: "number", value_type: "int", default: 1 },
          string("category", "Nhóm (vd. work, fun)", optional),
          string("redirect", "Link ngoài (thay cho trang riêng)", optional),
          toggle("related_publications", "Hiện bài báo liên quan"),
          body,
        ],
      },
      {
        name: "teachings",
        label: "Giảng dạy",
        label_singular: "Môn học",
        folder: at("_teachings"),
        create: true,
        fields: [
          hidden("layout", "course"),
          string("title", "Tên môn"),
          string("description", "Mô tả", optional),
          string("instructor", "Giảng viên", optional),
          { name: "year", label: "Năm", widget: "number", required: false },
          string("term", "Học kỳ", optional),
          string("location", "Địa điểm", optional),
          string("time", "Thời gian", optional),
          string("course_id", "Mã môn"),
          {
            name: "schedule",
            label: "Lịch học",
            widget: "list",
            required: false,
            fields: [
              { name: "week", label: "Tuần", widget: "number" },
              string("date", "Ngày", optional),
              string("topic", "Chủ đề"),
              { name: "description", label: "Mô tả", widget: "text", required: false },
              {
                name: "materials",
                label: "Tài liệu",
                widget: "list",
                required: false,
                fields: [string("name", "Tên"), string("url", "URL")],
              },
            ],
          },
          body,
        ],
      },
      {
        name: "data",
        label: "Publications, CV & dữ liệu",
        label_singular: "Tệp",
        editor: { preview: false },
        files: [
          rawFile(
            "papers",
            "Publications (papers.bib)",
            at("_bibliography/papers.bib"),
            "bibtex",
            "Mỗi bài báo là một mục BibTeX. Thêm selected = {true} để hiện trên trang chủ.",
          ),
          rawFile("cv", "CV (cv.yml)", at("_data/cv.yml"), "yaml", "Định dạng RenderCV."),
          rawFile("socials", "Mạng xã hội (socials.yml)", at("_data/socials.yml"), "yaml"),
          rawFile("coauthors", "Đồng tác giả (coauthors.yml)", at("_data/coauthors.yml"), "yaml"),
          rawFile("venues", "Hội nghị/tạp chí (venues.yml)", at("_data/venues.yml"), "yaml"),
          rawFile("repositories", "Repositories (repositories.yml)", at("_data/repositories.yml"), "yaml"),
          rawFile(
            "site_config",
            "Cấu hình site (_config.yml) — nâng cao",
            at("_config.yml"),
            "yaml",
            "Sửa sai có thể làm hỏng build. Kiểm tra trạng thái build sau khi lưu.",
          ),
        ],
      },
    ],
  };
}

const gh = (token: string, path: string) =>
  fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "site-admin",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

export const content = new Hono<AppEnv>();

content.get("/cms-config", (c) => c.json(cmsConfig(c.env, new URL(c.req.url).origin)));

// Latest runs of the site deploy workflow, so the dashboard can show when a
// CMS save has gone live.
content.get("/deploys", async (c) => {
  const { token } = c.get("session");
  if (!token) return c.json({ runs: [] });
  const res = await gh(
    token,
    `/repos/${c.env.GITHUB_REPO}/actions/workflows/${c.env.DEPLOY_WORKFLOW}/runs?per_page=5&branch=${c.env.GITHUB_BRANCH}`,
  );
  if (!res.ok) return c.json({ runs: [], error: `GitHub ${res.status}` });
  const data = (await res.json()) as {
    workflow_runs: {
      id: number;
      status: string;
      conclusion: string | null;
      created_at: string;
      updated_at: string;
      html_url: string;
      head_commit: { message: string } | null;
    }[];
  };
  return c.json({
    runs: data.workflow_runs.map((r) => ({
      id: r.id,
      status: r.status,
      conclusion: r.conclusion,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      url: r.html_url,
      message: r.head_commit?.message.split("\n")[0] ?? "",
    })),
  });
});
