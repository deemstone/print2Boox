'use strict';

let gotoLogin = document.getElementById('gotoLogin');

gotoLogin.onclick = function(element) {
  // 触发 background 中的 gotoLogin 方法完成登录
  chrome.runtime.getBackgroundPage(function(w){
    w.gotoLogin();
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

