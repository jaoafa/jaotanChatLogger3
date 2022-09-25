# jaotanChatLogger3 DB Structure

```mermaid
%%{init:{'theme':'neutral'}}%%
erDiagram

%% 単一ユーザは0個以上の新規メッセージを持つ
%% 0個以上の新規メッセージは単一ユーザを持つ
users ||--|{ message-createds: "user_id <-> author_id"

%% 単一チャンネルは0個以上の新規メッセージデータを持つ
%% 0個以上の新規メッセージは単一チャンネルを持つ
channels ||--|{ message-createds: channel_id
%% 単一サーバは0個以上のチャンネルを持つ
%% 0個以上のチャンネルは単一のサーバ(Guild)を持つ
channels }o--|| guilds: guild_id

%% 単一スレッドは0個以上の新規メッセージデータを持つ
%% 0個以上の新規メッセージは単一スレッドを持つ
threads ||--|{ message-createds: thread_id
%% 単一スレッドは1つのチャンネルを持つ
%% 1つのチャンネルは複数のスレッドを持つ
threads }o--|| channels: thread_id
%% 単一サーバは0個以上のスレッドを持つ
%% 0個以上のスレッドは単一のサーバ(Guild)を持つ
threads }o--|| guilds: guild_id

%% 単一のサーバは複数の新規メッセージを持つ
%% 0個以上の新規メッセージは単一のサーバを持つ
message-createds ||--o{ guilds: guild_id
%% 単一新規メッセージは0個か1個の削除メッセージを持つ
message-createds ||--o| message-deleteds: msgid
%% 単一新規メッセージは複数の編集メッセージを持つ
message-createds ||--o{ message-editeds: msgid

%% 単一ユーザは複数の名前変更履歴を持つ
users ||--o{ name-changes: "user_id <-> id"
%% 単一サーバは複数の名前変更履歴を持つ
guilds ||--o{ name-changes: "guild_id <-> id"
%% 単一チャンネルは複数の名前変更履歴を持つ
channels ||--o{ name-changes: "channel_id <-> id"
%% 単一ユーザは0つ以上の名前変更履歴を持つ
users ||--|{ name-changes: "user_id <-> changed_by"

% 新規メッセージテーブル
% 新規投稿されたメッセージを集積する。一度挿入したデータは更新しない
% メッセージ種別はドキュメントを参考: https://discord.com/developers/docs/resources/channel#message-object-message-types
message-createds {
  bigint msgid "メッセージID"
  text displaytext "メンションなどを表示名に置き換えたメッセージテキスト"
  text rawtext "生のメッセージテキスト"
  bigint guild_id "メッセージが投稿されたサーバのID"
  bigint channel_id "メッセージが投稿されたチャンネルのID"
  bigint thread_id "メッセージが投稿されたスレッドのID (スレッド外の場合はNULL)"
  bigint author_id "メッセージを投稿したユーザのID"
  text type "メッセージ種別"
  text attachments "カンマ区切りの添付ファイルURL"
  text machine "行挿入をしたマシン名"
  timestamp timestamp "メッセージ送信日時"
  timestamp created_at "行挿入日時"
}

% 編集メッセージテーブル
% メッセージが更新された場合、更新毎にこのテーブルに追加して集積する。一度挿入したデータは更新しない
message-editeds {
  int rowid "行ID"
  bigint msgid "メッセージID"
  text displaytext "表示メッセージテキスト"
  text rawtext "生メッセージテキスト"
  text attachments "カンマ区切りの添付ファイルURL"
  text machine "行挿入をしたマシン名"
  timestamp timestamp "メッセージ更新日時"
  timestamp created_at "行挿入日時"
}

% 削除メッセージテーブル
% メッセージが削除された場合、メッセージIDをこのテーブルに追加して集積する。一度挿入したデータは更新しない
message-deleteds {
  bigint msgid "メッセージID"
  text machine "行挿入をしたマシン名"
  timestamp created_at "行挿入日時"
}

% 名前などの変更履歴テーブル
% サーバ名(GUILD_NAME)・チャンネル名(CHANNEL_NAME)・スレッド名(THREAD_NAME)・ユーザ名(USER_NAME)・ユーザ4桁タグ(USER_DISCRIMINATOR)の名称変更時にこのテーブルに追加して集積する。一度挿入したデータは更新しない
name-changes {
  int rowid "行ID"
  bigint id "チャンネルIDなどの各種ID"
  text old_name "旧名"
  text new_name "新名"
  bigint changed_by "変更したユーザのID"
  text type "変更の種別"
  timestamp timestamp "変更日時"
  timestamp created_at "行挿入日時"
}

% サーバ(Guild)テーブル
guilds {
  bigint guild_id "サーバID"
  text name "サーバ名"
  tinyint disabled "収集を無効化しているか (0 or 1)"
  timestamp created_at "行挿入日時"
  timestamp updated_at "行更新日時"
}

% チャンネルテーブル
channels {
  bigint channel_id "チャンネルID"
  bigint guild_id "サーバID"
  text name "チャンネル名"
  tinyint disabled "収集を無効化しているか (0 or 1)"
  timestamp created_at "行挿入日時"
  timestamp updated_at "行更新日時"
}

% スレッドテーブル
threads {
  bigint thread_id "スレッドID"
  bigint guild_id "サーバID"
  bigint channel_id "スレッドが作成されたチャンネルのID"
  text name "スレッド名"
  tinyint disabled "収集を無効化しているか (0 or 1)"
  timestamp created_at "行挿入日時"
  timestamp updated_at "行更新日時"
}

% ユーザテーブル
users {
  bigint user_id "ユーザID"
  text username "ユーザ名"
  varchar discriminator "4桁タグ"
  tinyint bot "Botかどうか (0 or 1)"
  tinyint system "システムBotかどうか (0 or 1)"
  tinyint disabled "収集を無効化しているか (0 or 1)"
  timestamp created_at "行挿入日時"
  timestamp updated_at "行更新日時"
}
```
