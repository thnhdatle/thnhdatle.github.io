# Chạy site (Jekyll) và trang admin (Cloudflare Worker) ở local.
# Gõ `make` để xem danh sách lệnh.

SHELL := /bin/bash

SITE_DIR   := site
ADMIN_DIR  := admin
RUN_DIR    := .run
SITE_PORT  ?= 4000
ADMIN_PORT ?= 8787
WAIT       ?= 120

SITE_URL  := http://localhost:$(SITE_PORT)/
ADMIN_URL := http://localhost:$(ADMIN_PORT)/

SITE_CMD  := bundle exec jekyll serve --port $(SITE_PORT) --livereload
ADMIN_CMD := npm run dev -- --port $(ADMIN_PORT)

# Repo open source hiện trên trang projects. Mỗi repo có sơ đồ mermaid trong README
# và trang demo ở docs/demo/index.html.
GH_OWNER     := thnhdatle
OSS_REPOS    := footnote triage loupe wake foreman
SITE_BASEURL := $(shell awk '/^baseurl:/ { print $$2 }' $(SITE_DIR)/_config.yml)
DIAGRAM_DIR  := $(SITE_DIR)/assets/img/projects
MMDC         := npx -y @mermaid-js/mermaid-cli@11.17.0

.DEFAULT_GOAL := help
.PHONY: help install start stop restart status logs projects demos diagrams \
	start-site stop-site logs-site start-admin stop-admin logs-admin

help:
	@echo "Cách dùng: make <lệnh>"
	@echo ""
	@echo "  install       Cài thư viện cho site (bundle) và admin (npm)"
	@echo "  start         Chạy cả site và admin ở chế độ nền"
	@echo "  stop          Dừng cả hai"
	@echo "  restart       Dừng rồi chạy lại cả hai"
	@echo "  status        Xem cái nào đang chạy"
	@echo "  logs          Theo dõi log của cả hai (Ctrl+C để thoát)"
	@echo "  projects      Cập nhật demo và sơ đồ kiến trúc từ các repo open source"
	@echo "  demos         Chỉ tải lại trang demo (docs/demo/index.html)"
	@echo "  diagrams      Chỉ render lại sơ đồ kiến trúc từ README"
	@echo ""
	@echo "  start-site | stop-site | logs-site      Chỉ site   → $(SITE_URL)"
	@echo "  start-admin | stop-admin | logs-admin   Chỉ admin  → $(ADMIN_URL)"
	@echo ""
	@echo "Đổi cổng: make start SITE_PORT=4001 ADMIN_PORT=8788"

install:
	cd $(SITE_DIR) && bundle install
	cd $(ADMIN_DIR) && npm ci
	@[ -f $(ADMIN_DIR)/.dev.vars ] || cp $(ADMIN_DIR)/.dev.vars.example $(ADMIN_DIR)/.dev.vars

start: start-site start-admin

stop: stop-site stop-admin

restart: stop start

status:
	@$(call status,site,$(SITE_URL))
	@$(call status,admin,$(ADMIN_URL))

logs:
	@mkdir -p $(RUN_DIR) && touch $(RUN_DIR)/site.log $(RUN_DIR)/admin.log
	tail -n 30 -f $(RUN_DIR)/site.log $(RUN_DIR)/admin.log

projects: demos diagrams

# Điền SITE bằng baseurl của site để nút "back to project" chạy được cả ở local lẫn production.
demos:
	@set -o pipefail; for repo in $(OSS_REPOS); do \
		out=$(SITE_DIR)/projects/$$repo/demo/index.html; \
		mkdir -p $$(dirname $$out); \
		curl -fsSL https://raw.githubusercontent.com/$(GH_OWNER)/$$repo/main/docs/demo/index.html \
			| sed 's|^\( *const SITE = \)".*";|\1"$(SITE_BASEURL)";|' > $$out.tmp \
			|| { rm -f $$out.tmp; echo "$$repo: tải thất bại"; exit 1; }; \
		grep -q 'const SITE = "$(SITE_BASEURL)";' $$out.tmp \
			|| { rm -f $$out.tmp; echo "$$repo: không tìm thấy dòng const SITE"; exit 1; }; \
		mv $$out.tmp $$out; \
		echo "$$repo: $$out"; \
	done

