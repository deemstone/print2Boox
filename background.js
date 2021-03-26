/*
 * chrome printer provider
 */
'use strict';

const notification_icon = "images/icon-128.png";

const { version: VERSION } = chrome.runtime.getManifest();

function verBigger(vb, vl, equal){
  if( vb === vl ){
    return !!equal;
  }
  const [vb1, vb2, vb3] = vb.split('.').map(s => parseInt(s) || 0);
  const [vl1, vl2, vl3] = vl.split('.').map(s => parseInt(s) || 0);

  if( vb1 < vl1 ){
    return false;
  }else if( vb2 < vl2 ){
    return false;
  }else if( vb3 < vl3 ){
    return false;
  }
  return true;
}

chrome.runtime.onInstalled.addListener(function(details) {
  const {reason, previousVersion} = details;
  ga('send', 'event', 'onInstalled', VERSION, reason, previousVersion);
  if( reason === 'update' ){
    // 0.0.6 增加了bucket逻辑，国外用户应该可以正常使用了
    if( verBigger('0.0.6', previousVersion) ){
      chrome.notifications.create('installed'+ Date.now(), {
        type: "basic",
        iconUrl: notification_icon,
        title: chrome.i18n.getMessage("update_installed", ['0.0.6']),
        message: chrome.i18n.getMessage("update_comment_0_0_6"),
        //expandedMessage: "",
        priority: 1,
      }, function(nid){
        // 4s 后自动关闭
        setTimeout(() => {
          chrome.notifications.clear(nid);
        }, 10000)
      });
    }
    // 0.0.5 增加了新版官网的支持，并支持push.boox.com网站账号
    if( verBigger('0.0.5', previousVersion) ){
      chrome.notifications.create('installed'+ Date.now(), {
        type: "basic",
        iconUrl: notification_icon,
        title: chrome.i18n.getMessage("update_installed"),
        message: chrome.i18n.getMessage("update_comment_0_0_5"),
        //expandedMessage: "",
        priority: 1,
      }, function(nid){
        // 4s 后自动关闭
        setTimeout(() => {
          chrome.notifications.clear(nid);
        }, 10000)
      });
    }
    // 0.0.3 icon链接错了 导致notification都不出了，这里提示一下
    if( previousVersion === '0.0.3' ){
      chrome.notifications.create('loginSuccess'+ Date.now(), {
        type: "basic",
        iconUrl: notification_icon,  // TODO: user.avatarUrl 将图片取回来用blob显示
        title: "Bug fixed",
        message: 'Bug fixed! Now, notification will pop-up when you print.',
        //expandedMessage: "",
        priority: 1,
      }, function(nid){
        // 4s 后自动关闭
        setTimeout(() => {
          chrome.notifications.clear(nid);
        }, 10000)
      });
    }
  }

  return;
});

// copy from send2boox.app.js
const Util = {
  guid: function guid() {
    return Util.s4() + Util.s4() + '-' + Util.s4() + '-' + Util.s4() + '-' + Util.s4() + '-' + Util.s4() + Util.s4() + Util.s4();
  },
  uuid: function uuid() {
    return Util.s4() + Util.s4() + Util.s4() + Util.s4() + Util.s4() + Util.s4() + Util.s4() + Util.s4();
  },
  s4: function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
};

