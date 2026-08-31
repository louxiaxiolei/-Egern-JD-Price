// JD_Price_Egern.js
// Egern native adaptation of the JD price comparison workflow.
// Original workflow referenced by user: https://raw.githubusercontent.com/githubdulong/Script/master/jd_price.js

const PATH_PRICE = "/product/graphext/";
const PATH_TOKEN = "/baoliao/center/menu";
const STORAGE_KEY = "manmanbuy_val";
const VERSION_KEY = "mmb_v";
const SECRET_KEY = "3E41D1331F5DDAFCD0A38FE2D52FF66F";

export default async function (ctx) {
  const url = ctx.request?.url || "";

  // 1) Capture manmanbuy request body / token
  if (url.includes(PATH_TOKEN)) {
    const reqBody = await ctx.request.text();
    ctx.storage.set(STORAGE_KEY, reqBody);

    ctx.notify({
      title: "京东比价",
      subtitle: "获取 CK 成功🎉",
      body: "慢慢买令牌已保存"
    });

    // Body was consumed, return it so the original request is preserved.
    return { body: reqBody };
  }

  // 2) Inject historical price info into JD graphext page
  if (url.includes(PATH_PRICE) && ctx.response) {
    const responseBody = await ctx.response.text();

    try {
      const body = await buildPricePage(ctx, url, responseBody);
      return { body };
    } catch (err) {
      const msg = err?.message || String(err);
      console.log(`[京东比价] ${msg}`);
      const html = `<div style="max-width:90%;margin:20px auto;padding:16px;background:#fff;color:#d32f2f;border:2px solid #f44336;border-radius:12px;font-size:16px;text-align:left;box-shadow:0 2px 6px rgba(0,0,0,.06);"><strong>${escapeHtml(msg)}</strong></div>`;
      return { body: injectAfterBody(responseBody, html) };
    }
  }
}

async function buildPricePage(ctx, url, responseBody) {
  const match = url.match(/product\/graphext\/(\d+)\.html/);
  if (!match) throw new Error("京东 URL 匹配失败");

  const jdUrl = `https://item.jd.com/${match[1]}.html`;
  const version = ctx.storage.get(VERSION_KEY) || "V1";

  let link = jdUrl;
  let stteId;

  if (version === "V2") {
    const parsed = checkRes(
      await getStteId(ctx, jdUrl),
      "获取 stteId [V2]"
    );
    link = parsed?.result?.link;
    stteId = parsed?.result?.stteId;
  }

  const basic = checkRes(
    await getSpbh(ctx, link, stteId, version),
    "获取 spbh [V1/V2]"
  );

  const trendRes = checkRes(
    await getHistoryTrend(ctx, basic?.result?.url, basic?.result?.spbh),
    "获取价格趋势"
  );

  const remarkRes = checkRes(
    await getPriceRemark(ctx, trendRes?.result?.trend),
    "价格备注"
  );

  const details = remarkRes?.remark?.ListPriceDetail;
  if (!Array.isArray(details)) {
    throw new Error("慢慢买返回的价格数据为空");
  }

  const keep = new Set([
    "当前到手价",
    "历史最低价",
    "618价格",
    "双11价格",
    "30天最低价",
    "60天最低价",
    "180天最低价"
  ]);

  const list = details.filter((i) => keep.has(i?.Name));
  const html = priceHtml(list);
  return injectAfterBody(responseBody, html);
}

function checkRes(res, desc = "") {
  if (!res || res.ok !== 1) {
    console.log("[京东比价] 慢慢买返回：", JSON.stringify(res));
    throw new Error(`慢慢买提示您：${res?.msg || `${desc}失败`}`);
  }
  return res;
}

