# clc-dx04

CLC 總控台：所有分站（YA、SR…）的統一入口。外觀與 YA 相同。

- `index.html`：首頁與分站入口卡片
- `header.js`：共用 Header（Logo、深淺模式）；登入待 Firebase 專案建立後接上
- `manifest.json`、`sw.js`、`favicon.svg`：PWA 安裝設定

部署：Cloudflare Pages 連接此 repo，Build command 留空，Output directory 為 `/`。
