var cheerio = require("cheerio");
var request = require("request");
var Promise = require("promise");

var site = 'http://www.gi.alaska.edu';
var mainUrl = 'AuroraForecast';
var europeLinkRegex = /.*\/Europe\/\d\d\d\d\d\d\d\d/;
var levelRegex = /level-(\d)l/;
var maxDays = 7;


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

var getEuropeLink = function(data) {
    var link = null;
    var $ = cheerio.load(data);
    $('.map li a').each(function(i, element) {
        if ('href' in element.attribs && europeLinkRegex.test(element.attribs.href)) {
            link = site + element.attribs.href;
        }
    });
    return link;
};

var getForecast = function(data) {
    var $ = cheerio.load(data);
    var levels = $('.levels span');
    if (levels.length > 0) {
        var className = levels[0].attribs.class;
        var match = levelRegex.exec(className);
        if (match) {
            return match[1];
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

var getForecastPage = function(link, promise) {

    var success, error;
    var forecasts = [];
    if (!promise) {
        promise = new Promise(function(resolve, reject) {
               success = resolve;
                error = reject;
        });
    }

    function pageFetcher(pageLink) {
        promiseRequest(pageLink).then(function (data) {
            var forecast = {};
            forecast.value = getForecast(data);
            forecast.url = pageLink;
            forecast.next = getNextDay(data);
            forecasts.push(forecast);
            if (!forecast.next || forecasts.length === maxDays) {
                success(forecasts);
            } else {
                pageFetcher(forecast.next);
            }
        }, function (err) {
            error(err);
        });
    }

    pageFetcher(link);

    //var success, error;
    //
    //if (!promise) {
    //    promise = new Promise(function(resolve, reject) {
    //       success = resolve;
    //        error = reject;
    //    });
    //}
    //
    //if (!forecasts) {
    //    forecasts = [];
    //}
    //
    //console.log(success);
    //
    //promiseRequest(link).then(function (data) {
    //    var forecast = {};
    //    forecast.value = getForecast(data);
    //    forecast.url = link;
    //    forecast.next = getNextDay(data);
    //    forecasts.push(forecast);
    //    if (!forecast.next || forecasts.length === maxDays) {
    //        success(forecasts);
    //    } else {
    //        getForecastPage(forecast.next, promise, forecasts);
    //    }
    //}, function (err) {
    //    error(err);
    //});
    //
    return promise;
};

var indexUrl = site + "/" + mainUrl;

request(indexUrl, function(error, response, html) {

    if(!error){
        var euLink = getEuropeLink(html);
        getForecastPage(euLink).then(function(pageData) {
            console.log(pageData);
        }, function(err) {
            console.log(err);
        });

    }
});