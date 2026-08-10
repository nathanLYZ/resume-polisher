// ==UserScript==
// @name         BOSS直聘 JD 发送到简历润色助手 v3.3
// @namespace    https://localhost:3000
// @version      3.3
// @description  在BOSS直聘职位详情页一键将JD发送到简历润色助手
// @author       Resume Polisher
// @match        https://www.zhipin.com/*
// @match        http://www.zhipin.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  var APP_BASE_URL = "http://localhost:3000";
  var API_ENDPOINT = APP_BASE_URL + "/api/import-jd";

  var css =
    "#rp-float-btn{position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;" +
    "background:linear-gradient(135deg,#2563eb,#1d4ed8)!important;color:#fff!important;border:none!important;" +
    "border-radius:28px!important;padding:12px 20px!important;font-size:14px!important;font-weight:600!important;" +
    "cursor:pointer!important;box-shadow:0 4px 16px rgba(37,99,235,0.4)!important;display:flex!important;" +
    "align-items:center!important;gap:6px!important;line-height:1!important;" +
    "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif!important}" +
    "#rp-float-btn:hover{transform:translateY(-2px)!important}" +
    "#rp-float-btn.sending{opacity:.7!important;pointer-events:none!important}" +
    "#rp-float-btn.success{background:linear-gradient(135deg,#16a34a,#15803d)!important}" +
    "#rp-float-btn.error{background:linear-gradient(135deg,#dc2626,#b91c1c)!important}" +
    "#rp-toast{position:fixed!important;right:20px!important;bottom:80px!important;z-index:2147483647!important;" +
    "background:rgba(15,23,42,.92)!important;color:#fff!important;border-radius:8px!important;" +
    "padding:10px 16px!important;font-size:13px!important;max-width:360px!important;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.3)!important;opacity:0!important;transition:opacity .3s!important;pointer-events:none!important}" +
    "#rp-toast.show{opacity:1!important}";

  GM_addStyle(css);

  function showToast(msg, duration) {
    var t = document.getElementById("rp-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, duration || 3000);
  }

  function extractJD() {
    var result = { jobTitle: "", company: "", salary: "", city: "", jdText: "", jobUrl: window.location.href };

    // ===== 1. 职位名称 =====
    // .name h1 b → 新版职位详情页标题在<b>里
    var titleEls = document.querySelectorAll(".name h1 b, .name h1");
    if (titleEls.length === 0) {
      titleEls = document.querySelectorAll("h1");
    }
    for (var i = 0; i < titleEls.length; i++) {
      var t = titleEls[i].textContent.trim();
      // 排除薪资格式（含K·薪的）
      if (t && t.length > 1 && !/\d+K/.test(t) && t.length < 40) {
        result.jobTitle = t;
        break;
      }
    }

    // ===== 2. 薪资 =====
    // 薪资格式：30-50K·16薪，在 .salary 容器里
    var salaryEls = document.querySelectorAll(".salary");
    for (var k = 0; k < salaryEls.length; k++) {
      var s = salaryEls[k].textContent.trim();
      // 匹配薪资格式：数字+K
      if (s && /\d+K/.test(s) && s.length < 30) {
        result.salary = s;
        break;
      }
    }

    // ===== 3. 公司名 =====
    // 调试发现：公司名在 .company-name (SPAN) 里
    // 但页面上有多个 .company-name（侧边栏推荐的公司）
    // 正确的那个在职位主信息区域 .job-banner 内，或第一个出现的
    //
    // 策略：找 .company-info .name (DIV class=name) 旁边的 .company-name
    // 或者：找包含 "公司名称" 文字的 LI 里的文字
    //
    // 最终策略：先找 .sider-company .name a / .sider-company .name
    // 如果没有，找 li:contains("公司名称") 后的文字
    var company = "";

    // 方法1: sider-company 区域
    var siderCompany = document.querySelector(".sider-company .name a") || document.querySelector(".sider-company .name");
    if (siderCompany && siderCompany.textContent.trim()) {
      company = siderCompany.textContent.trim();
    }

    // 方法2: .company-info 内的 .name DIV（就是 [0] class=name，但它实际是职位名容器）
    // 跳过这个，因为调试显示它抓到的是职位名

    // 方法3: 找 "公司名称" 文字的 LI 元素，取其后的文字
    if (!company) {
      var lis = document.querySelectorAll("li");
      for (var li = 0; li < lis.length; li++) {
        var liText = lis[li].textContent.trim();
        if (liText.indexOf("公司名称") === 0) {
          // 去掉 "公司名称" 前缀
          company = liText.replace(/^公司名称/, "").trim();
          break;
        }
      }
    }

    // 方法4: 找 .company-info 容器里的 .name（排除 .name h1 职位名容器）
    if (!company) {
      // BOSS直聘的公司信息在 job-detail 右侧栏，class="company-info" 下有 .name
      // 但 .name 可能同时用于职位名，需要找 .company-info 内的 .name
      var companyInfoEls = document.querySelectorAll(".company-info .name, .company-detail .name");
      for (var ci = 0; ci < companyInfoEls.length; ci++) {
        var ct = companyInfoEls[ci].textContent.trim();
        // 排除和职位名一样的
        if (ct && ct !== result.jobTitle && ct.length < 30) {
          company = ct;
          break;
        }
      }
    }

    // 方法5: 从 <title> 标签提取（格式通常是 "公司名-职位名-BOSS直聘"）
    if (!company) {
      var pt = document.title || "";
      var parts = pt.split(/[-_·|]/);
      if (parts.length >= 2) {
        company = parts[0].trim();
      }
    }

    result.company = company;

    // ===== 4. 城市 =====
    var cityEls = document.querySelectorAll(".job-area, .job-area-wrapper, .location");
    for (var m = 0; m < cityEls.length; m++) {
      var ct2 = cityEls[m].textContent.trim();
      if (ct2 && ct2.length < 20) {
        result.city = ct2;
        break;
      }
    }

    // ===== 5. JD 正文 =====
    var jdSelectors = [
      ".job-sec-text",
      ".job-detail-section .text",
      ".job-detail-content",
      ".detail-content",
      ".job-detail .text",
      ".job-description",
      ".detail-section .text",
    ];
    for (var n = 0; n < jdSelectors.length; n++) {
      var el = document.querySelector(jdSelectors[n]);
      if (el && el.innerText.trim().length > 30) {
        result.jdText = el.innerText.trim();
        break;
      }
    }
    if (!result.jdText || result.jdText.length < 30) {
      var mainEl = document.querySelector("main") || document.querySelector("#wrap") || document.querySelector(".page-job") || document.querySelector("#main");
      result.jdText = mainEl ? mainEl.innerText.trim().substring(0, 6000) : document.body.innerText.trim().substring(0, 6000);
    }

    // ===== 6. 技能标签 =====
    var tagEls = document.querySelectorAll(".job-tags .tag-all a, .job-keyword a, .job-tags li, .job-detail-tags li, .tags li");
    var tags = [];
    for (var p = 0; p < tagEls.length; p++) { var tg = tagEls[p].textContent.trim(); if (tg && tg.length < 20) tags.push(tg); }

    // ===== 组装 =====
    var fullJD = "";
    if (result.jobTitle) fullJD += "职位名称：" + result.jobTitle + "\n";
    if (result.company) fullJD += "公司：" + result.company + "\n";
    if (result.city) fullJD += "地点：" + result.city + "\n";
    if (result.salary) fullJD += "薪资：" + result.salary + "\n";
    if (tags.length > 0) fullJD += "技能标签：" + tags.join("、") + "\n";
    fullJD += "\n【职位描述】\n" + result.jdText;
    result.jdText = fullJD;

    return result;
  }

  function sendJD(btn) {
    var data = extractJD();
    if (!data.jdText || data.jdText.length < 20) { showToast("未能提取到JD内容"); return; }
    btn.classList.add("sending"); btn.innerHTML = "发送中…";
    GM_xmlhttpRequest({
      method: "POST", url: API_ENDPOINT, headers: { "Content-Type": "application/json" }, data: JSON.stringify(data),
      onload: function (r) {
        btn.classList.remove("sending");
        if (r.status === 200) {
          btn.classList.add("success"); btn.innerHTML = "✓ 已发送！";
          showToast("已发送：" + data.jobTitle + " @ " + data.company);
          setTimeout(function () { btn.classList.remove("success"); btn.innerHTML = "✨ 发送到简历润色助手"; }, 3000);
        } else { btn.classList.add("error"); btn.innerHTML = "发送失败"; setTimeout(function () { btn.classList.remove("error"); btn.innerHTML = "✨ 发送到简历润色助手"; }, 3000); }
      },
      onerror: function () { btn.classList.remove("sending"); btn.classList.add("error"); btn.innerHTML = "连接失败"; showToast("无法连接localhost:3000"); setTimeout(function () { btn.classList.remove("error"); btn.innerHTML = "✨ 发送到简历润色助手"; }, 4000); },
    });
  }

  function injectButton() {
    if (document.getElementById("rp-float-btn")) return;
    if (!document.getElementById("rp-toast")) { var toast = document.createElement("div"); toast.id = "rp-toast"; document.body.appendChild(toast); }
    var btn = document.createElement("button"); btn.id = "rp-float-btn"; btn.innerHTML = "✨ 发送到简历润色助手";
    document.body.appendChild(btn); btn.addEventListener("click", function () { sendJD(btn); });
  }

  // 菜单
  GM_registerMenuCommand("📌 手动发送当前页面JD", function () {
    var data = extractJD();
    if (!data.jdText || data.jdText.length < 20) { alert("未能提取到JD内容"); return; }
    var confirm = window.confirm("确认发送？\n\n职位: " + data.jobTitle + "\n公司: " + data.company + "\n薪资: " + data.salary + "\n城市: " + data.city);
    if (!confirm) return;
    GM_xmlhttpRequest({
      method: "POST", url: API_ENDPOINT, headers: { "Content-Type": "application/json" }, data: JSON.stringify(data),
      onload: function (r) { alert(r.status === 200 ? "✓ 已发送！" : "失败: " + r.responseText); },
      onerror: function () { alert("❌ 无法连接localhost:3000"); },
    });
  });

  // 启动
  function init() { if (!document.body) return; injectButton(); }
  if (document.body) init();
  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("load", init);
  setTimeout(init, 500); setTimeout(init, 1500); setTimeout(init, 3000); setTimeout(init, 5000);
  var observer = new MutationObserver(function () { if (document.body && !document.getElementById("rp-float-btn")) injectButton(); });
  function startObserver() { if (document.body) observer.observe(document.body, { childList: true, subtree: false }); }
  if (document.body) startObserver(); else document.addEventListener("DOMContentLoaded", startObserver);
  var lastUrl = window.location.href;
  setInterval(function () { if (window.location.href !== lastUrl) { lastUrl = window.location.href; setTimeout(init, 500); setTimeout(init, 2000); } }, 1000);
})();
