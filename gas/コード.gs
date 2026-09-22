/**
 * おはツイ 画像受付フォーム — 受け取り用 Google Apps Script
 *
 * index.html から送られてくる画像を Google Drive のフォルダに保存し、
 * スプレッドシートに1行ずつ記録します。
 *
 * 対応商品:
 *   - キーホルダー … 表面(imageFront) / 裏面(imageBack) の2枚必須
 *   - 缶バッジ   … 表面(imageFront) のみ（円形 PNG）。裏面は不要
 *
 * clasp でのデプロイ手順は gas/README.md を参照。
 * FOLDER_ID を空のままにしておくと、マイドライブに FOLDER_NAME のフォルダを
 * 自動作成してそこへ保存するので、設定なしでもそのまま動きます。
 * SHEET_ID も空のままでよく、初回実行時に記録用スプレッドシートを自動作成して
 * Script Properties（LOG_SHEET_ID）に覚えておき、以降はそこへ追記し続けます。
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
    const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    // 商品タイプ（未指定時は互換のためキーホルダー扱い）
    const productType = (data.productType === '缶バッジ') ? '缶バッジ' : 'キーホルダー';
    const isBadge = productType === '缶バッジ';
    // 注文経路（Booth / リアルイベント現地）。未指定時は互換のため Booth 扱い
    const orderSource = (data.orderSource === 'リアルイベント現地') ? 'リアルイベント現地' : 'Booth';
    // 印刷モード（フチあり/フチなし）。缶バッジはフチ設定なし
    const mode = isBadge
      ? '缶バッジ'
      : ((data.borderMode === 'フチあり' || data.borderMode === 'フチなし') ? data.borderMode : '未指定');

    // ファイル名用ベース（現地注文は注文番号の代わりに event を使う）
    const orderPart = (orderSource === 'リアルイベント現地')
      ? 'event'
      : (safe(data.orderId) || 'noorder');
    const base = orderPart + '_' + (safe(data.name) || 'noname');

    // 表面・裏面を保存（裏面はキーホルダーのみ必須）
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
        base + '_' + label + '_' + mode + '_' + stamp + '.png'
      );
      const file = folder.createFile(blob);
      savedUrls[key] = file.getUrl();
    });

    // 表は必須。裏はキーホルダーのみ必須（缶バッジは片面）
    if (!savedUrls.Front) {
      return jsonOut({ status: 'error', message: '表面の画像がありません' });
    }
    if (!isBadge && !savedUrls.Back) {
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
        savedUrls.Front || '',
        savedUrls.Back || '',
        mode,
        data.nfcUrl || '',
        productType,
        orderSource
      ]);
    } catch (logErr) {
      Logger.log('スプレッドシート記録に失敗しました: ' + logErr);
    }

    return jsonOut({ status: 'ok', files: savedUrls, productType: productType, orderSource: orderSource });
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
  const HEADER = ['日時', 'お名前', '注文番号', 'メール', '備考', '表URL', '裏URL', 'フチ設定', 'NFC URL', '商品タイプ', '注文経路'];
  let sheet;

  if (SHEET_ID) {
    sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  } else {
    const props = PropertiesService.getScriptProperties();
    const savedId = props.getProperty('LOG_SHEET_ID');
    if (savedId) {
      sheet = SpreadsheetApp.openById(savedId).getSheets()[0];
    } else {
      const ss = SpreadsheetApp.create('おはツイキーホルダー受付ログ');
      sheet = ss.getSheets()[0];
      sheet.appendRow(HEADER);
      props.setProperty('LOG_SHEET_ID', ss.getId());
      return sheet;
    }
  }

  // 既存シートの見出しに不足列があれば末尾へ補う（旧バージョンからの引き継ぎ用）
  if (sheet.getLastRow() >= 1) {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
    ['フチ設定', 'NFC URL', '商品タイプ', '注文経路'].forEach(function (colName) {
      if (existing.indexOf(colName) === -1) {
        sheet.getRange(1, existing.length + 1).setValue(colName);
        existing.push(colName);
      }
    });
  }
  return sheet;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
