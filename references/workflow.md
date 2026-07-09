# 鎶栭煶鍒涗綔骞冲彴鍙戝竷娴佺▼ v4 (AI鐢熸垚灏侀潰鐗?

> **鏍稿績绐佺牬**锛歷4 鍒╃敤鍙充晶棰勮闈㈡澘鐨?AI鐢熸垚"鎸夐挳鑷姩鐢熸垚灏侀潰锛?*褰诲簳瑙ｅ喅浜?File System Access API 鏃犳硶鑷姩鍖栫殑闅鹃**锛?
## 瀹屾暣娴佺▼

```
1. 鎵撳紑鍙戝竷椤?2. 鐧诲綍妫€娴?3. 濉厖鏍囬銆佹憳瑕併€佹鏂?4. 閫夋嫨"鏃犳枃绔犲ご鍥?锛堢粫杩囨枃绔犲ご鍥惧繀濉級
5. 鐐瑰嚮鍙充晶"AI鐢熸垚"鎸夐挳 猸?鍏抽敭
6. 绛夊緟AI鐢熸垚锛垀3绉掞級
7. 鎴浘纭
8. 鐢ㄦ埛鎵嬪姩鐐瑰嚮"鍙戝竷"
9. 楠岃瘉鍙戝竷缁撴灉
```

---

## 1. 鎵撳紑鍙戝竷椤碉紙鍏堝惎鍔?Chrome锛?
### 鍚姩鍛戒护锛堝浐瀹氱敤鎴风洰褰曪級

**蹇呴』鍏堝惎鍔ㄥ甫 CDP 绔彛鐨?Chrome 瀹炰緥**锛堢敤鍥哄畾 user-data-dir 淇濈暀鐧诲綍鎬侊級锛?
```powershell
# start_chrome_douyin.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "$env:USERPROFILE\.chrome_qclaw_stable"
$url = "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new"

Start-Process $chromePath -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  $url
)
```

**涓轰粈涔堢敤鍥哄畾鐩綍**锛?- 鉂?闅忔満涓存椂鐩綍 鈫?姣忔鍏ㄦ柊娴忚鍣紝鏃犵櫥褰曟€?- 鉁?鍥哄畾鐩綍 鈫?鐧诲綍 cookie 鎸佷箙淇濈暀锛屾棤闇€閲嶅鐧诲綍
- 鉁?鑽夌鑷姩淇濆瓨锛岄噸鏂版墦寮€鍙?缁х画缂栬緫"

鍙戝竷椤?URL锛?```
https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new
```

## 2. 鐧诲綍妫€娴?
### 鏈櫥褰曠壒寰?- URL 璺宠浆鍒?`passport.douyin.com` 鎴栧惈 `userAuth`
- 瀛樺湪 `input[placeholder*="鎵嬫満鍙?]`

### 宸茬櫥褰曠壒寰?- URL 鍖呭惈 `creator.douyin.com/creator-micro/content/post/article`
- 鍑虹幇 `input.semi-input`锛堟爣棰樿緭鍏ユ锛夋垨 `.ProseMirror`锛堢紪杈戝櫒锛?
## 3. 濉厖鍐呭

### 3.1 鏍囬
**鍏冪礌**锛歚input[placeholder*="鏍囬"]`

```js
var input = document.querySelector('input[placeholder*="鏍囬"]');
var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
nativeSetter.call(input, '鏍囬鍐呭');
['input','change','keyup','blur'].forEach(function(evt){
  input.dispatchEvent(new Event(evt, {bubbles:true, cancelable:true}));
});
```

### 3.2 鎽樿
**鍏冪礌**锛歚textarea[placeholder*="鎽樿"]`

```js
var textarea = document.querySelector('textarea[placeholder*="鎽樿"]');
var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
nativeSetter.call(textarea, '鎽樿鍐呭');
['input','change','keyup','blur'].forEach(function(evt){
  textarea.dispatchEvent(new Event(evt, {bubbles:true, cancelable:true}));
});
```