# Render sẵn thành PNG nền trắng thay vì để theme vẽ mermaid lúc chạy: màu trong README
# chỉ hợp nền sáng, ở dark mode tiêu đề nhóm và mũi tên bị chìm.
diagrams:
	@set -o pipefail; mkdir -p $(DIAGRAM_DIR); tmp=$$(mktemp -d); \
	for repo in $(OSS_REPOS); do \
		curl -fsSL https://raw.githubusercontent.com/$(GH_OWNER)/$$repo/main/README.md \
			| awk '/^```mermaid/ { f = 1; next } /^```/ && f { exit } f' > $$tmp/$$repo.mmd \
			|| { echo "$$repo: tải README thất bại"; exit 1; }; \
		[ -s $$tmp/$$repo.mmd ] || { echo "$$repo: README không có khối mermaid"; exit 1; }; \
		$(MMDC) -q -i $$tmp/$$repo.mmd -o $(DIAGRAM_DIR)/$$repo-architecture.png -b white -s 2 \
			|| { echo "$$repo: render thất bại"; exit 1; }; \
		echo "$$repo: $(DIAGRAM_DIR)/$$repo-architecture.png"; \
	done; \
	rm -rf $$tmp

start-site:
	@$(call start,site,$(SITE_DIR),$(SITE_PORT),$(SITE_URL),$(SITE_CMD))

stop-site:
	@$(call stop,site,$(SITE_PORT))

logs-site:
	tail -n 50 -f $(RUN_DIR)/site.log

start-admin:
	@$(call start,admin,$(ADMIN_DIR),$(ADMIN_PORT),$(ADMIN_URL),$(ADMIN_CMD))

stop-admin:
	@$(call stop,admin,$(ADMIN_PORT))

logs-admin:
	tail -n 50 -f $(RUN_DIR)/admin.log

# $(call start,name,dir,port,url,command)
# Chạy command trong một process group riêng (set -m) để stop dừng được cả các tiến trình con
# (npm → wrangler → workerd), rồi chờ tới khi cổng mở.
define start
mkdir -p $(RUN_DIR); \
pidfile=$(RUN_DIR)/$(1).pid; \
if [ -f $$pidfile ] && kill -0 -- -$$(cat $$pidfile) 2>/dev/null; then \
	echo "$(1): đang chạy rồi (PID $$(cat $$pidfile)) → $(4)"; exit 0; \
fi; \
if lsof -tiTCP:$(3) -sTCP:LISTEN >/dev/null; then \
	echo "$(1): cổng $(3) đang bị tiến trình khác dùng. Xem: lsof -iTCP:$(3) -sTCP:LISTEN"; exit 1; \
fi; \
set -m; \
( cd $(2) && exec nohup $(5) ) </dev/null >$(RUN_DIR)/$(1).log 2>&1 & \
echo $$! > $$pidfile; \
printf "$(1): đang khởi động"; \
for i in $$(seq $(WAIT)); do \
	if lsof -tiTCP:$(3) -sTCP:LISTEN >/dev/null; then echo; echo "$(1): sẵn sàng → $(4)"; exit 0; fi; \
	if ! kill -0 -- -$$(cat $$pidfile) 2>/dev/null; then \
		echo; echo "$(1): khởi động thất bại. Log cuối:"; tail -n 20 $(RUN_DIR)/$(1).log; rm -f $$pidfile; exit 1; \
	fi; \
	printf "."; sleep 1; \
done; \
echo; echo "$(1): sau $(WAIT)s vẫn chưa mở cổng $(3), vẫn để chạy tiếp. Xem log: make logs-$(1)"
endef

# $(call stop,name,port)
define stop
pidfile=$(RUN_DIR)/$(1).pid; \
if [ -f $$pidfile ]; then \
	pgid=$$(cat $$pidfile); \
	kill -TERM -- -$$pgid 2>/dev/null; \
	for i in $$(seq 10); do kill -0 -- -$$pgid 2>/dev/null || break; sleep 1; done; \
	kill -KILL -- -$$pgid 2>/dev/null; \
	rm -f $$pidfile; \
	echo "$(1): đã dừng"; \
else \
	echo "$(1): không chạy"; \
fi; \
if lsof -tiTCP:$(2) -sTCP:LISTEN >/dev/null; then \
	echo "$(1): cổng $(2) vẫn có tiến trình khác dùng (không phải do make start). Xem: lsof -iTCP:$(2) -sTCP:LISTEN"; \
fi; \
true
endef

# $(call status,name,url)
define status
pidfile=$(RUN_DIR)/$(1).pid; \
if [ -f $$pidfile ] && kill -0 -- -$$(cat $$pidfile) 2>/dev/null; then \
	echo "$(1): đang chạy (PID $$(cat $$pidfile)) → $(2)"; \
else \
	echo "$(1): đã dừng"; \
fi
endef
