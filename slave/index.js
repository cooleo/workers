var cheerio = require('cheerio');
var request = require('request');
var WebSocket = require('ws');
var url = require('url');

function Slave(options){
    this.init(options);
    this.crawlQueue = [];
};

Slave.prototype.init = function(options){
    var self = this;
    var ws = new WebSocket('ws://' + options.host);

    this.ws = ws;

    ws.on('error', function(){
       console.log('error connecting master on ' + options.host);
        process.exit();
    });

    ws.on('open', function open() {
        self.log('connected ' + options.host);
        self.log('awaiting url to crawl...');
    });

    ws.on('message', function(data, flags) {
        var message = JSON.parse(data);
        var type = message.type;

        switch (type) {
            case 'crawl':{
                var URLs = message.data.urls;
                console.log('received to crawl', URLs);
                self.log('queued processing ' + URLs.length + ' urls...');
                self.crawlQueue = self.crawlQueue.concat(URLs);
                console.log('total urls added to pool: ', self.crawlQueue.length);
            }
                break;

            case 'info':{
                self.log(message.data.message);
            }
                break;
        }
    });

    ws.on('close', function(){
       console.log('connection closed');
    });

    setInterval(function(){
            var link = self.crawlQueue.pop();
            if (link) {
                self.crawl(link, function(err, data){
                    if (!err) {
                        ws.send(JSON.stringify({type: 'urls', data: {urls: data.urls}}));
                        ws.send(JSON.stringify({type: 'html', data: {html: data.html, url: data.url}}));
                    } else {
                        console.log(err);
                    }
                });
            } else {
                ws.send(JSON.stringify({type: 'ready'}));
            }
    }, 1000 * options.requestInterval);
};

Slave.prototype.crawl = function(baseUrl, callback){
    var self = this;
    var start = (new Date()).getTime();
    var discoveredUrls = [];

    request.get(baseUrl, function(err, data){

        if (err) {
            if (callback instanceof Function) {
                callback(err, {});
                return;
            }
        }

        var i = 0, html = data.body;
        $ = cheerio.load(html);

        $('a').each(function(){
            var a = $(this);
            var href = '';
            href = a.attr('href');
            if (href) {
                if (href.indexOf('http') === -1) {
                    href = url.resolve(baseUrl, href);
                }
                discoveredUrls.push(href);
                i++;
            }
        });

        var end = (new Date()).getTime();

        if (callback instanceof Function){
            callback(err, {html: html, url: baseUrl, timeElapsed: end - start, urls: discoveredUrls});
        }
    });
};

Slave.prototype.log = function(message){
    console.log( (new Date()) +' \t' + message);
};

module.exports = Slave;