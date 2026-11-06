# Design System — "Soft Paper"

乾淨、現代、輕盈。App 本體走克制的中性色 + 單一主色；「可愛」集中在 plan 類型色與匯出圖片，不讓日常操作介面變花。

## 1. 基礎
- 元件：**shadcn/ui**（Radix primitives）+ Tailwind；圖示 **lucide-react**（1.5px stroke）；動畫 **framer-motion**（只用於 drawer、勾選、chip 展開）。
- 4px 間距格線；圓角 12px（卡片）/ 8px（輸入、按鈕）/ 999px（chip）；陰影只用兩級；支援 light / dark。

## 2. 字型
| 用途 | 字型 |
|---|---|
| UI 內文（英/數） | Inter |
| UI 內文（繁中） | Noto Sans TC |
| 數字（金額、時間） | Inter, `font-variant-numeric: tabular-nums` |
| 匯出圖片標題 | Zen Maru Gothic（圓體，中英皆可） |

字階：12 / 14（預設）/ 16 / 20 / 28 / 40。行高內文 1.5，標題 1.25。

## 3. Design tokens（`globals.css`）
```css
:root {
  --bg: #FAFAF9;        --surface: #FFFFFF;     --surface-2: #F5F5F4;
  --border: #E7E5E4;    --text: #1C1917;        --muted: #78716C;
  --primary: #5B5BD6;   --primary-hover: #4A4AC0; --primary-soft: #EEEEFF;
  --success: #16A34A;   --warning: #D97706;     --danger: #DC2626;
  --radius-card: 12px;  --radius-input: 8px;
  --shadow-1: 0 1px 2px rgb(28 25 23 / .06);
  --shadow-2: 0 8px 24px rgb(28 25 23 / .10);
}
.dark {
  --bg: #121110;        --surface: #1C1917;     --surface-2: #292524;
  --border: #3A3532;    --text: #FAFAF9;        --muted: #A8A29E;
  --primary: #8B8BF0;   --primary-hover: #A3A3F5; --primary-soft: #26264A;
}
```

## 4. Plan 類型色（tint 背景 / 深色文字 / 圓點）
| 類型 | icon (lucide) | bg | fg | dot |
|---|---|---|---|---|
| breakfast | `coffee` | #FEF3C7 | #92400E | #F59E0B |
| lunch | `utensils` | #FFEDD5 | #9A3412 | #F97316 |
| dinner | `utensils-crossed` | #FFE4E6 | #9F1239 | #F43F5E |
| tea | `cup-soda` | #ECFCCB | #3F6212 | #84CC16 |
| workshop | `hammer` | #E0F2FE | #075985 | #0EA5E9 |
| cosplay | `sparkles` | #FAE8FF | #86198F | #D946EF |
| date | `heart` | #FCE7F3 | #9D174D | #EC4899 |
| hangout | `users` | #EDE9FE | #5B21B6 | #8B5CF6 |
| event | `ticket` | #CCFBF1 | #115E59 | #14B8A6 |

規則：顏色不單獨傳達資訊，一律搭配 icon + 文字；文字對比 ≥ 4.5:1（上表 fg/bg 皆通過）。Dark mode 時 bg 改為 dot 色 15% 透明度，fg 用 300 階。

## 5. 元件規範
- **Plan 卡片**：白底、1px border、左側 4px 類型色條；標題 14/600，時間 12 muted tabular；完成時整張降到 60% 不透明並顯示綠色勾章。
- **Commute chip**：兩卡之間的 pill（surface-2 底、icon + 時長 + 金額）；空狀態為虛線「＋ 加交通」。
- **Hotel 時間軸 bar**：confirmed = 實心 primary-soft + primary 邊；not booked = 虛線邊 + warning 圖示；缺口夜晚 = danger 斜紋底。
- **日期欄**：固定寬 280px，sticky 日期標頭（日期 + 星期 + 當日花費小計）。
- **Drawer**：右側滑出 480px（手機為全螢幕 bottom sheet）；primary 按鈕每畫面至多一個。
- **Dashboard 圖表**：調色盤沿用類型色；圓環中心顯示總額；數值一律 tabular-nums。
- **金額**：預設顯示 trip 幣別，旁邊有 `USD` 切換 chip；換算值前加「≈」。

## 6. 匯出圖片主題（可愛版）
- 4 組粉彩主題：Peach `#FFE8DC`、Mint `#DDF5EA`、Lavender `#E8E4FF`、Sky `#DDEFFF`；卡片白底大圓角 24px；標題用 Zen Maru Gothic；貼紙感小 icon（plan type icon 放進圓形色塊）。
- 固定畫布 1080×1350 / 1080×1080；外邊距 64px；底部浮水印「Made with {App name}」可關閉。

## 7. 無障礙與行為
- 焦點環 2px primary，偏移 2px；所有互動目標 ≥ 40px；`prefers-reduced-motion` 時關閉動畫。
- 空狀態 = 一句說明 + 一個 CTA；錯誤訊息說明原因與下一步。
- 手機優先斷點：<640 單日欄 + 日期 tabs；≥1024 多欄橫向捲動。
