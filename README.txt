TRAINING LOG — Telegram Mini App v1

Что уже работает:
- TRAIN: A/B/C/Other, заранее заданные планы.
- Edit plan: менять название, секции, упражнения, план повторов/подходов, заметки.
- Exercise logger: вес, повторы/секунды, любое число подходов, RPE, pain, note, Skip, Clear.
- Last time + Use previous.
- BODY: вес, сон, энергия, кисть, голеностоп, колени, поясница, заметка.
- SKILLS & REHAB: редактируемая библиотека.
- PROGRESS: история + график top weight / volume / best reps / estimated 1RM.
- Telegram close/back button.
- Telegram CloudStorage: данные хранятся у пользователя в облачном хранилище конкретного бота.
- В обычном браузере используется localStorage для preview.

КАК ЗАПУСТИТЬ ИМЕННО В TELEGRAM
1) Разместить эту папку на публичном HTTPS-хостинге (GitHub Pages, Cloudflare Pages, Netlify, Vercel и т.п.).
2) В @BotFather выбрать бота -> Bot Settings -> Configure Mini App / Menu Button (название пункта может немного меняться) и указать HTTPS URL до index.html.
3) После этого в Telegram у бота появится кнопка Open App/Menu, и Training Log откроется внутри Telegram.

Важно: Telegram Mini App не может запускаться из локального файла. Telegram требует публичный HTTPS URL.

Хранение:
- В Telegram используется WebApp.CloudStorage.
- Сервер/база/Supabase для этой версии НЕ нужны.
- Если позже журнал станет большим или понадобится аналитика за годы, можно добавить базу без изменения интерфейса.