### 3.3 姝ｆ枃
**鍏冪礌**锛歚.ProseMirror`锛圱ipTap 缂栬緫鍣級

```js
var editor = document.querySelector('.ProseMirror');
editor.innerHTML = '<p>娈佃惤1</p><p>娈佃惤2</p>';
editor.dispatchEvent(new Event('input', {bubbles:true, cancelable:true}));
```

## 4. 缁曡繃鏂囩珷澶村浘锛堝叧閿楠わ級

鎶栭煶瑕佹眰**鏂囩珷澶村浘**蹇呭～銆傞€氳繃閫夋嫨"鏃犳枃绔犲ご鍥?缁曡繃锛?
```js
var radios = document.querySelectorAll('input[type="radio"]');
// 绗簩涓?radio 鏄?鏃犳枃绔犲ご鍥?
radios[1].checked = true;
radios[1].dispatchEvent(new Event('change', {bubbles:true}));
```

## 5. AI鐢熸垚灏侀潰 猸?v4 鏍稿績绐佺牬

### 鑳屾櫙

鎶栭煶浣跨敤 File System Access API锛坄window.showOpenFilePicker`锛夊疄鐜版枃浠堕€夋嫨锛?*鎵€鏈変紶缁熻嚜鍔ㄥ寲鏂规鍧囧け璐?*锛?- 鉂?CDP `DOM.setFileInputFiles`锛堟棤 file input 鍏冪礌锛?- 鉂?patch `createElement` 鎷︽埅锛圧eact 缂撳瓨鍘熷嚱鏁帮級
- 鉂?patch `HTMLInputElement.prototype.click`锛堟棤 file input锛?- 鉂?Playwright `setInputFiles`锛堟棤 file input锛?- 鉂?鎿嶄綔绯荤粺绾ф枃浠堕€夋嫨鍣紙鏃犳硶閫氳繃娴忚鍣ㄦ帶鍒讹級

### 瑙ｅ喅鏂规锛欰I鐢熸垚