function priceHtml(priceList) {
  const rows = priceList.map((item) => {
    let {
      Name: name = "",
      Date: date = "",
      Price: price = "",
      Difference: diff = ""
    } = item || {};

    if (name === "当前到手价") {
      date = formatDate(new Date());
      diff = "仅供参考";
    } else {
      date = date || "-";
    }

    let diffClass = "";
    if (String(diff).startsWith("↑")) diffClass = "up";
    else if (String(diff).startsWith("↓")) diffClass = "down";

    return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(date)}</td><td>${escapeHtml(price)}</td><td class="price-diff ${diffClass}">${escapeHtml(diff)}</td></tr>`;
  }).join("");

  return `<div class="price-container"><table class="price-table"><thead><tr><th>类型</th><th>日期</th><th>价格</th><th>差价</th></tr></thead><tbody>${rows}</tbody></table></div><style>body,table{font-family:"PingFang SC","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif}.price-container{max-width:800px;margin:10px auto;padding:10px;font-size:13px;font-weight:bold;background:#FFF9F9;color:#333;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.05)}.price-table{width:100%;border-collapse:separate;border-spacing:0;border-radius:8px;overflow:hidden}.price-table th{background:#e61a23;color:#fff;padding:12px;text-align:left;font-weight:bold}.price-table td{padding:12px;border-bottom:1px solid #EEE;font-weight:bold}.price-diff.up{color:#C91623;font-weight:bold}.price-diff.down{color:#00aa00;font-weight:bold}</style>`;
}

async function mmbRequest(ctx, params, url) {
  if (!ctx.__manmanbuy) {
    ctx.__manmanbuy = getCk(ctx);
  }

  let payloadStr;
  if (typeof params === "string") {
    payloadStr = params;
  } else {
    const requestBody = {
      ...ctx.__manmanbuy,
      ...params,
      t: Date.now().toString()
    };

    requestBody.token = md5(
      encodeURIComponent(
        SECRET_KEY + jsonToCustomString(requestBody) + SECRET_KEY
      )
    ).toUpperCase();

    payloadStr = jsonToQueryString(requestBody);
  }

  const resp = await ctx.http.post(url, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"
    },
    body: payloadStr,
    timeout: 15000
  });

  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getStteId(ctx, searchKey) {
  return mmbRequest(ctx, {
    methodName: "commonMethod",
    searchKey
  }, "https://apapia-common.manmanbuy.com/SiteCommand/parse");
}

function getSpbh(ctx, link, stteId, version) {
  const base = "https://apapia-history-weblogic.manmanbuy.com/basic";
  const url = version === "V2"
    ? `${base}/v2/getItemBasicInfo`
    : `${base}/getItemBasicInfo`;

  return mmbRequest(ctx, {
    methodName: "getHistoryInfoJava",
    searchKey: link,
    ...(version === "V2" ? { stteId } : {})
  }, url);
}

function getHistoryTrend(ctx, link, spbh) {
  return mmbRequest(ctx, {
    methodName: "getHistoryTrend2021",
    url: link,
    spbh
  }, "https://apapia-history-weblogic.manmanbuy.com/history/v2/getHistoryTrend");
}

async function getPriceRemark(ctx, jiagequshiyh) {
  const res = await mmbRequest(ctx, {
    methodName: "priceRemarkJava",
    jiagequshiyh
  }, "https://apapia-history-weblogic.manmanbuy.com/history/priceRemark");
  console.log("[京东比价] priceRemark:", JSON.stringify(res));
  return res;
}

function getCk(ctx) {
  const ck = ctx.storage.get(STORAGE_KEY);
  if (!ck) {
    ctx.notify({
      title: "京东比价",
      subtitle: "未获取慢慢买 CK",
      body: "请先打开【慢慢买】App，并进入“我的”页面"
    });
    throw new Error("请先打开【慢慢买】APP，点击“我的”获取 CK");
  }

  const params = parseQueryString(ck);
  if (!params || !params.c_mmbDevId) {
    ctx.notify({
      title: "京东比价",
      subtitle: "CK 数据异常",
      body: "未找到 c_mmbDevId"
    });
    throw new Error("慢慢买 CK 格式异常");
  }

  return initCk(params);
}

function initCk(params) {
  const baseParams = {
    jsoncallback: "?",
    c_individ: "",
    c_appver: "",
    c_ostype: "",
    c_osver: "",
    c_devid: "",
    c_mmbDevId: "",
    c_systemDevId: "",
    c_fixDevId: "",
    c_devmodel: "",
    c_brand: "",
    c_operator: "",
    c_engine: "",
    c_session: "",
    c_ddToken: "",
    c_ctrl: "",
    c_win: "",
    c_dp: "",
    c_safearea: "",
    c_firstchannel: "",
    c_firstquerendate: "",
    c_fristversion: "",
    c_channel: "",
    c_uuid: "",
    c_ssid: "",
    c_did: "",
    c_theme: "",
    c_jpush: "",
    c_mmbncid: "",
    sm_deviceid: ""
  };

  const merged = { ...baseParams };
  for (const [key, value] of Object.entries(params)) {
    if (key in baseParams) merged[key] = value;
  }
  return merged;
}

function parseQueryString(queryString) {
  const obj = {};
  for (const pair of String(queryString).split("&")) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    const rawKey = index >= 0 ? pair.slice(0, index) : pair;
    const rawValue = index >= 0 ? pair.slice(index + 1) : "";
    obj[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
  }
  return obj;
}

function jsonToQueryString(obj) {
  return Object.keys(obj)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
    .join("&");
}

function jsonToCustomString(obj) {
  return Object.keys(obj)
    .filter((key) => obj[key] !== "" && key.toLowerCase() !== "token")
    .sort()
    .map((key) => `${key.toUpperCase()}${String(obj[key]).toUpperCase()}`)
    .join("");
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function injectAfterBody(body, html) {
  if (/<body[^>]*>/i.test(body)) {
    return body.replace(/<body[^>]*>/i, (m) => `${m}${html}`);
  }
  return html + body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Compact MD5 implementation */
function md5(str) {
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a,b,c,d,x,s,t){ return cmn((b & c) | ((~b) & d),a,b,x,s,t); }
  function gg(a,b,c,d,x,s,t){ return cmn((b & d) | (c & (~d)),a,b,x,s,t); }
  function hh(a,b,c,d,x,s,t){ return cmn(b ^ c ^ d,a,b,x,s,t); }
  function ii(a,b,c,d,x,s,t){ return cmn(c ^ (b | (~d)),a,b,x,s,t); }

  const bytes = unescape(encodeURIComponent(str));
  const n = bytes.length;
  const words = [];
  for (let i = 0; i < n; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes.charCodeAt(i) << ((i % 4) * 8));
  }
  words[n >> 2] = (words[n >> 2] || 0) | (0x80 << ((n % 4) * 8));
  words[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;

  let a = 0x67452301, b = -0x10325477, c = -0x67452302, d = 0x10325476;

  for (let i = 0; i < words.length; i += 16) {
    const oa=a, ob=b, oc=c, od=d;
    const x = [];
    for (let j=0;j<16;j++) x[j]=words[i+j] || 0;

    a=ff(a,b,c,d,x[0],7,-680876936); d=ff(d,a,b,c,x[1],12,-389564586); c=ff(c,d,a,b,x[2],17,606105819); b=ff(b,c,d,a,x[3],22,-1044525330);
    a=ff(a,b,c,d,x[4],7,-176418897); d=ff(d,a,b,c,x[5],12,1200080426); c=ff(c,d,a,b,x[6],17,-1473231341); b=ff(b,c,d,a,x[7],22,-45705983);
    a=ff(a,b,c,d,x[8],7,1770035416); d=ff(d,a,b,c,x[9],12,-1958414417); c=ff(c,d,a,b,x[10],17,-42063); b=ff(b,c,d,a,x[11],22,-1990404162);
    a=ff(a,b,c,d,x[12],7,1804603682); d=ff(d,a,b,c,x[13],12,-40341101); c=ff(c,d,a,b,x[14],17,-1502002290); b=ff(b,c,d,a,x[15],22,1236535329);

    a=gg(a,b,c,d,x[1],5,-165796510); d=gg(d,a,b,c,x[6],9,-1069501632); c=gg(c,d,a,b,x[11],14,643717713); b=gg(b,c,d,a,x[0],20,-373897302);
    a=gg(a,b,c,d,x[5],5,-701558691); d=gg(d,a,b,c,x[10],9,38016083); c=gg(c,d,a,b,x[15],14,-660478335); b=gg(b,c,d,a,x[4],20,-405537848);
    a=gg(a,b,c,d,x[9],5,568446438); d=gg(d,a,b,c,x[14],9,-1019803690); c=gg(c,d,a,b,x[3],14,-187363961); b=gg(b,c,d,a,x[8],20,1163531501);
    a=gg(a,b,c,d,x[13],5,-1444681467); d=gg(d,a,b,c,x[2],9,-51403784); c=gg(c,d,a,b,x[7],14,1735328473); b=gg(b,c,d,a,x[12],20,-1926607734);

    a=hh(a,b,c,d,x[5],4,-378558); d=hh(d,a,b,c,x[8],11,-2022574463); c=hh(c,d,a,b,x[11],16,1839030562); b=hh(b,c,d,a,x[14],23,-35309556);
    a=hh(a,b,c,d,x[1],4,-1530992060); d=hh(d,a,b,c,x[4],11,1272893353); c=hh(c,d,a,b,x[7],16,-155497632); b=hh(b,c,d,a,x[10],23,-1094730640);
    a=hh(a,b,c,d,x[13],4,681279174); d=hh(d,a,b,c,x[0],11,-358537222); c=hh(c,d,a,b,x[3],16,-722521979); b=hh(b,c,d,a,x[6],23,76029189);
    a=hh(a,b,c,d,x[9],4,-640364487); d=hh(d,a,b,c,x[12],11,-421815835); c=hh(c,d,a,b,x[15],16,530742520); b=hh(b,c,d,a,x[2],23,-995338651);

    a=ii(a,b,c,d,x[0],6,-198630844); d=ii(d,a,b,c,x[7],10,1126891415); c=ii(c,d,a,b,x[14],15,-1416354905); b=ii(b,c,d,a,x[5],21,-57434055);
    a=ii(a,b,c,d,x[12],6,1700485571); d=ii(d,a,b,c,x[3],10,-1894986606); c=ii(c,d,a,b,x[10],15,-1051523); b=ii(b,c,d,a,x[1],21,-2054922799);
    a=ii(a,b,c,d,x[8],6,1873313359); d=ii(d,a,b,c,x[15],10,-30611744); c=ii(c,d,a,b,x[6],15,-1560198380); b=ii(b,c,d,a,x[13],21,1309151649);
    a=ii(a,b,c,d,x[4],6,-145523070); d=ii(d,a,b,c,x[11],10,-1120210379); c=ii(c,d,a,b,x[2],15,718787259); b=ii(b,c,d,a,x[9],21,-343485551);

    a=add32(a,oa); b=add32(b,ob); c=add32(c,oc); d=add32(d,od);
  }

  function hex(n) {
    let s="";
    for (let j=0;j<4;j++) s += ("0"+((n >> (j*8)) & 0xFF).toString(16)).slice(-2);
    return s;
  }
  return hex(a)+hex(b)+hex(c)+hex(d);
}