var CAPABILITIES = ' {      "version": "1.0",      "printer": {       "supported_content_type": [          {"content_type": "application/pdf","min_version":"1.5","max_version":"1.5"},          {"content_type": "image/pwg-raster"}        ],        "copies": {          "default": 1,          "max": 100        },        "color":{          "option": [            {"type":  "STANDARD_COLOR", "is_default":  true},            {"type":  "STANDARD_MONOCHROME"}          ]        },        "duplex":{          "option": [            {"type": "NO_DUPLEX", "is_default":  true },            {"type": "LONG_EDGE"},            {"type": "SHORT_EDGE"}          ]        },        "collate": { "default": true},        "page_orientation":{"option":[{"type":"PORTRAIT","is_default":true},{"type":"LANDSCAPE"}]},        "margins":{"option":[{"type":"BORDERLESS","top":0,"left":0,"right":0,"bottom":0},{"type":"STANDARD","is_default":true},{"type":"CUSTOM"}]},        "media_size": {      "option": [        {          "name": "ISO_A4",          "width_microns": 210000,          "height_microns": 297000,          "is_default": false        },         {          "name": "ISO_A5",          "width_microns": 105000,          "height_microns": 148500,          "is_default": false        },        {          "name": "NA_INDEX_4X6",          "width_microns": 100000,          "height_microns": 150000        },        {          "name": "NA_LETTER",          "width_microns": 215900,          "height_microns": 279400,          "is_default": true        }      ]    }      }    } ';
const cdd = JSON.parse(CAPABILITIES);

const openedTabs = {
  /* tabId: any */
};

async function gotoLogin(domain){
  if( !domain ){
    throw new Error('gotoLogin need domain!');
  }
  // 用户点击确认后 新开tab去登录
  // 只管打开，不管是否登录成功，
  // 后面webRequest的监听会异步等待登录成功
  chrome.tabs.create({
    active: true,
    url: `http://${domain}/`,
  }, function(tab) {
    // 只有记录到这里的tabId 触发登录成功才会弹出notification
    openedTabs[tab.id] = tab;

  });
}

// 我们打开的tab 再弹出的tab 也要记录一下
// 比如 网站登录时选择“微信登录”会新开tab
chrome.tabs.onCreated.addListener(function(tab){
  const { openerTabId } = tab;
  if( openedTabs[openerTabId] ){
    openedTabs[tab.id] = tab;
  }
})

// tab关闭时清理相关记录
chrome.tabs.onRemoved.addListener(function (tabId){
  if(openedTabs[tabId]){
    delete openedTabs[tabId];
  }
});

// 监听ajax请求，寻找登录成功的 特征
chrome.webRequest.onCompleted.addListener(function(details){
  const { tabId, url, type, statusCode } = details;

  // 只关心ajax请求
  if( type !== 'xmlhttprequest' ){
    return;
  }

  if( statusCode !== 200 ){
    return;
  }

  // 注意：这个特征请求可能随时会变动
  if(
    !url.includes('users/getDevice/')  // 升级笔记功能之前的旧版网站，是直接进入推送界面的
    && !url.includes('/im/getSig') // 新版在线笔记功能
  ){
    return;
  }

  const siteDomain = (new URL(url)).hostname;

  // 确定是登录成功了，从localstorage中取回token

  // 用content-script拿到token
  chrome.tabs.executeScript(tabId, {
    code: `
      ['token'].reduce( (r, n) => {
        r[n] = localStorage.getItem(n);
        return r;
      }, {});
    `
  }, async function(r) {
    // 返回的r是个数组
    const token = r[0].token;
    console.log('got token: ', token);

    const userinfo = await fetch(`http://${siteDomain}/api/1/users/me`, {
      method: 'get',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }).then(response => response.json());
    const user = {
      token: token,
      userName: userinfo.data.nickname,
      userId: userinfo.data.id,
      userUid: userinfo.data.uid,
      avatarUrl: userinfo.data.avatarUrl
    }

    // 不自动销毁窗口
    // chrome.tabs.remove(tab.id);
    loginSuccess(user, siteDomain);

    // 如果是用户在此extension上主动触发的登录
    // 给一个notification提示
    if( openedTabs[tabId] ){
      chrome.notifications.create('loginSuccess'+ Date.now(), {
        type: "basic",
        iconUrl: notification_icon,  // TODO: user.avatarUrl 将图片取回来用blob显示
        title: "BooxPrinter",
        message: chrome.i18n.getMessage("login_success", [user.userName]),
        priority: 1,
      }, function(nid){
        // 4s 后自动关闭
        setTimeout(() => {
          chrome.notifications.clear(nid);
        }, 4000)
      });
      delete openedTabs[tabId];
    }
  });
}, {urls: ["*://send2boox.com/*", "*://push.boox.com/*"]});

