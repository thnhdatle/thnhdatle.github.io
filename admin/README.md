# Site Admin

Trang quản trị cho site al-folio trong `../site`: analytics tự host và CMS. Toàn bộ chạy trên một Cloudflare Worker.

| Thành phần | Nằm ở | Việc |
| --- | --- | --- |
| Tracker (~3KB) | `src/tracker/` → `/s.js` | Chèn vào mọi trang bởi `site/_plugins/site_analytics.rb`; gửi lượt xem, thời gian đọc, độ cuộn, click, link ra ngoài, tải file, copy |
| API | `src/worker/` (Hono) | Nhận sự kiện (`POST /e`), thống kê (`/api/stats/*`, `/api/sessions`), đăng nhập GitHub, OAuth cho CMS (`/auth`) |
| Database | Cloudflare D1, `migrations/` | `pageviews` (một dòng mỗi lượt xem), `events`, `salts` |
| Giao diện | `src/web/` (React) | Tổng quan, Thời gian thực, Phiên truy cập, Nội dung |
| CMS | `public/cms/` (Sveltia CMS) | Sửa nội dung → commit vào repo → `deploy-site.yml` build lại site |

## Quyền riêng tư

- Không dùng cookie, không lưu IP.
- Người xem được nhận diện bằng hash của IP + User-Agent, trộn với một salt ngẫu nhiên đổi mỗi ngày (UTC). Salt cũ bị xoá, nên không thể dò ngược hay nối người xem qua các ngày. Hệ quả là "Khách" được đếm theo từng ngày.
- Dữ liệu thô được giữ `RETENTION_DAYS` ngày (mặc định 400). Cron chạy lúc 03:17 UTC để xoá dữ liệu quá hạn.

## Cài đặt lần đầu

Cần: tài khoản Cloudflare (miễn phí) và Node 22+.

```bash
cd admin
npm ci
npx wrangler login
```

1. **Tạo database**

   ```bash
   npx wrangler d1 create site-analytics
   ```

   Chép `database_id` mà lệnh in ra vào `wrangler.jsonc`, thay cho dòng toàn số 0.

2. **Deploy lần đầu** để lấy URL của Worker:

   ```bash
   npm run deploy
   ```

   URL có dạng `https://site-admin.<subdomain>.workers.dev`.

3. **Tạo GitHub OAuth App** tại GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:
   - Homepage URL: `https://site-admin.<subdomain>.workers.dev`
   - Authorization callback URL: `https://site-admin.<subdomain>.workers.dev/callback`

   Sau khi tạo, bấm "Generate a new client secret".

4. **Đặt secret cho Worker**:

   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID      # Client ID của OAuth App
   npx wrangler secret put GITHUB_CLIENT_SECRET  # client secret vừa tạo
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
   ```

5. **Bật tracker trên site**: trong `site/_config.yml`, đặt

   ```yaml
   site_analytics:
     endpoint: https://site-admin.<subdomain>.workers.dev
   ```

   rồi push. Từ lúc site build xong, lượt xem bắt đầu được ghi.

6. **(Tuỳ chọn) Tự deploy khi push.** Workflow `.github/workflows/deploy-admin.yml` deploy Worker mỗi khi `admin/` thay đổi. Workflow cần hai secret của repo:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`: tạo ở Cloudflare → My Profile → API Tokens, dùng template "Edit Cloudflare Workers" và thêm quyền D1 Edit.

7. **Không đếm lượt xem của chính bạn**: trên mỗi trình duyệt bạn dùng, mở site một lần với `?sa_ignore=1`. Trong trang quản trị có sẵn link này ở menu tài khoản.

## Cấu hình

Các biến nằm trong `vars` của `wrangler.jsonc`:

| Biến | Ý nghĩa |
| --- | --- |
| `SITE_ORIGINS` | Origin được phép gửi sự kiện (`https://thnhdatle.github.io`) |
| `SITE_URL` | URL site. Phần path (nếu có, ví dụ `/blog`) được dùng làm tiền tố cho đường dẫn ảnh trong CMS |
| `GITHUB_REPO`, `GITHUB_BRANCH`, `CONTENT_ROOT` | Repo, nhánh và thư mục chứa site Jekyll mà CMS sửa |
| `DEPLOY_WORKFLOW` | File workflow build site, dùng để hiện trạng thái build |
| `ADMIN_LOGINS` | Tài khoản GitHub được vào trang quản trị, cách nhau bằng dấu phẩy |
| `RETENTION_DAYS` | Số ngày giữ dữ liệu |

Nếu đổi `baseurl` của site, nhớ đổi `SITE_URL` theo.

## Phát triển local

```bash
cp .dev.vars.example .dev.vars
npm run dev       # build UI + tracker, migrate D1 local, chạy wrangler dev ở :8787
npm run dev:web   # (tuỳ chọn) UI có hot reload ở :5173, gọi API sang :8787
npm test          # test Worker + D1 (Vitest trên runtime Workers)
```

Ở local, `/login` đăng nhập thẳng bằng `DEV_AUTH_LOGIN`, không cần GitHub. Biến này bị bỏ qua nếu request không đến từ localhost.

Để chạy test đầu-cuối bằng trình duyệt thật (`npm run test:e2e`), cần chuẩn bị:

1. Build site với tracker trỏ về Worker local:

   ```yaml
   site_analytics:
     endpoint: https://localhost:8787
     track_in_development: true
   ```

2. Phục vụ site đã build ở `http://localhost:4000/`.
3. Chạy Worker bằng `npx wrangler dev --local-protocol https`. Phải dùng HTTPS vì CSP của al-folio chỉ cho phép script từ nguồn `https:`.
