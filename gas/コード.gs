/**
 * おはツイキーホルダー 画像受付フォーム — 受け取り用 Google Apps Script
 * ============================================================================
 * index.html から送られてくる「表面(imageFront) / 裏面(imageBack)」の2枚を
 * Google Drive のフォルダに保存し、（任意で）スプレッドシートに記録します。
 *
 * clasp でのデプロイ手順は gas/README.md を参照。
 * FOLDER_ID を空のままにしておくと、マイドライブに FOLDER_NAME のフォルダを
 * 自動作成してそこへ保存するので、設定なしでもそのまま動きます。
 * ============================================================================
 */

// ▼▼▼ 設定（未設定でも動作します） ▼▼▼
const FOLDER_ID   = '';                      // 保存先フォルダID。空なら FOLDER_NAME を自動作成
const FOLDER_NAME = 'おはツイキーホルダー受付';  // FOLDER_ID が空のときに使う保存先フォルダ名
const SHEET_ID    = '';                      // 記録用スプレッドシートID（不要なら空のまま）
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

    // （任意）スプレッドシートに1行追記
    if (SHEET_ID) {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
      sheet.appendRow([
        new Date(),
        data.name || '',
        data.orderId || '',
        data.email || '',
        data.note || '',
        savedUrls.Front,
        savedUrls.Back
      ]);
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

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
