# 菜單價格調整工具

上傳餐廳菜單圖片，手動框選價格位置，輸入調整百分比後自動覆蓋舊數字並輸出修改後的圖片。

---

## 快速啟動

```bash
# 安裝依賴
pip install -r requirements.txt

# 啟動
python app.py
```

瀏覽器開啟 http://localhost:5000

---

## 功能說明

### 編輯頁
- 上傳菜單圖片（JPG / PNG / WEBP）
- 在圖片上拖拉框選每個價格位置
- 框選後在左側懸浮面板輸入原始數值
- 設定全域調整百分比（正數漲價，負數降價）
- 選擇字型（4 套免費中文字型）
- 設定排列方向（直式 / 橫式 / 自動偵測）
- 預覽修改效果
- 匯出與原始圖片相同格式的修改後圖片

### 批次頁
- 建立多個群組（例如：前菜、主餐、甜點）
- 每個群組設定不同的調整百分比
- 框選時指定套用的群組
- 不同顏色區分不同群組的框選

### 菜單庫
- 儲存菜單設定（含圖片縮圖，圖片 < 3MB 時完整儲存）
- 下次直接載入繼續編輯
- 支援覆蓋更新、刪除

### 其他
- 左側欄收合／展開，菜單畫面自適應最大化
- 滾輪縮放 + 按鈕縮放（20%～400%）
- 座標 JSON 匯出 / 載入（同一張菜單下次免重新框選）
- 操作歷史紀錄

---

## 技術架構

```
menu-price-tool/
├── app.py                  ← Flask 後端（僅作靜態路由）
├── requirements.txt
├── README.md
├── templates/
│   └── index.html          ← 主介面（完整 HTML）
└── static/
    ├── css/
    │   └── style.css       ← 全站樣式
    └── js/
        ├── app.js          ← 主程式邏輯
        ├── canvas.js       ← Canvas 框選與縮放
        ├── library.js      ← 菜單庫管理
        └── groups.js       ← 批次群組管理
```

所有資料存於瀏覽器 **localStorage**，無需資料庫。

---

## 設計規範

| 項目 | 規格 |
|------|------|
| 背景底色 | 米白 `#FAF7F2` |
| 主強調色 | 嫣紅 `#C0392B` |
| Icon 風格 | 線條型（Lucide / Feather）|
| 介面語言 | 繁體中文 |
| 字型 | Noto Sans TC（介面）/ Noto Serif TC（預設菜單字型）|

---

## 部署到生產環境

```bash
# 使用 gunicorn
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

或直接部署 `templates/index.html` 為靜態網站（Netlify、GitHub Pages 等）。