椤甸潰鍙充晶棰勮闈㈡澘鏈変竴涓?**"AI鐢熸垚"** 鎸夐挳锛坄class="aiButton-x4dXs_"`锛夛紝鐐瑰嚮鍚庢姈闊充細鑷姩鏍规嵁鏂囩珷鍐呭鐢熸垚灏侀潰鍥撅紝**鏃犻渶鎵嬪姩涓婁紶鏂囦欢**銆?
**鍏冪礌瀹氫綅**锛?```js
// 涓婚€夋嫨鍣?var btn = document.querySelector('.aiButton-x4dXs_');
// 澶囩敤锛氭寜鏂囨湰鏌ユ壘
if (!btn) {
  var divs = document.querySelectorAll('div');
  for (var i = 0; i < divs.length; i++) {
    if (divs[i].innerText === 'AI鐢熸垚') {
      btn = divs[i];
      break;
    }
  }
}
```

**鐐瑰嚮瑙﹀彂**锛堜娇鐢?MouseEvent 搴忓垪缁曡繃閮ㄥ垎浜嬩欢鎷︽埅锛夛細
```js
btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
btn.dispatchEvent(new MouseEvent('click', {bubbles:true}));
```

**绛夊緟鐢熸垚**锛?```js
await new Promise(r => setTimeout(r, 3000));
```

**楠岃瘉鐢熸垚鎴愬姛**锛?```js
var hasImage = document.querySelector('img[class*="cover"]') !== null;
// hasImage 搴斾负 true
```

### AI鐢熸垚鎸夐挳浣嶇疆
- 浣嶇疆锛氶〉闈?*鍙充晶棰勮闈㈡澘**锛堟墜鏈洪瑙堜笅鏂癸級
- 绫诲悕锛歚.aiButton-x4dXs_`
- 鐖跺鍣細`.actions-b7y1wo`
- 鏂囨湰锛歚AI鐢熸垚`

## 6. 灏濊瘯鐐瑰嚮鍙戝竷 + 瀹夊叏楠岃瘉澶勭悊

鑴氭湰浼氬皾璇曠偣鍑诲彂甯冩寜閽紝骞舵娴嬫槸鍚﹁Е鍙?*鎶栭煶璐﹀彿瀹夊叏楠岃瘉**銆?
### 瀹夊叏楠岃瘉寮圭獥锛?026-07-06 鏂板彂鐜帮級

**鐜拌薄**锛氳嚜鍔ㄥ寲鐐瑰嚮"鍙戝竷"鎸夐挳鍚庯紝瑙﹀彂銆屾帴鏀剁煭淇￠獙璇佺爜銆嶅脊绐?
**寮圭獥鐗瑰緛**锛?- 鏍囬锛氥€屾帴鏀剁煭淇￠獙璇佺爜銆?- 鍐呭锛?涓虹‘淇濇槸鏈汉鎿嶄綔鎶栭煶璐﹀彿锛岃杈撳叆褰撳墠鎵嬫満鍙?50****56鏀跺埌鐨勭煭淇￠獙璇佺爜"
- 閫夐」锛氥€屽彇娑堛€嶃€岄獙璇併€嶃€屼娇鐢ㄥ師璁惧鎵爜銆?
**閲嶈鍙戠幇**锛?- 杩欎笉鏄?React `isTrusted` 闄愬埗锛岃€屾槸**骞冲彴绾ч鎺х瓥鐣?*
- 鍙戝竷鎸夐挳**鍙互琚嚜鍔ㄥ寲鐐瑰嚮**锛屼絾浼氳Е鍙戝畨鍏ㄩ獙璇?- 楠岃瘉寮圭獥鐨?DOM 缁撴瀯鐗规畩锛屽父瑙勯€夋嫨鍣ㄩ毦浠ュ畾浣嶃€屽彇娑堛€嶆寜閽?
### 楠岃瘉妫€娴嬮€昏緫

鑴氭湰浼氭娴嬩互涓嬬被鍨嬬殑楠岃瘉锛?- **鐭俊楠岃瘉寮圭獥**锛坄鎺ユ敹鐭俊楠岃瘉鐮乣 鏂囨湰锛?- 婊戝潡楠岃瘉锛坣c_wrapper銆乼captcha-slide锛?- 鐐归€夐獙璇侊紙yidun_modal銆乬eetest_panel锛?- 楠岃瘉鐮佽緭鍏ユ
- 鍏ㄥ睆閬僵寮圭獥

### 楠岃瘉瑙﹀彂鏃剁殑澶勭悊

濡傛灉妫€娴嬪埌楠岃瘉锛岃剼鏈細锛?1. ~~灏濊瘯鐐瑰嚮鍏抽棴鎸夐挳鍙栨秷楠岃瘉~~锛堥毦浠ュ畾浣嶏紝閫氬父澶辫触锛?2. ~~鎸?ESC 閿畘~锛堟湭娴嬭瘯锛?3. **鐩存帴鐐瑰嚮銆屾殏瀛樼寮€銆嶄繚瀛樿崏绋?*锛堢粫杩囧脊绐楋級
4. 鎻愮ず鐢ㄦ埛鎵嬪姩瀹屾垚鍙戝竷

```js
// 妫€娴嬬粨鏋滅ず渚?{
  slider: false,        // 鏄惁鏈夋粦鍧?  clickVerify: false,   // 鏄惁鏈夌偣閫夐獙璇?  verifyModal: true,    // 鏄惁鏈夐獙璇佸脊绐?猸?  overlay: false,       // 鏄惁鏈夐伄缃?  codeInput: false,     // 鏄惁鏈夐獙璇佺爜杈撳叆
  hasVerify: true       // 鏄惁鏈夐獙璇佹彁绀?}

