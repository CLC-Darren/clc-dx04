# /shared — CLC 各站共用程式目錄

各站用網址載入：`https://clc-dx04.pages.dev/shared/...`（`_worker.js` 對 `/shared/*` 加 `Access-Control-Allow-Origin: *`）。
檔名帶版本（`.v1`），大改另開 `.v2`，各站測好再切換；舊版不要改壞。

| 檔案 | 用途 | 版本 |
|---|---|---|
| `desktop/desktop.v1.js` `.css` | 桌面格子引擎（gridstack 10.3.1，從 jsDelivr 自動載入）、長按/右鍵選單、刪除確認框 | v1（LF 首頁） |
| `toolbar/toolbar.v1.js` `.css` | 頂部工具列：分頁＋放大鏡＋加號＋搜尋列 | v1（LF 首頁） |
| `widgets/todo/` | 今日待辦共用 widget | 第三階段 |

## 桌面 `clcDesktop(root, opts)`
```js
const desk = clcDesktop(el, {
  cols: { desktop: 10, phone: 4 },          // 手機＝(max-width:699px)
  waitLayout: true,                         // 雲端排列讀到前不存，避免蓋掉
  canEdit: () => true,
  menu: ({ id, type, cell }) => [{ label, run }], // 長按/右鍵：可新增的東西（cell＝點到的空格）
  onDelete: (id, type) => {},               // 已經過「確認刪除」對話框
  label: id => '名稱',                      // 確認框顯示用
  saveLayout: (mode, map) => Promise,       // mode: 'desktop'|'phone'；map: {id:{x,y,w,h}}
  error: err => {}
});
desk.put(id, el, { type: 'app' | 'card', w, h, searchText: () => '...' }); // 新增或更新一格
desk.drop(id); desk.setLayout(mode, map | null); desk.search(q) /* → 符合的 id */; desk.placeNext({x,y});
```
- App 固定 1×1；卡片最小 2×1，可拉右下角改大小。卡片的拖曳把手＝裡面有 `.dk-handle` 的元素。
- 電腦：滑鼠直接拖，放手即存；右鍵開選單。手機：長按 0.5 秒抖動＋選單，手指一移動就變拖曳。
- 手機第一次沒有排列時，依電腦版順序自動換算，之後各自獨立。

## 工具列 `clcToolbar(host, opts)`
```js
const tb = clcToolbar(host, {
  tabs: [{ id: 'home', label: 'Home' }], active: 'home', onTab: id => {},
  placeholder: '搜尋…', onSearch: q => {}, onEnter: q => {},
  addItems: tab => [{ label: '新增 APP', run }],   // 空陣列＝隱藏加號
  searchHost: el                                    // 搜尋列放哪（預設工具列後面）
});
tb.setTab(id); tb.setDot(id, true); tb.refresh(); tb.clearSearch();
```
