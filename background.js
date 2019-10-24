/*
 * chrome printer provider
 */
'use strict';

chrome.runtime.onInstalled.addListener(function() {
  // TODO: 弹出使用说明（或者版本新功能的说明）
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

async function gotoLogin(){
  return new Promise((resolve, reject) => {
    // 用户点击确认后 新开tab去登录
    chrome.tabs.create({
      active: false,
      url: 'http://send2boox.com/',
    }, function(tab) {
      //TODO: 等待登录过程 页面跳转？监听某个事件？
      // 用content-script拿到token
      chrome.tabs.executeScript(tab.id, {
        code: 'localStorage.getItem("token");'
      }, function(r) {
        const token = r[0];
        console.log('got token: ', token);
        chrome.tabs.remove(tab.id);
        // 返回的r是个数组
        chrome.storage.sync.set({'boox_auth_token': token}, function() {
          resolve(token);
        });
      });
    });
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

    chrome.storage.sync.get(['boox_auth_token'], function(result) {
      const token = result.boox_auth_token;
      console.log('old got: ' + token);

      resolve(token);
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

const API_PREFIX = 'http://send2boox.com/api/1';

window.ossClient = null;  // client放到全局缓存
async function getOssClient() {
  if( !window.ossClient ){
    const bucket = 'onyx-content';
    const region = 'oss-cn-shenzhen';

    const client = new OSS({
      region: region,
      accessKeyId: '__fake__', // creds.AccessKeyId,
      accessKeySecret: '__fake__', // creds.AccessKeySecret,
      stsToken: '__fake__', // creds.SecurityToken,
      bucket: bucket
    });
    window.ossClient = client;

  }

  // 因为有效期比auth短 每次都更新stsToken
  const { data: creds } = await fetch(`${API_PREFIX}/stss/`, {
    method: 'get'
  }).then(response => response.json());

  window.ossClient.options.accessKeyId = creds.AccessKeyId;
  window.ossClient.options.accessKeySecret = creds.AccessKeySecret;
  window.ossClient.options.stsToken = creds.SecurityToken;

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
  const { contentType, document: fileBlob, title } = task;
  // 写入推送消息
  async function postData(data, token) {
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
  function dataObj() {
    var ext = contentType.split('/').pop();
    var key = Util.uuid() + '.' + ext;
    var data = {};
    const filename = `${title}.${ext}`;  // 必须带上正确的扩展名，否则阅读器上无法正常下载
    data.name = filename;
    data.title = filename;
    data.resourceType = ext;
    data.resourceKey = key;
    data.resourceDisplayName = filename;
    return data;
  };
  const token = await getToken();
  var data = dataObj();

  try{
    // 上传到OSS
    const client = await getOssClient();
    const ossRes = await client.put(data.resourceKey, fileBlob);
    console.log('oss response: ', ossRes);
    // 推送
    const res = await postData(data, token);

    // 如果未登录
    if( res.status === 401 ){
      chrome.notifications.create('gotoLogin', {
        type: "basic",
        iconUrl: "images/get_started32.png",
        title: "BooxPrinter",
        message: `请先登录send2Boox（点击登录）`,
        //expandedMessage: "",
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
      iconUrl: "images/get_started32.png",
      title: "BooxPrinter",
      message: `推送成功：${data.name}`,
      //expandedMessage: "",
      priority: 1,
    }, function(nid){
      // 4s 后自动关闭
      setTimeout(() => {
        chrome.notifications.clear(nid);
      }, 4000)
    });

  }catch(e){
    //TODO: 失败的任务 如果已经上传oss，可以续传
    chrome.notifications.create('pushFailed'+ Date.now(), {
      type: "basic",
      iconUrl: "images/get_started32.png",
      title: "BooxPrinter",
      message: `推送失败：${data.name}, Error:${e.message}`,
      //expandedMessage: "",
      priority: 1,
    });

    throw e;
  }
}