// 澶勭悊娴佺▼
if (result.verifyModal || result.hasVerify) {
  console.log('妫€娴嬪埌瀹夊叏楠岃瘉锛屼繚瀛樿崏绋?..');
  await clickSaveDraft();  // 銆屾殏瀛樼寮€銆嶄笉鍙楀脊绐楀奖鍝?  return { success: false, reason: 'verification_required', saved: true };
}
```

### 澶勭悊鏂规瀵规瘮

| 鏂规 | 鎻忚堪 | 閫傜敤鍦烘櫙 |
|------|------|----------|
| **A. 娣峰悎宸ヤ綔娴?* | 鑴氭湰濉唴瀹?鈫?鐢ㄦ埛鎵嬪姩鐐瑰嚮鍙戝竷 鈫?鐢ㄦ埛瀹屾垚楠岃瘉 | **鎺ㄨ崘**锛屾渶绋冲畾 |
| **B. 楠岃瘉鍚庤嚜鍔ㄥ寲** | 鑴氭湰鐐瑰嚮鍙戝竷 鈫?鎻愮ず鐢ㄦ埛楠岃瘉 鈫?绛夊緟鍚庣户缁?| 闇€鐢ㄦ埛瀹炴椂閰嶅悎 |
| **C. 鑽夌妯″紡** | 妫€娴嬪埌楠岃瘉 鈫?鐩存帴淇濆瓨鑽夌 鈫?鐢ㄦ埛鍚庣画鎵嬪姩鍙戝竷 | 褰撳墠瀹炵幇锛屽彲闈?|

## 7. 淇濆瓨鑽夌

濡傞€夋嫨"鏆傚瓨绂诲紑"鎴栧彂甯冭楠岃瘉闃绘柇锛?- 鐐瑰嚮"鏆傚瓨绂诲紑"鎸夐挳
- 椤甸潰璺宠浆鍒板唴瀹圭鐞嗛〉
- 鑽夌鑷姩淇濆瓨

## 8. 楠岃瘉鍙戝竷缁撴灉

```js
// 妫€鏌?URL 鍙樺寲
var currentUrl = window.location.href;
// 鎴愬姛鍙戝竷锛歎RL 鍖呭惈 /content/manage/ 鎴?/success
// 淇濆瓨鑽夌锛歎RL 鍖呭惈 /content/upload
```

---

## 鍏抽敭缁忛獙鎬荤粨锛坴4锛?
### 鎴愬姛瑕佺礌
1. **AI鐢熸垚鎸夐挳鏄皝闈㈤棶棰樼殑鏈€浣宠В鍐虫柟妗?* 鈥?瀹屽叏閬垮紑 FSA API 闄愬埗
2. **MouseEvent 搴忓垪瑙﹀彂** 鈥?瀵?AI鐢熸垚鎸夐挳鏈夋晥锛堜笌鍙戝竷鎸夐挳涓嶅悓锛?3. **鍏冪礌瀹氫綅浼樺厛绾?* 鈥?浼樺厛鐢?`class` 閫夋嫨鍣紝鍥為€€鍒?`innerText` 鍖归厤
4. **鍓綔鐢?*锛氱偣鍑?AI鐢熸垚"鍙兘瀵艰嚧椤甸潰鐘舵€佸埛鏂帮紝闇€鍦?AI鐢熸垚**涔嬪墠**瀹屾垚鍐呭濉厖

### 澶辫触鏁欒涓庝慨姝?1. ~~**鍙戝竷鎸夐挳鏃犳硶鑷姩鍖?*~~ 鈫?**鍙戝竷鎸夐挳鍙互鑷姩鍖栫偣鍑伙紝浣嗕細瑙﹀彂瀹夊叏楠岃瘉**
   - 涔嬪墠璇垽涓?React `isTrusted` 闄愬埗
   - 瀹為檯鏄姈闊冲钩鍙扮殑椋庢帶绛栫暐锛堢煭淇?鎵爜楠岃瘉锛?2. **FSA API 鏃犳硶缁曡繃** 鈥?娴忚鍣ㄥ畨鍏ㄧ瓥鐣ュ喅瀹氾紙姝ｇ‘锛?3. **椤甸潰鐘舵€佸彲鑳戒涪澶?* 鈥?AI鐢熸垚瑙﹀彂鍚庤〃鍗曞彲鑳借閲嶇疆锛堟纭級
4. **楠岃瘉寮圭獥闅句互鍏抽棴** 鈥?DOM 缁撴瀯鐗规畩锛屽父瑙勯€夋嫨鍣ㄦ棤娉曞畾浣嶃€屽彇娑堛€嶆寜閽?
### v3 vs v4 瀵规瘮

| 椤圭洰 | v3 | v4 |
|------|-----|-----|
| 灏侀潰鏂规 | 鎵嬪姩閫夋嫨"鏃犳枃绔犲ご鍥? + 鎵嬪姩涓婁紶 | **AI鑷姩鐢熸垚** 猸?|
| 鐢ㄦ埛鎿嶄綔 | 闇€鎵嬪姩閫夋枃浠讹紙鎿嶄綔绯荤粺瀵硅瘽妗嗭級 | **浠呴渶鐐瑰嚮"鍙戝竷"** 猸?|
| 鎴愬姛鐜?| 鍙栧喅浜庣敤鎴锋搷浣?| **瀹屽叏鑷姩鍖栧皝闈?* 猸?|
| 姝ラ | 5姝?| 4姝?|

---

## 甯歌闂

### Q: AI鐢熸垚鎸夐挳鐐瑰嚮鍚庨〉闈㈣鍒锋柊锛?**A**: 杩欐槸姝ｅ父鐜拌薄銆侫I鐢熸垚瀹屾垚鍚庯紝椤甸潰鍙兘閲嶆柊娓叉煋锛屽鑷翠箣鍓嶅～鍏ョ殑鏍囬/鎽樿/姝ｆ枃涓㈠け銆?*瑙ｅ喅鏂规**锛氬湪 AI鐢熸垚**涔嬪墠**瀹屾垚鎵€鏈夊唴瀹瑰～鍏咃紝鎴栧湪 AI鐢熸垚鍚?*閲嶆柊濉厖**銆?
### Q: AI鐢熸垚澶辫触锛?**A**: 鎶栭煶鐨?AI 鐢熸垚鍔熻兘鍙兘鍙楃綉缁?璐﹀彿鏉冮檺闄愬埗銆傚鏋滅敓鎴愬け璐ワ細
1. 绛夊緟鍑犵鍚庨噸璇?2. 妫€鏌ョ綉缁滆繛鎺?3. 鍥為€€鍒?v3 鏂规锛氶€夋嫨"鏃犳枃绔犲ご鍥? + 鎵嬪姩涓婁紶

### Q: 鍐呭濉叆鍚庡張琚竻绌猴紵
**A**: 鍙兘鍘熷洜锛?- 鐐瑰嚮 AI鐢熸垚 瀵艰嚧椤甸潰閲嶆覆鏌?- 娴忚鍣ㄨ嚜鍔ㄤ繚瀛樿崏绋垮墠鐨勭姸鎬佹竻鐞?- **瑙ｅ喅鏂规**锛氬厛濉唴瀹癸紝鍐嶇偣 AI鐢熸垚锛屾埅鍥惧墠鍐嶆楠岃瘉鍐呭

### Q: 鎽樿杈撳叆妗嗘壘涓嶅埌锛?**A**: 鎽樿杈撳叆妗嗗彲鑳藉洜涓洪〉闈㈡洿鏂拌€?class 鍙樺寲銆傚彲鐢ㄤ互涓嬫柟娉曟煡鎵撅細
```js
document.querySelector('textarea[placeholder*="鎽樿"]')
// 鎴栨洿瀹芥澗
document.querySelectorAll('textarea')[0]
```
