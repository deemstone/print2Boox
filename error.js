// (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
// (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
// m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
// })(window,document,'script','/analytics.js','ga');

ga('create', 'UA-169188013-1', 'auto');
ga('set', 'checkProtocolTask', null); // Disables file protocol checking.
ga('send', 'pageview');
ga('set', 'transport', 'xhr');

window.onerror = function(e){
  console.error('trackError: ', e);
  ga('send', 'exception', e.message, e.stack);
}
