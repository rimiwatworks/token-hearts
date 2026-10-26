# token-hearts ♥

Claude Code のトークン残量を、初代ゼルダ風の8ビットハートで表示するMod。
オレンジのドット文字「TOKENS」、会話（コンテキスト）の残りをハート8個、
5時間/7日の利用上限の残りを小さいハート、コストをルピー風に表示します。

Shows remaining Claude Code tokens as 8-bit Zelda-style hearts in a pane beside the chat.

## インストール

ターミナルの Claude Code で:

```
/plugin install token-hearts --marketplace rimiwatworks/token-hearts
```

マーケットプレイスの追加を聞かれたら `y`、そのあとスコープを選びます。

シェルから:

```
claude plugin install token-hearts --marketplace rimiwatworks/token-hearts
```

デスクトップアプリ（`/plugin` が使えない場合）: プロンプト欄の横の **+** → **Plugins** → **Add marketplace** に `rimiwatworks/token-hearts` → **Add plugin**。

## つかいかた

- 横にパネル「♥ Tokens」が出ます。出ないときは `/tokens`
- 「-CHAT-」はこのチャットの残り、「-ACCOUNT-」はアカウント全体（5時間・7日の利用上限）の残り
- ステータスラインにも `chat ♥♥♥♥❥ 90% · 5h ♥♥♥❥♡ 62%` のように表示されます
