/**
 * This object represents a Twitter searcher. It gets the tweet timeline for a particular user and searches for content I'm interested in.
 */


var cfg         = require('config');
var fs          = require('fs');
var request     = require('request');
var SiteTrawler = require('./SiteTrawler.js');


/**
 * Basic request params for all calls to Twitter
 */
var twitterRequestDefaults = {
  baseUrl : 'https://api.twitter.com/1.1',
  json : true,
  oauth: {
    consumer_key: cfg.twitter.consumerKey,
    consumer_secret: cfg.twitter.consumerSecret,
    token: cfg.twitter.accessToken,
    token_secret: cfg.twitter.accessTokenSecret
  }
}

if (cfg.has('connectionTimeout')) { twitterRequestDefaults.timeout = cfg.connectionTimeout }


var twitterRequest = request.defaults(twitterRequestDefaults)



class TwitterTrawler extends SiteTrawler {

  /**
   * TwitterTrawler model constructor.
   * @param {object}   params               - Params to be passed in
   * @param {string}   params.id            - English name for the trawler instance. Will be used as a unique identifier.
   * @param {number=}  params.maxResults    - Max number of results to be returned from the site being trawled. (optional)
   * @param {string}   params.twitterId     - Twitter handle of the twitter account whose stream you want to read.
   * @param {regex[]}  params.regexMatches  - A regular expression to run against the tweet. If provided, only tweets matching this regex will be returned. Optional arg
   * @constructor
   */
  constructor(params) {

    var superArgs = {}
    superArgs.regexMatchField     = "text"
    superArgs.recordHighestSeenId = true
    superArgs.subClassSetup       = params

    super(superArgs)

    this.twitterId    = params.twitterId


  }

}

var method = TwitterTrawler.prototype


/**
 * TwitterTrawler.getResultsString
 *
 * @desc Get an English string describing the contents of the results. This function needs to be overridden by each trawler subclass.
 *
 * @alias TwitterTrawler.getResultString
 *
 */
method.getResultsString = function () {

  var ret = ""

  for (var i = 0; i < this.results.length; i++) {
    ret += "<br>" + this.results[i].text.replace(/\n|\r/g)
  }

  this.log('info', ret)

  return ret
}


/**
 * TwitterTrawler.loadResults
 *
 * @desc Get the tweets
 *
 * @alias TwitterTrawler.loadResults
 *
 * @param  {object} params     - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, tweets[])
 *                               where tweets are objects of the form {
 *                                 id: twitter Id
 *                                 content: the text of the tweet
 *                               }
 */
method.loadResults = function (params,cb) {

  var self = this

  self.log('info', 'Getting tweets from @' + self.twitterId + '...')

  var qs = {
    screen_name: self.twitterId,
    trim_user: true,
    exclude_replies: true
  }

  if (self.maxResults)              { qs.count    = self.maxResults }
  if (self.savedData.highestSeenId) { qs.since_id = self.savedData.highestSeenId }

  twitterRequest.get({
    uri: 'statuses/user_timeline.json',
    qs: qs
  }, function (err, resp, tweets) {

    var errMsg = ""

    if (err) {
      var errMsg = err
    } else if (resp.statusCode > 200) {
      var errMsg = '(' + resp.statusCode + ') ' + JSON.stringify(resp.body)
    }

    if (errMsg != "") {
      self.log('error', errMsg)
      cb(errMsg)
      return null
    }

    self.log('debug', 'Twitter response - {' + resp.body + '}')
    self.log('debug', 'Twitter response headers - {' + JSON.stringify(resp.headers,null,"\t") + '}')


    // Extract the relevant information and send back in the format prescribed by the superclass
    // The tweets come in in descending chronological order so start at the end and come back down to find the latest
    for (var i = (tweets.length - 1); i >= 0; i--) {
      var tweet = tweets[i]

      self.results.push({
        id   : tweet.id,
        text : tweet.text,
        date : tweet.created_at
      })
    }

    cb(null)

  })
}



module.exports = TwitterTrawler
