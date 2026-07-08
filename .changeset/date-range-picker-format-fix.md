---
"@appspine/frontend-shell": patch
---

Fix `<DateRangePicker>`'s trigger button label using a locale-formatted `d MMM yyyy` (e.g. "9 6月 2026"), which reads awkwardly in `zh-TW` (day-month-year order borrowed from the English pattern with the month name swapped for Chinese). Use a plain `yyyy/M/d` numeric format instead (e.g. "2026/6/9"), which is unambiguous in both locales.
