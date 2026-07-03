/**
 * おはツイキーホルダー 画像受付フォーム — 受け取り用 Google Apps Script
 * ============================================================================
 * index.html から送られてくる「表面(imageFront) / 裏面(imageBack)」の2枚を
 * Google Drive のフォルダに保存し、スプレッドシートに1行ずつ記録します。
 *
 * clasp でのデプロイ手順は gas/README.md を参照。
 * FOLDER_ID を空のままにしておくと、マイドライブに FOLDER_NAME のフォルダを
 * 自動作成してそこへ保存するので、設定なしでもそのまま動きます。
 * SHEET_ID も空のままでよく、初回実行時に記録用スプレッドシートを自動作成して
 * Script Properties（LOG_SHEET_ID）に覚えておき、以降はそこへ追記し続けます。
 * ============================================================================
 */

// ▼▼▼ 設定（未設定でも動作します） ▼▼▼
const FOLDER_ID   = '';                      // 保存先フォルダID。空なら FOLDER_NAME を自動作成
const FOLDER_NAME = 'おはツイキーホルダー受付';  // FOLDER_ID が空のときに使う保存先フォルダ名
const SHEET_ID    = '';                      // 記録用スプレッドシートID。空なら自動作成して以降使い回す
// ▲▲▲ 設定 ▲▲▲

/** 疎通確認用。デプロイ後にブラウザで /exec を開くと OK 表示になります。 */
function doGet() {
  return jsonOut({ status: 'ok', message: 'ohatsui-uketsuke receiver is running' });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = getUploadFolder_();

    // ファイル名に使えない文字を除去し、長すぎる名前を防ぐ
    const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 50);
    const base  = (safe(data.orderId) || 'noorder') + '_' + (safe(data.name) || 'noname');
    const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');

    // 表面・裏面の2枚を保存
    const savedUrls = {};
    [['Front', '表'], ['Back', '裏']].forEach(function (pair) {
      const key   = pair[0];               // 'Front' | 'Back'
      const label = pair[1];               // '表' | '裏'
      const dataUrl = data['image' + key]; // imageFront | imageBack
      if (!dataUrl) return;

      const m = String(dataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
      if (!m) return;

      const blob = Utilities.newBlob(
        Utilities.base64Decode(m[2]),
        m[1],
        base + '_' + label + '_' + stamp + '.png'
      );
      const file = folder.createFile(blob);
      savedUrls[key] = file.getUrl();
    });

    // 表・裏の両方がそろっていなければエラー扱い
    if (!savedUrls.Front || !savedUrls.Back) {
      return jsonOut({ status: 'error', message: '表面・裏面の画像がそろっていません' });
    }

    // スプレッドシートに1行追記（画像保存が主目的なので、失敗しても doPost 全体は成功を返す）
    try {
      const sheet = getLogSheet_();
      sheet.appendRow([
        new Date(),
        data.name || '',
        data.orderId || '',
        data.email || '',
        data.note || '',
        savedUrls.Front,
        savedUrls.Back
      ]);
    } catch (logErr) {
      Logger.log('スプレッドシート記録に失敗しました: ' + logErr);
    }

    return jsonOut({ status: 'ok', files: savedUrls });
  } catch (err) {
    return jsonOut({ status: 'error', message: String(err) });
  }
}

/** FOLDER_ID があればそれを、無ければ FOLDER_NAME のフォルダを取得（無ければ作成）。 */
function getUploadFolder_() {
  if (FOLDER_ID) {
    return DriveApp.getFolderById(FOLDER_ID);
  }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

/**
 * 記録用スプレッドシートの先頭シートを取得する。
 * 1. SHEET_ID が指定されていればそれを開く（手動指定を優先）
 * 2. Script Properties に LOG_SHEET_ID が保存されていればそれを開く
 * 3. どちらも無ければ新規作成し、ヘッダ行を書き込んで ID を保存する
 */
function getLogSheet_() {
  if (SHEET_ID) {
    return SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  }

  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('LOG_SHEET_ID');
  if (savedId) {
    return SpreadsheetApp.openById(savedId).getSheets()[0];
  }

  const ss = SpreadsheetApp.create('おはツイキーホルダー受付ログ');
  const sheet = ss.getSheets()[0];
  sheet.appendRow(['日時', 'お名前', '注文番号', 'メール', '備考', '表URL', '裏URL']);
  props.setProperty('LOG_SHEET_ID', ss.getId());
  return sheet;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
