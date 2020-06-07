'use strict';

localizeHtmlPage(); // 会导致事件绑定失效

let gotoLogin1 = document.getElementById('gotoLogin_s2b');

gotoLogin1.onclick = function(element) {
  // 触发 background 中的 gotoLogin 方法完成登录
  chrome.runtime.getBackgroundPage(function(w){
    w.gotoLogin('send2boox.com');
  });
};

let gotoLogin2 = document.getElementById('gotoLogin_pb');

gotoLogin2.onclick = function(element) {
  // 触发 background 中的 gotoLogin 方法完成登录
  chrome.runtime.getBackgroundPage(function(w){
    w.gotoLogin('push.boox.com');
  });
  
  // let color = element.target.value;
  // chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  //   chrome.tabs.executeScript(
  //       tabs[0].id,
  //       {code: 'document.body.style.backgroundColor = "' + color + '";'});
  // });
};

// 如果有登录信息，显示到界面上
chrome.storage.local.get(['userName', 'avatarUrl' ], function(user){
  if( user.userName ){
    document.getElementById('user_name').innerText = user.userName;
    document.getElementById('avatar').setAttribute('src', user.avatarUrl);
  }
})

function localizeHtmlPage()
{
    //Localize by replacing __MSG_***__ meta tags
    var objects = document.getElementsByTagName('html');
    for (var j = 0; j < objects.length; j++)
    {
        var obj = objects[j];

        var valStrH = obj.innerHTML.toString();
        var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1)
        {
            return v1 ? chrome.i18n.getMessage(v1) : "";
        });

        if(valNewH != valStrH)
        {
            obj.innerHTML = valNewH;
        }
    }
}

