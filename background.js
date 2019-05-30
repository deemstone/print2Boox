/*
 * chrome printer provider
 */
'use strict';

chrome.runtime.onInstalled.addListener(function() {
	chrome.storage.sync.set({
		color: '#3aa757'
	},
	function() {
		console.log('The color is green.');
	});
	chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
		chrome.declarativeContent.onPageChanged.addRules([{
			conditions: [new chrome.declarativeContent.PageStateMatcher({
				pageUrl: {
					hostEquals: 'developer.chrome.com'
				},
			})],
			actions: [new chrome.declarativeContent.ShowPageAction()]
		}]);
	});
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

window.stss = null;
window.auth = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjA0ODMsInd4VW5pb25pZCI6Im9JdWJZdm42SkRsUWdLVEQwc0ZEOGdDVzFZVGsiLCJpYXQiOjE1NTg5NjgzMDEsImV4cCI6MTU2MTU2MDMwMX0.9xhHHf3yn1DtJ-aJrJ7-oaf3rypVXwru9_il0Ij8Z2Y';

var CAPABILITIES = ' {      "version": "1.0",      "printer": {       "supported_content_type": [          {"content_type": "application/pdf","min_version":"1.5","max_version":"1.5"},          {"content_type": "image/pwg-raster"}        ],        "copies": {          "default": 1,          "max": 100        },        "color":{          "option": [            {"type":  "STANDARD_COLOR", "is_default":  true},            {"type":  "STANDARD_MONOCHROME"}          ]        },        "duplex":{          "option": [            {"type": "NO_DUPLEX", "is_default":  true },            {"type": "LONG_EDGE"},            {"type": "SHORT_EDGE"}          ]        },        "collate": { "default": true},        "page_orientation":{"option":[{"type":"PORTRAIT","is_default":true},{"type":"LANDSCAPE"}]},        "margins":{"option":[{"type":"BORDERLESS","top":0,"left":0,"right":0,"bottom":0},{"type":"STANDARD","is_default":true},{"type":"CUSTOM"}]},        "media_size": {      "option": [        {          "name": "ISO_A4",          "width_microns": 210000,          "height_microns": 297000,          "is_default": false        },         {          "name": "ISO_A5",          "width_microns": 105000,          "height_microns": 148500,          "is_default": false        },        {          "name": "NA_INDEX_4X6",          "width_microns": 100000,          "height_microns": 150000        },        {          "name": "NA_LETTER",          "width_microns": 215900,          "height_microns": 279400,          "is_default": true        }      ]    }      }    } ';
const cdd = JSON.parse(CAPABILITIES);

chrome.printerProvider.onGetPrintersRequested.addListener(function(e) {
	var r = [];

    if(!window.auth ){
        //TODO:
        chrome.notifications.create('onGetPrintersRequested', {
            type: "basic",
            iconUrl: "images/get_started32.png",
            title: "Print message",
            message: "请先登录send2Boox",
            //expandedMessage: "",
            priority: 1,
            //buttons: [{
            //    title: "go!"
            //},{
            //    title: "abort"
            //}]
        });
    }else{
        r.push({
            id: "Print to Boox",
            name: "Print to Boox"
        });
        e(r);
    }
});

chrome.printerProvider.onGetCapabilityRequested.addListener(function(e, r) {
	console.log('onGetCapabilityRequested()', e, r);
	return r(cdd);
});

chrome.printerProvider.onPrintRequested.addListener(function(e, r) {
	console.log('onPrintRequested()', e, r)
    
    pushFile(e)
    .then( res => {
        return r("OK");
    })
    .catch(e => {
        console.error('pushFile Failed');
        console.error(e);
        return r("FAILED");
    });
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
    async function postData(data) {
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
                'Authorization': window.auth,
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

    var data = dataObj();

    // 上传到OSS
    const client = await getOssClient();
    const ossRes = await client.put(data.resourceKey, fileBlob);
    console.log('oss response: ', ossRes);
    // 推送
    await postData(data);
}