// 登录成功，token存起来，界面上修改提示状态
function loginSuccess(user, siteDomain){
  const data = Object.assign({
    boox_auth_token: user.token,
    siteDomain, // 此账号所属站点
    version: VERSION, // 当前插件版本（升级时判断）
  }, user);

  chrome.storage.local.set(data, function() {
    console.log('已存储：', JSON.stringify(data));
  });
}


// 处理桌面通知交互
chrome.notifications.onClicked.addListener(function (nid){
  console.log('notification onClick: ', nid);
  // 推送失败 401错误的消息 点击去登录
  if( nid.indexOf('gotoLogin') === 0){
    gotoLogin();
  }
});
chrome.notifications.onClosed.addListener(function (nid, byUser){
  console.log('notification onClose: ', nid, byUser)
});
chrome.notifications.onButtonClicked.addListener(function (nid, btnIndex){
  console.log('notification onBtnClick: ', nid, btnIndex);
});

// 从storage中取共享的token 无论是否存在
async function getToken(){
  return new Promise((resolve, reject) => {

    chrome.storage.local.get(['boox_auth_token', 'siteDomain', 'version', 'userUid'], function(result) {
      const token = result.boox_auth_token;
      const { siteDomain, userUid } = result;

      // 提示重新登录 才能拿到账号的站点
      if( !siteDomain || !userUid ){
        return reject( new Error(chrome.i18n.getMessage("please_login_first")) );
      }

      resolve({ token, siteDomain, userUid });
    });
  })
}

// printer Provider
chrome.printerProvider.onGetPrintersRequested.addListener(async function(e) {
  e([{
    id: "Print to Boox",
    name: "Print to Boox"
  }]);
});

chrome.printerProvider.onGetCapabilityRequested.addListener(function(e, r) {
  console.log('onGetCapabilityRequested()', e, r);
  return r(cdd);
});

chrome.printerProvider.onPrintRequested.addListener(async function(e, r) {
  console.log('onPrintRequested()', e, r)

  try{
    const res = await pushFile(e)
    return r("OK");
  }catch(e) {
    console.error('pushFile Failed');
    console.error(e);
    return r("FAILED");
  };
});


window.ossClient = null;  // client放到全局缓存
async function getOssClient(API_PREFIX) {
  // if( window.ossClient ){
  //   return window.ossClient;
  // }
  // 因为有效期比auth短 每次都更新stsToken
  const { data: creds } = await fetch(`${API_PREFIX}/stss/`, {
    method: 'get'
  }).then(response => response.json());
  // { "result_code": 0, "message": "SUCCESS"
  // "data": { "region": "oss-cn-shenzhen", "bucket": "onyx-cloud", "endpoint": "cloud.send2boox.com" }, }
  const { data: zone } = await fetch(`${API_PREFIX}/push/bucket`, {
    method: 'get'
  }).then(response => response.json());

  const bucket = zone.bucket; // 'onyx-content';
  const region = zone.region; //'oss-cn-shenzhen';

  const client = new OSS({
    region: region,
    accessKeyId: creds.AccessKeyId,
    accessKeySecret: creds.AccessKeySecret,
    stsToken: creds.SecurityToken,
    bucket: bucket
  });
  window.ossClient = client;

  return window.ossClient;
}

