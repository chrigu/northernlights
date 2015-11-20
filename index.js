var cheerio = require("cheerio"),
    request = require("request"),
    Promise = require("promise"),
    Rx = require("rx"),
    EventEmitter = require('events').EventEmitter,
    Twitter = require('node-twitter');
    config = require('./const');

var site = 'http://www.gi.alaska.edu';
var mainUrl = 'AuroraForecast';
var europeLinkRegex = /.*\/Europe\/\d\d\d\d\d\d\d\d/;
var levelRegex = /level-(\d)l/;
var maxDays = 14;

var days = 0;

twitter = new Twitter.RestClient(
    config.CONSUMER_KEY,
    config.CONSUMER_KEY_SECRET,
    config.ACCESSTOKEN,
    config.ACCESSTOKEN_SECRET
);


var promiseRequest = function(url) {
    return new Promise(function (resolve, reject) {
        request({url:url}, function (err, res, body) {
            if (err) {
                return reject(err);
            } else if (res.statusCode !== 200) {
                err = new Error("Unexpected status code: " + res.statusCode);
                err.res = res;
                return reject(err);
            }
            resolve(body);
        });
    });
};

var getEuropeLink = function(data, emitter) {
    var link = null;
    var $ = cheerio.load(data);

    $('.map li a').each(function(i, element) {
        if ('href' in element.attribs && europeLinkRegex.test(element.attribs.href)) {
            link = site + element.attribs.href;
        }
    });

    emitter.emit('pageLink', link);
};

var getForecast = function(data) {
    var $ = cheerio.load(data),
        levels = $('.levels span'),
        title = $('.title h1.title');

    if (levels.length > 0) {
        var className = levels[0].attribs.class;
        var match = levelRegex.exec(className);
        if (match) {
            return {title: title[0].children[0].data, forecast: match[1]};
        }
    }
    return null;
};


var getNextDay = function(data) {
    var $, link = null;

    $ = cheerio.load(data);
    $('.controls .next-link').each(function(i, element) {
        if (element.children.length > 0 && element.children[0].data === "Next") {
            link = site + element.attribs.href;
            return false;
        }
    });
    return link;
};


var tweet = function(message) {
    console.log(message);
    twitter.statusesUpdate(
        { status: message
            //, in_reply_to_status_id: 357237590082072576
        }
        , function (err, data) {
            if (err) {
                console.error(err);
            } else {
                console.log(data);
            }
        }
    );
};


var indexUrl = site + "/" + mainUrl;

request(indexUrl, function(error, response, html) {

    if(!error){
        //var euLink = getEuropeLink(html);
        var eventEmitter = new EventEmitter();

        var source = Rx.Observable.fromEvent(
            eventEmitter,
            'pageLink',
            function (link) { return link;});

        //var pageLinkStream = Rx.Observable.fromPromise(getEuropeLink(html));

        var pageContentStream = source
            .flatMap(function(link) {
                return Rx.Observable.fromPromise(promiseRequest(link));
            });

        var foreCastStream = pageContentStream
            .map(function(content) {
                return getForecast(content);
            });

        var forCastSum3Days = foreCastStream
            .bufferWithCount(3,1);

        var forCastSum2Days = foreCastStream
            .bufferWithCount(2,1);

        var pageNextLinkStream = pageContentStream
            .map(function(content) {
                var link = getNextDay(content);
                eventEmitter.emit('pageLink', link);
                return link;
            });

        forCastSum3Days.subscribe(function(forecasts) {

            var threeDaySum = parseInt(forecasts[0].forecast) + parseInt(forecasts[1].forecast)
                            + parseInt(forecasts[2].forecast);

            console.log("sliding window 3 days: " + threeDaySum);
            if (threeDaySum > 12) {
                tweet("Three day sum is " + threeDaySum + " on " + forecasts[0].title);
            }
        });

        forCastSum2Days.subscribe(function(forecasts) {
            var twoDaySum = parseInt(forecasts[0].forecast) + parseInt(forecasts[1].forecast);
            console.log("sliding window 2 days: " + twoDaySum);
            if (twoDaySum > 8) {
                tweet("Two day sum is " + twoDaySum + " on " + forecasts[0].title);
            }
        }, 0);


        pageNextLinkStream.subscribe(function(link) {
            console.log(link);
            if (days > maxDays) {
                process.exit()
            };
            days += 1;
        });

        getEuropeLink(html, eventEmitter);

    }
});