// {
//   "contentType": "application/pdf",
//   "document": "Blob",
//   "printerId": "Print to Boox",
//   "ticket": {
//     "print": {
//       "collate": {
//         "collate": true
//       },
//       "color": {
//         "type": "STANDARD_COLOR"
//       },
//       "copies": {
//         "copies": 1
//       },
//       "duplex": {
//         "type": "NO_DUPLEX"
//       },
//       "media_size": {
//         "height_microns": 279400,
//         "width_microns": 215900
//       },
//       "page_orientation": {
//         "type": "PORTRAIT"
//       }
//     },
//     "version": "1.0"
//   },
//   "title": "Cloud Device Description  |  Cloud Print  |  Google Developers"
// }
async function pushFile(task) {

  ga('send', 'event', 'pushFile', 'start');

  const { contentType, document: fileBlob, title } = task;
  // 写入推送消息
  async function postData(data, token, API_PREFIX) {
    // const json = {
    //     "data":{
    //         "name":"西潮与新潮_-_蒋梦麟.epub",
    //         "title":"西潮与新潮_-_蒋梦麟.epub",
    //         "resourceType":"epub",
    //         "resourceKey":"dba1c1e3207b0592ed2643e425ffd6a5.epub",
    //         "resourceDisplayName":"西潮与新潮_-_蒋梦麟.epub"
    //     },
    //     "type":"digital_content"
    // };
    var obj = {
      data: data,
      type: 'digital_content'
    };
    return await fetch(`${API_PREFIX}/push/saveAndPush`,{
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
      headers: {
        'Content-Type': 'application/json',
        // 'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': token, //window.auth,
      },
      redirect: 'follow', // manual, *follow, error
      // referrer: 'no-referrer', // no-referrer, *client
      body: JSON.stringify(obj)
    });
  };

  // 从 print task 上取信息
  function dataObj(userUid) {
    var ext = contentType.split('/').pop();
    // 官网源码：this.local.get("userUid") + "/push/" + m.a.uuid() + "." + r
    var key = `${userUid}/push/${Util.uuid()}.${ext}`;
    var data = {};
    const filename = `${title}.${ext}`;  // 必须带上正确的扩展名，否则阅读器上无法正常下载
    data.name = filename;
    data.title = filename;
    data.resourceType = ext;
    data.resourceKey = key;
    data.resourceDisplayName = filename;
    return data;
  };

  let data = {};

  try{
    const { token, siteDomain, userUid } = await getToken();
    data = dataObj(userUid);
    const API_PREFIX = `http://${siteDomain}/api/1`;
    // 上传到OSS
    const client = await getOssClient(API_PREFIX);
    const ossRes = await client.put(data.resourceKey, fileBlob);
    // 推送
    data.bucket = client.options.bucket; // boox多站点之后的新参数
    const res = await postData(data, token, API_PREFIX);

    // 如果未登录
    if( res.status === 401 ){
      chrome.notifications.create('gotoLogin'+ Date.now(), {
        type: "basic",
        iconUrl: notification_icon,
        title: "BooxPrinter",
        message: chrome.i18n.getMessage("please_login_first", [siteDomain]),
        priority: 1,
      });
      return;
    }
    // 如果api请求失败
    if( res.status !== 200 ){
      throw new Error(`http status = ${res.status}`);
    }

    chrome.notifications.create('pushSuccess'+ Date.now(), {
      type: "basic",
      iconUrl: notification_icon,
      title: "BooxPrinter",
      message: chrome.i18n.getMessage("push_success", [data.name]),
      //expandedMessage: "",
      priority: 1,
    }, function(nid){
      // 4s 后自动关闭
      setTimeout(() => {
        chrome.notifications.clear(nid);
      }, 4000)
    });
    ga('send', 'event', 'pushFile', 'success');

  } catch(e){
    //TODO: 失败的任务 如果已经上传oss，可以续传
    chrome.notifications.create('pushFailed'+ Date.now(), {
      type: "basic",
      iconUrl: notification_icon,
      title: chrome.i18n.getMessage("push_failed_title", [data.name]),
      message: `Error: ${e.message}`,
      priority: 1,
    });
    ga('send', 'event', 'pushFile', 'failed', e.message);

    throw e;
  }
}

// function cutString(str, n){
//   if( str.length > n ){
//     return `${str.substr(n)}...`;
//   }
//   return str;
// }
